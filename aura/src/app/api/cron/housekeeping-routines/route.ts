import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { applyFixedIntervalRules } from '@/lib/housekeeping-rule-engine';

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
      await writeCronLog('CRON_HOUSEKEEPING_ROUTINES', 'housekeeping-routines', '0 tarefas criadas (sem propriedades)', { newTasks: 0, startedAt, finishedAt: new Date().toISOString(), durationMs: 0 });
      return NextResponse.json({ success: true, newTasks: 0 });
    }

    for (const prop of properties) {
      const created = await applyFixedIntervalRules(prop.id);
      tasksCreated += created;
    }

    const finishedAt = new Date().toISOString();
    await writeCronLog(
      'CRON_HOUSEKEEPING_ROUTINES',
      'housekeeping-routines',
      `${tasksCreated} tarefa(s) de intervalo fixo criada(s)`,
      { newTasks: tasksCreated, startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime() }
    );
    return NextResponse.json({ success: true, newTasks: tasksCreated });

  } catch (error: any) {
    console.error("CRON Housekeeping Rules ERROR:", error);
    const finishedAt = new Date().toISOString();
    await writeCronLog(
      'CRON_HOUSEKEEPING_ROUTINES',
      'housekeeping-routines',
      `ERRO: ${error?.message ?? error}`,
      { startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(), error: error?.message ?? String(error) }
    );
    return NextResponse.json({ error: 'Falha ao processar regras de limpeza.' }, { status: 500 });
  }
}
