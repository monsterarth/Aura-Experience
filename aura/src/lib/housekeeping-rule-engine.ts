// Motor central de avaliação de regras de automação de governança.
// Toda geração automática de tarefas passa por aqui — sem hardcoding nos crons ou serviços.

import { supabaseAdmin } from "@/lib/supabase";
import { HousekeepingRule } from "@/types/aura";
import { v4 as uuidv4 } from "uuid";

async function getGovEndTime(propertyId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('properties')
    .select('settings')
    .eq('id', propertyId)
    .single();
  return (data?.settings as any)?.govEndTime ?? '17:00';
}

async function getActiveRules(propertyId: string, trigger: HousekeepingRule['trigger']): Promise<HousekeepingRule[]> {
  const { data } = await supabaseAdmin
    .from('housekeeping_rules')
    .select('*')
    .eq('propertyId', propertyId)
    .eq('trigger', trigger)
    .eq('active', true);
  return (data || []) as HousekeepingRule[];
}

function buildTaskPayload(rule: HousekeepingRule, overrides: Record<string, any>) {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    propertyId: rule.propertyId,
    type: rule.taskType,
    status: 'pending',
    assignedTo: rule.assignedTo || [],
    checklist: (rule.checklist || []).map(item => ({ ...item, checked: false })),
    observations: rule.observations || null,
    ruleId: rule.id,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// Chamado pelo stay-service no checkout. Cria as tarefas conforme regras 'on_checkout'.
export async function applyOnCheckout(
  propertyId: string,
  cabinId: string,
  stayId: string,
  keyLocation: 'reception' | 'cabin' | 'unknown'
) {
  const rules = await getActiveRules(propertyId, 'on_checkout');
  for (const rule of rules) {
    await supabaseAdmin.from('housekeeping_tasks').insert(
      buildTaskPayload(rule, { cabinId, stayId, keyLocation })
    );
  }
}

// Chamado pelo cron daily-housekeeping para cada estadia ativa.
// Avalia regras 'active_stay_daily' e 'stay_duration_days'.
export async function applyDailyRules(
  propertyId: string,
  stay: { id: string; cabinId: string; checkIn: string; checkOut: string; dnd_enabled?: boolean; dnd_until?: string; guestId?: string }
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDayISO = today.toISOString();

  console.log(`[ENGINE] applyDailyRules — propertyId: ${propertyId}, stayId: ${stay.id}, startOfDayISO: ${startOfDayISO}`);
  // stay_duration_days — avaliado PRIMEIRO para que a supressão de daily funcione corretamente
  const durationRules = await getActiveRules(propertyId, 'stay_duration_days');
  console.log(`[ENGINE] Estadia ${stay.id}: ${durationRules.length} regra(s) stay_duration_days encontrada(s)`);
  for (const rule of durationRules) {
    if (!rule.intervalDays || rule.intervalDays < 1) continue;

    // Usa a última linen_change da cabana como base de contagem (cobre upgrades manuais também)
    const { data: lastLinen } = await supabaseAdmin
      .from('housekeeping_tasks')
      .select('createdAt')
      .eq('cabinId', stay.cabinId)
      .eq('type', 'linen_change')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    let referenceDate: Date;
    if (lastLinen?.createdAt) {
      referenceDate = new Date(lastLinen.createdAt);
      referenceDate.setHours(0, 0, 0, 0);
    } else {
      // Nunca houve linen_change — conta a partir do check-in
      referenceDate = new Date(stay.checkIn);
      referenceDate.setHours(0, 0, 0, 0);
    }

    const daysSinceReference = Math.floor((today.getTime() - referenceDate.getTime()) / 86_400_000);
    if (daysSinceReference < rule.intervalDays) continue;

    // Guard: não criar duas vezes no mesmo dia para essa regra+estadia
    const { data: existingToday } = await supabaseAdmin
      .from('housekeeping_tasks')
      .select('id')
      .eq('propertyId', propertyId)
      .eq('cabinId', stay.cabinId)
      .eq('ruleId', rule.id)
      .gte('createdAt', startOfDayISO)
      .maybeSingle();

    if (existingToday) continue;

    await supabaseAdmin.from('housekeeping_tasks').insert(
      buildTaskPayload(rule, { cabinId: stay.cabinId, stayId: stay.id })
    );
  }

  // active_stay_daily — avaliado DEPOIS para respeitar supressão por linen_change gerada acima
  const dailyRules = await getActiveRules(propertyId, 'active_stay_daily');
  console.log(`[ENGINE] Estadia ${stay.id}: ${dailyRules.length} regra(s) active_stay_daily encontrada(s)`);
  for (const rule of dailyRules) {
    // Supressão: se já existe linen_change hoje (gerada automaticamente ou convertida), não criar daily
    const { data: linenToday } = await supabaseAdmin
      .from('housekeeping_tasks')
      .select('id')
      .eq('cabinId', stay.cabinId)
      .eq('type', 'linen_change')
      .gte('createdAt', startOfDayISO)
      .maybeSingle();

    if (linenToday) {
      console.log(`[ENGINE] Estadia ${stay.id}: suprimida por linen_change existente (${linenToday.id})`);
      continue;
    }

    const { data: existing } = await supabaseAdmin
      .from('housekeeping_tasks')
      .select('id, createdAt, status')
      .eq('propertyId', propertyId)
      .eq('cabinId', stay.cabinId)
      .eq('ruleId', rule.id)
      .gte('createdAt', startOfDayISO)
      .maybeSingle();

    if (existing) {
      console.log(`[ENGINE] Estadia ${stay.id}: guard bloqueou — tarefa ${existing.id} já existe (status: ${existing.status}, criada: ${existing.createdAt})`);
      continue;
    }

    // DND handling
    let taskStatus = 'pending';
    let pausedUntil: string | null = null;
    let skippedAt: string | null = null;
    let guestName: string | null = null;

    const isDndActive = stay.dnd_enabled && stay.dnd_until && new Date(stay.dnd_until) > new Date();
    if (isDndActive) {
      const govEndTime = await getGovEndTime(propertyId);
      const [endH, endM] = govEndTime.split(':').map(Number);
      const todayGovEnd = new Date(today);
      todayGovEnd.setHours(endH, endM, 0, 0);

      const dndUntil = new Date(stay.dnd_until!);
      if (dndUntil >= todayGovEnd) {
        taskStatus = 'skipped';
        skippedAt = new Date().toISOString();
        if (stay.guestId) {
          const { data: guest } = await supabaseAdmin
            .from('guests').select('fullName').eq('id', stay.guestId).single();
          guestName = guest?.fullName ?? null;
        }
      } else {
        taskStatus = 'paused';
        pausedUntil = stay.dnd_until!;
      }
    }

    await supabaseAdmin.from('housekeeping_tasks').insert(
      buildTaskPayload(rule, {
        cabinId: stay.cabinId,
        stayId: stay.id,
        status: taskStatus,
        paused_until: pausedUntil,
        ...(skippedAt ? { skippedAt } : {}),
        ...(guestName ? { guestName } : {}),
      })
    );
  }
}

// Chamado pelo cron daily-housekeeping para cada propriedade.
// Cria tarefas de inspeção para cabanas com check-in previsto hoje (regras 'on_checkin_day').
export async function applyCheckinDayRules(propertyId: string) {
  const rules = await getActiveRules(propertyId, 'on_checkin_day');
  if (rules.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const startOfDayISO = today.toISOString();
  let created = 0;

  // Estadias com check-in previsto para hoje e ainda não confirmadas (status: 'confirmed' ou 'pending')
  const { data: arrivingStays } = await supabaseAdmin
    .from('stays')
    .select('id, cabinId')
    .eq('propertyId', propertyId)
    .in('status', ['confirmed', 'pending'])
    .gte('checkIn', `${todayStr}T00:00:00`)
    .lt('checkIn', `${todayStr}T23:59:59`);

  for (const stay of (arrivingStays || [])) {
    if (!stay.cabinId) continue;

    for (const rule of rules) {
      // Guard: não criar duas vezes no mesmo dia para essa regra+cabana
      const { data: existing } = await supabaseAdmin
        .from('housekeeping_tasks')
        .select('id')
        .eq('propertyId', propertyId)
        .eq('cabinId', stay.cabinId)
        .eq('ruleId', rule.id)
        .gte('createdAt', startOfDayISO)
        .maybeSingle();

      if (existing) continue;

      await supabaseAdmin.from('housekeeping_tasks').insert(
        buildTaskPayload(rule, { cabinId: stay.cabinId, stayId: stay.id })
      );
      created++;
    }
  }

  return created;
}

// Chamado pelo cron housekeeping-routines para regras de intervalo fixo.
export async function applyFixedIntervalRules(propertyId: string) {
  const rules = await getActiveRules(propertyId, 'fixed_interval_days');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().split('T')[0];
  let created = 0;

  for (const rule of rules) {
    if (!rule.intervalDays || rule.intervalDays < 1) continue;

    if (rule.lastTriggeredAt) {
      const last = new Date(rule.lastTriggeredAt);
      last.setHours(0, 0, 0, 0);
      const daysSince = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
      if (daysSince < rule.intervalDays) continue;
    }

    // Guard contra double-trigger no mesmo dia
    const { data: existing } = await supabaseAdmin
      .from('housekeeping_tasks')
      .select('id')
      .eq('ruleId', rule.id)
      .eq('propertyId', propertyId)
      .gte('createdAt', `${todayISO}T00:00:00.000Z`)
      .maybeSingle();

    if (existing) continue;

    const now = new Date().toISOString();
    await supabaseAdmin.from('housekeeping_tasks').insert(
      buildTaskPayload(rule, {
        cabinId: rule.cabinId || null,
        structureId: rule.structureId || null,
        customLocation: rule.customLocation || null,
      })
    );

    await supabaseAdmin
      .from('housekeeping_rules')
      .update({ lastTriggeredAt: now, updatedAt: now })
      .eq('id', rule.id);

    created++;
  }

  return created;
}
