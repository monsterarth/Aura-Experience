import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { MaintenanceTask } from '@/types/aura';
import { v4 as uuidv4 } from 'uuid';

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

        for (const prop of properties) {
            const propertyId = prop.id;

            const { data: activeTasks } = await supabaseAdmin
                .from('maintenance_tasks')
                .select('*')
                .eq('propertyId', propertyId)
                .eq('isRecurring', true);

            if (!activeTasks) continue;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const t of activeTasks) {
                const parentTask = t as any as MaintenanceTask;

                if (parentTask.lastRecurrenceCreated) {
                    const lastCreated = new Date(parentTask.lastRecurrenceCreated);
                    lastCreated.setHours(0, 0, 0, 0);
                    if (lastCreated.getTime() === today.getTime()) {
                        continue;
                    }
                }

                let shouldCreate = false;

                if (parentTask.recurrenceRule === 'daily') {
                    shouldCreate = true;
                } else if (parentTask.recurrenceRule === 'weekly') {
                    const parentDayOfWeek = new Date(parentTask.createdAt).getDay();
                    if (today.getDay() === parentDayOfWeek) {
                        shouldCreate = true;
                    }
                } else if (parentTask.recurrenceRule === 'monthly') {
                    const parentDate = new Date(parentTask.createdAt).getDate();
                    if (today.getDate() === parentDate) {
                        shouldCreate = true;
                    }
                }

                if (shouldCreate) {
                    const todayDate = today.toISOString().split('T')[0];

                    // Guard against double-trigger: check if a clone was already created today
                    const { data: existingClone } = await supabaseAdmin
                        .from('maintenance_tasks')
                        .select('id')
                        .eq('recurrenceSourceId', parentTask.id)
                        .eq('recurrenceDate', todayDate)
                        .maybeSingle();

                    if (existingClone) continue;

                    const newTaskId = uuidv4();
                    const isoToday = new Date().toISOString();
                    const clone = {
                        ...parentTask,
                        id: newTaskId,
                        status: 'pending',
                        createdAt: isoToday,
                        updatedAt: isoToday,
                        startedAt: null,
                        finishedAt: null,
                        completion: null,
                        isRecurring: false,
                        recurrenceSourceId: parentTask.id,
                        recurrenceDate: todayDate,
                        title: `${parentTask.title} (Gerada ${today.toLocaleDateString('pt-BR')})`
                    };

                    await supabaseAdmin.from('maintenance_tasks').insert(clone as any);

                    await supabaseAdmin.from('maintenance_tasks').update({
                        lastRecurrenceCreated: isoToday
                    }).eq('id', parentTask.id);

                    tasksCreated++;
                }
            }
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
