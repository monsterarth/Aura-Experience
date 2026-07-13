import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { MaintenanceRule } from '@/types/aura';
import { v4 as uuidv4 } from 'uuid';

function getNextTriggerDate(rule: MaintenanceRule): Date {
    const base = rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt) : new Date(rule.createdAt);
    const next = new Date(base);
    if (rule.intervalUnit === 'days') {
        next.setDate(next.getDate() + rule.interval);
    } else if (rule.intervalUnit === 'weeks') {
        next.setDate(next.getDate() + rule.interval * 7);
    } else {
        next.setMonth(next.getMonth() + rule.interval);
    }
    return next;
}

async function applyMaintenanceRules(propertyId: string): Promise<number> {
    const { data: rules } = await supabaseAdmin
        .from('maintenance_rules')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('active', true);

    if (!rules || rules.length === 0) return 0;

    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    let created = 0;

    for (const rule of rules as MaintenanceRule[]) {
        const nextTrigger = getNextTriggerDate(rule);
        if (now < nextTrigger) continue;

        // Dedup: skip if already created today for this rule.
        // limit(1)+array em vez de maybeSingle(): com 2+ clones no mesmo dia o maybeSingle
        // devolvia { error, data: null } e o guard passava — as duplicatas compunham.
        const { data: existing } = await supabaseAdmin
            .from('maintenance_tasks')
            .select('id')
            .eq('recurrenceSourceId', rule.id)
            .eq('recurrenceDate', todayDate)
            .limit(1);

        if (existing && existing.length > 0) continue;

        const isoNow = now.toISOString();
        await supabaseAdmin.from('maintenance_tasks').insert({
            id: uuidv4(),
            propertyId,
            title: rule.name,
            description: rule.description || '',
            priority: rule.priority,
            status: 'pending',
            cabinId: rule.cabinId || null,
            structureId: rule.structureId || null,
            unitId: rule.unitId || null,
            customLocation: rule.customLocation || null,
            assignedTo: rule.assignedTo || [],
            checklist: (rule.checklist || []).map((c: any) => ({ ...c, checked: false })),
            isRecurring: false,
            recurrenceSourceId: rule.id,
            recurrenceDate: todayDate,
            blocksCabin: false,
            createdAt: isoNow,
            updatedAt: isoNow,
        });

        await supabaseAdmin
            .from('maintenance_rules')
            .update({ lastTriggeredAt: isoNow, updatedAt: isoNow })
            .eq('id', rule.id);

        created++;
    }

    return created;
}

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

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Unauthorized via CRON' }, { status: 401 });
    }

    const startedAt = new Date().toISOString();

    try {
        const { data: properties } = await supabaseAdmin.from('properties').select('id');
        let tasksCreated = 0;

        if (!properties) {
          await writeCronLog('CRON_MAINTENANCE', 'maintenance', '0 tarefas criadas (sem propriedades)', { newTasks: 0, startedAt, finishedAt: new Date().toISOString(), durationMs: 0 });
          return NextResponse.json({ success: true, newTasks: 0 });
        }

        // Preventivas vivem SÓ em maintenance_rules (tela de regras no kanban admin).
        // O mecanismo antigo de tarefas-pai isRecurring foi aposentado em jul/2026 (zero
        // registros em produção) para não haver duas fontes gerando a mesma preventiva.
        for (const prop of properties) {
            tasksCreated += await applyMaintenanceRules(prop.id);
        }

        const finishedAt = new Date().toISOString();
        await writeCronLog(
          'CRON_MAINTENANCE',
          'maintenance',
          `${tasksCreated} tarefa(s) recorrente(s) criada(s)`,
          { newTasks: tasksCreated, startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime() }
        );
        return NextResponse.json({ success: true, newTasks: tasksCreated });

    } catch (error: any) {
        console.error("CRON Maintenance ERROR:", error);
        const finishedAt = new Date().toISOString();
        await writeCronLog(
          'CRON_MAINTENANCE',
          'maintenance',
          `ERRO: ${error?.message ?? error}`,
          { startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(), error: error?.message ?? String(error) }
        );
        return NextResponse.json({ error: 'Falha ao processar rotinas.' }, { status: 500 });
    }
}
