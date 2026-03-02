import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { MaintenanceTask } from '@/types/aura';
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
                        title: `${parentTask.title} (Gerada ${today.toLocaleDateString('pt-BR')})`
                    };

                    await supabaseAdmin.from('maintenance_tasks').insert(clone);

                    await supabaseAdmin.from('maintenance_tasks').update({
                        lastRecurrenceCreated: isoToday
                    }).eq('id', parentTask.id);

                    tasksCreated++;
                }
            }
        }

        return NextResponse.json({ success: true, newTasks: tasksCreated });

    } catch (error) {
        console.error("CRON Maintenance ERROR:", error);
        return NextResponse.json({ error: 'Falha ao processar rotinas.' }, { status: 500 });
    }
}
