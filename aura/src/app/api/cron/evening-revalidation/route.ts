import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { Stay, Guest, Cabin, AutomationRule, MessageTemplate, Property } from "@/types/aura";
import { AutomationService } from "@/services/automation-service";

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Calculate tomorrow's date in BRT (UTC-3)
    const brtFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const todayBRT = brtFormatter.format(new Date());
    const tomorrowDate = new Date(todayBRT + 'T00:00:00');
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    let cancelledCount = 0;
    let queuedCount = 0;

    // Phase A: Cancel orphan pre_checkout messages (stay was extended or checkout changed)
    const { data: pendingMessages } = await supabaseAdmin
      .from('messages')
      .select('id, stayId, propertyId')
      .eq('triggerEvent', 'pre_checkout')
      .in('status', ['pending', 'processing']);

    if (pendingMessages) {
      for (const msg of pendingMessages) {
        if (!msg.stayId) continue;

        const { data: stayData } = await supabaseAdmin
          .from('stays')
          .select('checkOut')
          .eq('id', msg.stayId)
          .maybeSingle();

        if (!stayData || stayData.checkOut !== tomorrowStr) {
          await AutomationService.cancelMessage(msg.propertyId, msg.id);
          cancelledCount++;
        }
      }
    }

    // Phase B: Queue missing pre_checkout messages (stays created/updated after 8h)
    const { data: propertiesSnap } = await supabaseAdmin.from('properties').select('*');
    if (!propertiesSnap) {
      return NextResponse.json({ success: true, cancelledCount, queuedCount });
    }

    for (const propertyDoc of propertiesSnap) {
      const propertyId = propertyDoc.id;
      const property = propertyDoc as any as Property;

      const { data: ruleSnap } = await supabaseAdmin
        .from('automation_rules')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('id', 'pre_checkout')
        .eq('active', true)
        .maybeSingle();

      if (!ruleSnap) continue;
      const rule = ruleSnap as any as AutomationRule;
      if (!rule.templateId) continue;

      const { data: templateSnap } = await supabaseAdmin
        .from('message_templates')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('id', rule.templateId)
        .maybeSingle();

      if (!templateSnap) continue;
      const template = templateSnap as any as MessageTemplate;

      const { data: staysSnap } = await supabaseAdmin
        .from('stays')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('status', 'active')
        .eq('checkOut', tomorrowStr);

      if (!staysSnap) continue;

      for (const stayDoc of staysSnap) {
        const stay = stayDoc as any as Stay;

        const { data: existing } = await supabaseAdmin
          .from('messages')
          .select('id')
          .eq('stayId', stay.id)
          .eq('triggerEvent', 'pre_checkout')
          .in('status', ['pending', 'processing'])
          .maybeSingle();

        if (existing) continue;

        const { data: guestSnap } = await supabaseAdmin
          .from('guests')
          .select('*')
          .eq('id', stay.guestId)
          .maybeSingle();

        if (!guestSnap || !guestSnap.phone) continue;
        const guest = guestSnap as any as Guest;

        let cabin: Cabin | undefined;
        if (stay.cabinId) {
          const { data: cabinSnap } = await supabaseAdmin
            .from('cabins')
            .select('*')
            .eq('id', stay.cabinId)
            .maybeSingle();
          if (cabinSnap) cabin = cabinSnap as any as Cabin;
        }

        await AutomationService.queueMessage(
          propertyId, stay.id, guest.phone, template, 'pre_checkout', guest, cabin, stay, 30, property
        );
        queuedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      cancelledCount,
      queuedCount,
      message: `Revalidação vespertina concluída. ${cancelledCount} mensagens canceladas, ${queuedCount} enfileiradas.`
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
