import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { applyFixedIntervalRules } from '@/lib/housekeeping-rule-engine';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized via CRON' }, { status: 401 });
  }

  try {
    const { data: properties } = await supabaseAdmin.from('properties').select('id');
    let tasksCreated = 0;

    if (!properties) return NextResponse.json({ success: true, newTasks: 0 });

    for (const prop of properties) {
      const created = await applyFixedIntervalRules(prop.id);
      tasksCreated += created;
    }

    return NextResponse.json({ success: true, newTasks: tasksCreated });

  } catch (error) {
    console.error("CRON Housekeeping Rules ERROR:", error);
    return NextResponse.json({ error: 'Falha ao processar regras de limpeza.' }, { status: 500 });
  }
}
