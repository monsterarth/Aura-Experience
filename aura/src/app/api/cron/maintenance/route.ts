import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { MaintenanceTask } from '@/types/aura';
import { v4 as uuidv4 } from 'uuid';

// Exemplo de como chamar: GET /api/cron/maintenance?propertyId=YOUR_PROP_ID
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get('authorization');

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Unauthorized via CRON' }, { status: 401 });
    }

    try {
        const propsSnap = await getDocs(collection(db, "properties"));
        let tasksCreated = 0;

        for (const prop of propsSnap.docs) {
            const propertyId = prop.id;

            // Buscar APENAS tarefas declaradas como RECORRENTES que ainda estão ativas 
            // Para evitar gerar infinitas caso a tarefa base seja apagada
            const q = query(collection(db, "properties", propertyId, "maintenance_tasks"), where("isRecurring", "==", true));
            const activeTasks = await getDocs(q);

            const today = new Date();
            today.setHours(0, 0, 0, 0); // Start of day

            for (const t of activeTasks.docs) {
                const parentTask = t.data() as MaintenanceTask;

                // Skip if a recurrence was already generated today
                if (parentTask.lastRecurrenceCreated) {
                    const lastCreated = new Date((parentTask.lastRecurrenceCreated as any).seconds * 1000);
                    lastCreated.setHours(0, 0, 0, 0);
                    if (lastCreated.getTime() === today.getTime()) {
                        continue; // Já criou hoje.
                    }
                }

                // Logic check for periodicity
                let shouldCreate = false;

                if (parentTask.recurrenceRule === 'daily') {
                    shouldCreate = true;
                } else if (parentTask.recurrenceRule === 'weekly') {
                    // Verify if it's the exact same day of the week the parent task was created
                    const parentDayOfWeek = new Date((parentTask.createdAt as any).seconds * 1000).getDay();
                    if (today.getDay() === parentDayOfWeek) {
                        shouldCreate = true;
                    }
                } else if (parentTask.recurrenceRule === 'monthly') {
                    // Verify if it's the same numerical day of the month
                    const parentDate = new Date((parentTask.createdAt as any).seconds * 1000).getDate();
                    if (today.getDate() === parentDate) {
                        shouldCreate = true;
                    }
                }

                if (shouldCreate) {
                    const newTaskId = uuidv4();
                    await setDoc(doc(db, "properties", propertyId, "maintenance_tasks", newTaskId), {
                        ...parentTask,
                        id: newTaskId,
                        status: 'pending',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        startedAt: null,
                        finishedAt: null,
                        completion: null,
                        isRecurring: false, // The clone is NOT recurring, only the parent acts as template.
                        title: `${parentTask.title} (Gerada ${today.toLocaleDateString('pt-BR')})`
                    });

                    // Update the parent to mark it as parsed today
                    await setDoc(doc(db, "properties", propertyId, "maintenance_tasks", t.id), {
                        lastRecurrenceCreated: serverTimestamp(),
                    }, { merge: true });

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
