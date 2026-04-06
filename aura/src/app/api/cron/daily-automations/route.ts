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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: propertiesSnap } = await supabaseAdmin.from("properties").select("*");
    let queuedCount = 0;

    if (!propertiesSnap) return NextResponse.json({ success: true, queuedCount: 0 });

    for (const propertyDoc of propertiesSnap) {
      const propertyId = propertyDoc.id;
      const property = propertyDoc as any as Property;

      const { data: rulesSnap } = await supabaseAdmin.from("automation_rules").select("*").eq("propertyId", propertyId);
      if (!rulesSnap) continue;

      const rules = rulesSnap.map(d => d as any as AutomationRule).filter(r => r.active && r.templateId);

      if (rules.length === 0) continue;

      const activeRules = rules.reduce((acc, rule) => {
        acc[rule.id] = rule;
        return acc;
      }, {} as Record<string, AutomationRule>);

      const { data: templatesSnap } = await supabaseAdmin.from("message_templates").select("*").eq("propertyId", propertyId);
      if (!templatesSnap) continue;

      const templates = templatesSnap.reduce((acc, document) => {
        acc[document.id] = document as any as MessageTemplate;
        return acc;
      }, {} as Record<string, MessageTemplate>);

      const { data: staysSnap } = await supabaseAdmin.from("stays")
        .select("*")
        .eq("propertyId", propertyId)
        .in("status", ["pending", "pre_checkin_done", "active"]);

      if (!staysSnap) continue;

      for (const stayDoc of staysSnap) {
        const stay = stayDoc as any as Stay;

        if (!stay.checkIn || !stay.checkOut) continue;

        const checkInDate = new Date(stay.checkIn);
        checkInDate.setHours(0, 0, 0, 0);

        const checkOutDate = new Date(stay.checkOut);
        checkOutDate.setHours(0, 0, 0, 0);

        const diffDaysIn = Math.round((checkInDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        const diffDaysOut = Math.round((checkOutDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

        let triggerToFire: string | null = null;
        let flagToUpdate: string | null = null;

        if (diffDaysIn === 2 && activeRules['pre_checkin_48h'] && stay.status === 'pending') {
          if (stay.automationFlags?.send48h && !stay.automationFlags?.preCheckinSent) {
            triggerToFire = 'pre_checkin_48h';
            flagToUpdate = 'send48h';
          }
        }
        else if (diffDaysIn === 1 && activeRules['pre_checkin_24h'] && stay.status === 'pending') {
          if (stay.automationFlags?.send24h && !stay.automationFlags?.preCheckinSent) {
            triggerToFire = 'pre_checkin_24h';
            flagToUpdate = 'send24h';
          }
        }
        else if (diffDaysOut === 1 && activeRules['pre_checkout'] && stay.status === 'active') {
          triggerToFire = 'pre_checkout';
        }

        if (triggerToFire) {
          if (triggerToFire === 'pre_checkout') {
            const { data: existing } = await supabaseAdmin
              .from('messages')
              .select('id')
              .eq('stayId', stay.id)
              .eq('triggerEvent', 'pre_checkout')
              .in('status', ['pending', 'processing'])
              .maybeSingle();
            if (existing) continue;
          }

          const rule = activeRules[triggerToFire];
          const template = templates[rule.templateId];

          if (template) {
            const { data: guestSnap } = await supabaseAdmin.from("guests").select("*").eq("propertyId", propertyId).eq("id", stay.guestId);
            if (!guestSnap || guestSnap.length === 0) continue;
            const guest = guestSnap[0] as any as Guest;

            if (!guest.phone) continue;

            let cabin;
            if (stay.cabinId) {
              const { data: cabinSnap } = await supabaseAdmin.from("cabins").select("*").eq("propertyId", propertyId).eq("id", stay.cabinId);
              if (cabinSnap && cabinSnap.length > 0) cabin = cabinSnap[0] as any as Cabin;
            }

            let delayToApply = rule.delayMinutes || 0;

            if (triggerToFire === 'pre_checkout') {
              const runTime = new Date();
              const brtHour = parseInt(runTime.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }), 10);
              const brtMin = parseInt(runTime.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', minute: 'numeric' }), 10);

              const currentMinutesPassed = (brtHour * 60) + brtMin;
              const targetMinutes = 18 * 60;

              if (currentMinutesPassed < targetMinutes) {
                delayToApply = targetMinutes - currentMinutesPassed;
              } else {
                delayToApply = 0;
              }
            }

            await AutomationService.queueMessage(
              propertyId, stay.id, guest.phone, template, triggerToFire as any, guest, cabin, stay, delayToApply, property
            );
            queuedCount++;

            if (flagToUpdate) {
              await supabaseAdmin.from("stays").update({
                automationFlags: {
                  ...stay.automationFlags,
                  [flagToUpdate]: false
                }
              }).eq('id', stay.id);
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, queuedCount, message: `Varredura concluída. ${queuedCount} mensagens enfileiradas.` });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}