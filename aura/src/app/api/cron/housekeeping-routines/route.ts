import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { HousekeepingRoutine } from '@/types/aura';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized via CRON' }, { status: 401 });
  }

  try {
    const { data: properties } = await supabaseAdmin.from('properties').select('id');
    let tasksCreated = 0;

    if (!properties) return NextResponse.json({ success: true, newTasks: 0 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split('T')[0];

    for (const prop of properties) {
      const { data: routines } = await supabaseAdmin
        .from('housekeeping_routines')
        .select('*')
        .eq('propertyId', prop.id)
        .eq('active', true);

      if (!routines) continue;

      for (const r of routines) {
        const routine = r as HousekeepingRoutine;

        if (routine.lastTriggeredAt) {
          const lastTriggered = new Date(routine.lastTriggeredAt);
          lastTriggered.setHours(0, 0, 0, 0);
          const daysSince = Math.floor((today.getTime() - lastTriggered.getTime()) / 86_400_000);
          if (daysSince < routine.intervalDays) continue;
        }

        // Guard against double-trigger on same day
        const { data: existing } = await supabaseAdmin
          .from('housekeeping_tasks')
          .select('id')
          .eq('routineId', routine.id)
          .eq('propertyId', prop.id)
          .gte('createdAt', `${todayISO}T00:00:00.000Z`)
          .maybeSingle();

        if (existing) continue;

        const now = new Date().toISOString();
        const taskId = uuidv4();

        await supabaseAdmin.from('housekeeping_tasks').insert({
          id: taskId,
          propertyId: prop.id,
          cabinId: routine.cabinId || null,
          structureId: routine.structureId || null,
          customLocation: routine.customLocation || null,
          type: routine.type,
          status: 'pending',
          assignedTo: routine.assignedTo || [],
          checklist: (routine.checklist || []).map(item => ({ ...item, checked: false })),
          observations: routine.observations || null,
          routineId: routine.id,
          createdAt: now,
          updatedAt: now,
        });

        await supabaseAdmin
          .from('housekeeping_routines')
          .update({ lastTriggeredAt: now, updatedAt: now })
          .eq('id', routine.id);

        tasksCreated++;
      }
    }

    return NextResponse.json({ success: true, newTasks: tasksCreated });

  } catch (error) {
    console.error("CRON Housekeeping Routines ERROR:", error);
    return NextResponse.json({ error: 'Falha ao processar rotinas de limpeza.' }, { status: 500 });
  }
}
