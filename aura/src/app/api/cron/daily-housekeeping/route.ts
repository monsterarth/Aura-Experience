// src/app/api/cron/daily-housekeeping/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { applyDailyRules, applyCheckinDayRules } from "@/lib/housekeeping-rule-engine";

async function writeCronLog(action: string, entityId: string, details: string, newData: object) {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      propertyId: 'system',
      userId: 'cron',
      userName: 'Sistema (Cron)',
      action,
      entity: 'CRON',
      entityId,
      details,
      newData,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[Audit] Falha ao gravar log de cron:', e);
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log("🤖 [CRON] Iniciando motor de Tarefas Diárias de Governança...");

  const startedAt = new Date().toISOString();
  const stayErrors: string[] = [];

  try {
    const { data: properties } = await supabaseAdmin.from('properties').select('id');
    let tasksCreated = 0;
    let propertiesProcessed = 0;

    // Executa às 17h BRT (20h UTC): gera tarefas para o dia seguinte
    const runDay = new Date();
    runDay.setHours(0, 0, 0, 0);                       // início do dia de execução (UTC) — usado para guards de dedup
    const runDayStr = runDay.toISOString().split('T')[0];
    const targetDay = new Date(runDay);
    targetDay.setDate(runDay.getDate() + 1);            // amanhã — dia para o qual as tarefas são geradas
    const targetDayStr = targetDay.toISOString().split('T')[0];
    console.log(`[CRON] Tarefas para: ${targetDayStr} (execução: ${runDayStr}) | Propriedades: ${(properties || []).length}`);

    for (const propData of (properties || [])) {
      const propertyId = propData.id;

      // Pular propriedades sem nenhuma regra ativa
      const { data: rules, count: rulesCount } = await supabaseAdmin
        .from('housekeeping_rules')
        .select('trigger, active', { count: 'exact' })
        .eq('propertyId', propertyId)
        .eq('active', true);
      console.log(`[CRON] Propriedade ${propertyId}: ${rulesCount ?? 0} regra(s) ativa(s) — ${JSON.stringify((rules || []).map(r => r.trigger))}`);
      if (!rulesCount || rulesCount === 0) {
        console.log(`[CRON] Prop ${propertyId}: sem regras ativas, pulando.`);
        continue;
      }

      // Inspeções de check-in previsto para amanhã
      const checkinCreated = await applyCheckinDayRules(propertyId, targetDay);
      tasksCreated += checkinCreated;
      if (checkinCreated > 0) console.log(`[CRON] Prop ${propertyId}: ${checkinCreated} inspeção(ões) de check-in criada(s)`);

      // Inclui estadias activas + estadias com check-in atrasado (pending ou pre_checkin_done
      // cujo checkIn já devia ter acontecido hoje). O hóspede vai chegar; as tarefas de amanhã
      // precisam ser geradas agora.
      const { data: activeStays } = await supabaseAdmin
        .from('stays')
        .select('*')
        .eq('propertyId', propertyId)
        .or(`status.eq.active,and(status.in.(pending,pre_checkin_done),checkIn.lte.${runDayStr}T23:59:59)`);

      console.log(`[CRON] Prop ${propertyId}: ${(activeStays || []).length} estadia(s) a processar (activas + check-ins atrasados)`);

      for (const stay of (activeStays || [])) {
        if (!stay.checkOut || !stay.cabinId) {
          console.log(`[CRON] Estadia ${stay.id} ignorada (sem checkOut ou cabinId)`);
          continue;
        }

        const checkOutDate = new Date(stay.checkOut);
        const isCheckingOutOnTargetDay = checkOutDate.toISOString().split('T')[0] === targetDayStr;
        if (isCheckingOutOnTargetDay) {
          console.log(`[CRON] Estadia ${stay.id} ignorada (checkout no dia alvo: ${targetDayStr})`);
          continue;
        }

        const before = await countTodayTasks(propertyId, runDay);
        try {
          await applyDailyRules(propertyId, stay, targetDay);
        } catch (stayErr: any) {
          const msg = stayErr?.message ?? String(stayErr);
          console.error(`[CRON] ❌ Erro ao processar estadia ${stay.id}:`, msg);
          stayErrors.push(`stay=${stay.id}: ${msg}`);
        }
        const after = await countTodayTasks(propertyId, runDay);
        const created = Math.max(0, after - before);
        tasksCreated += created;
        console.log(`[CRON] Estadia ${stay.id} (cabina ${stay.cabinId}): ${created} tarefa(s) criada(s)`);
      }
      propertiesProcessed++;
    }

    console.log(`✅ [CRON] ${tasksCreated} novas tarefas geradas via regras.`);
    const finishedAt = new Date().toISOString();
    const duration = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    await writeCronLog(
      'CRON_DAILY_HOUSEKEEPING',
      'daily-housekeeping',
      `${tasksCreated} tarefa(s) criada(s) em ${propertiesProcessed} propriedade(s)${stayErrors.length ? ` | ${stayErrors.length} erro(s)` : ''}`,
      { tasksCreated, propertiesProcessed, startedAt, finishedAt, durationMs: duration, errors: stayErrors }
    );
    return NextResponse.json({ success: true, tasksCreated });

  } catch (error: any) {
    console.error("❌ [CRON] Falha na rotina matinal de governança:", error);
    const finishedAt = new Date().toISOString();
    await writeCronLog(
      'CRON_DAILY_HOUSEKEEPING',
      'daily-housekeeping',
      `ERRO: ${error.message}`,
      { startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(), error: error.message }
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function countTodayTasks(propertyId: string, startOfDay: Date): Promise<number> {
  const { count } = await supabaseAdmin
    .from('housekeeping_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('propertyId', propertyId)
    .gte('createdAt', startOfDay.toISOString());
  return count ?? 0;
}
