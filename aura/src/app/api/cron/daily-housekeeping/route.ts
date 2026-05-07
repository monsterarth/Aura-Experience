// src/app/api/cron/daily-housekeeping/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { applyDailyRules } from "@/lib/housekeeping-rule-engine";

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log("🤖 [CRON] Iniciando motor de Tarefas Diárias de Governança...");

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
      today.setHours(0, 0, 0, 0);

      for (const stay of (activeStays || [])) {
        if (!stay.checkOut || !stay.cabinId) continue;

        const checkOutDate = new Date(stay.checkOut);
        const isCheckingOutToday = checkOutDate.toISOString().split('T')[0] === today.toISOString().split('T')[0];
        if (isCheckingOutToday) continue;

        const before = await countTodayTasks(propertyId, today);
        await applyDailyRules(propertyId, stay);
        const after = await countTodayTasks(propertyId, today);
        tasksCreated += Math.max(0, after - before);
      }
    }

    console.log(`✅ [CRON] ${tasksCreated} novas tarefas geradas via regras.`);
    return NextResponse.json({ success: true, tasksCreated });

  } catch (error: any) {
    console.error("❌ [CRON] Falha na rotina matinal de governança:", error);
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
