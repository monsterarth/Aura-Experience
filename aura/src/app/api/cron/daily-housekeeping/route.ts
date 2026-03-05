// src/app/api/cron/daily-housekeeping/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log("🤖 [CRON] Iniciando motor de geração de Tarefas Diárias de Governança...");

  try {
    const { data: properties } = await supabaseAdmin.from('properties').select('id');
    let tasksCreated = 0;

    for (const propData of (properties || [])) {
      const propertyId = propData.id;

      const { data: activeStays } = await supabaseAdmin
        .from('stays')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('status', 'active');

      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));

      for (const stay of (activeStays || [])) {
        if (!stay.checkOut || !stay.cabinId) continue;

        const checkOutDate = new Date(stay.checkOut);
        const isCheckingOutToday = checkOutDate.toISOString().split('T')[0] === startOfDay.toISOString().split('T')[0];

        if (isCheckingOutToday) continue;

        const { data: existingTasks } = await supabaseAdmin
          .from('housekeeping_tasks')
          .select('id')
          .eq('propertyId', propertyId)
          .eq('cabinId', stay.cabinId)
          .eq('type', 'daily')
          .gte('createdAt', startOfDay.toISOString());

        if (existingTasks && existingTasks.length > 0) continue;

        const taskId = uuidv4();
        await supabaseAdmin.from('housekeeping_tasks').insert({
          id: taskId,
          propertyId: propertyId,
          cabinId: stay.cabinId,
          stayId: stay.id,
          type: 'daily',
          status: 'pending',
          checklist: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        tasksCreated++;
      }
    }

    console.log(`✅ [CRON] Sucesso! ${tasksCreated} novas tarefas diárias foram geradas.`);
    return NextResponse.json({ success: true, message: "Tarefas geradas com sucesso", tasksCreated });

  } catch (error: any) {
    console.error("❌ [CRON] Falha na rotina matinal de governança:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}