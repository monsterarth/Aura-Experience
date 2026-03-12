// src/app/api/cron/breakfast-attendance/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log("☕ [CRON] Iniciando geração da lista de presença do café da manhã...");

  try {
    const { data: properties } = await supabaseAdmin.from('properties').select('id');
    let recordsCreated = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const propData of (properties || [])) {
      const propertyId = propData.id;

      // Buscar ou criar sessão do dia
      let { data: session } = await supabaseAdmin
        .from('breakfast_sessions')
        .select('id')
        .eq('propertyId', propertyId)
        .eq('date', today)
        .maybeSingle();

      if (!session) {
        const sessionId = uuidv4();
        await supabaseAdmin.from('breakfast_sessions').insert({
          id: sessionId,
          propertyId,
          date: today,
          status: 'closed', // garçom abre manualmente
          createdAt: new Date().toISOString(),
        });
        session = { id: sessionId };
      }

      // Buscar estadias ativas que não encerram hoje
      const { data: activeStays } = await supabaseAdmin
        .from('stays')
        .select('id, guestId, cabinId')
        .eq('propertyId', propertyId)
        .eq('status', 'active')
        .gt('checkOut', today);

      for (const stay of (activeStays || [])) {
        // Evitar duplicata
        const { data: existing } = await supabaseAdmin
          .from('breakfast_attendance')
          .select('id')
          .eq('sessionId', session.id)
          .eq('stayId', stay.id)
          .maybeSingle();

        if (existing) continue;

        // Buscar nome do hóspede titular
        const { data: guest } = await supabaseAdmin
          .from('guests')
          .select('fullName, additionalGuests')
          .eq('id', stay.guestId)
          .maybeSingle();

        // Buscar nome da cabana
        const { data: cabin } = await supabaseAdmin
          .from('cabins')
          .select('name')
          .eq('id', stay.cabinId)
          .maybeSingle();

        // Nomes dos acompanhantes (campo additionalGuests da estadia)
        const { data: stayData } = await supabaseAdmin
          .from('stays')
          .select('additionalGuests')
          .eq('id', stay.id)
          .maybeSingle();

        const additionalGuestNames: string[] = (stayData?.additionalGuests || [])
          .map((ag: any) => ag.fullName || ag.name || '')
          .filter(Boolean);

        await supabaseAdmin.from('breakfast_attendance').insert({
          id: uuidv4(),
          propertyId,
          sessionId: session.id,
          stayId: stay.id,
          guestName: guest?.fullName ?? 'Hóspede',
          cabinName: cabin?.name ?? 'N/A',
          additionalGuests: additionalGuestNames,
          status: 'expected',
          tableId: null,
          date: today,
          createdAt: new Date().toISOString(),
        });

        recordsCreated++;
      }
    }

    console.log(`✅ [CRON] Sucesso! ${recordsCreated} registros de presença criados para ${today}.`);
    return NextResponse.json({ success: true, message: "Lista de presença gerada", recordsCreated });

  } catch (error: any) {
    console.error("❌ [CRON] Falha na rotina matinal do café:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
