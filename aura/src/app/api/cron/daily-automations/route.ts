import { NextResponse } from "next/server";
import { db } from "@/lib/firebase"; 
import { collection, getDocs, doc, updateDoc, query, where } from "firebase/firestore";
import { Stay, Guest, Cabin, AutomationRule, MessageTemplate } from "@/types/aura";
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

    const propertiesSnap = await getDocs(collection(db, "properties"));
    let queuedCount = 0;

    for (const propertyDoc of propertiesSnap.docs) {
      const propertyId = propertyDoc.id;

      const rulesSnap = await getDocs(collection(db, "properties", propertyId, "automation_rules"));
      const rules = rulesSnap.docs.map(d => d.data() as AutomationRule).filter(r => r.active && r.templateId);
      
      if (rules.length === 0) continue; 

      const activeRules = rules.reduce((acc, rule) => {
        acc[rule.id] = rule;
        return acc;
      }, {} as Record<string, AutomationRule>);

      const templatesSnap = await getDocs(collection(db, "properties", propertyId, "message_templates"));
      const templates = templatesSnap.docs.reduce((acc, document) => {
        acc[document.id] = { id: document.id, ...document.data() } as MessageTemplate;
        return acc;
      }, {} as Record<string, MessageTemplate>);

      // Varre estadias
      const staysQuery = query(
        collection(db, "properties", propertyId, "stays"),
        where("status", "in", ["pending", "pre_checkin_done", "active"])
      );
      const staysSnap = await getDocs(staysQuery);

      for (const stayDoc of staysSnap.docs) {
        const stay = { id: stayDoc.id, ...stayDoc.data() } as Stay;
        
        if (!stay.checkIn || !stay.checkOut) continue;

        const checkInDate = stay.checkIn.toDate();
        checkInDate.setHours(0, 0, 0, 0);
        
        const checkOutDate = stay.checkOut.toDate();
        checkOutDate.setHours(0, 0, 0, 0);

        const diffDaysIn = Math.round((checkInDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        const diffDaysOut = Math.round((checkOutDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

        let triggerToFire: string | null = null;
        let flagToUpdate: string | null = null;

        // Lógica: 48h Antes do Check-in
        if (diffDaysIn === 2 && activeRules['pre_checkin_48h'] && stay.status === 'pending') {
          if (stay.automationFlags?.send48h && !stay.automationFlags?.preCheckinSent) {
            triggerToFire = 'pre_checkin_48h';
            flagToUpdate = 'send48h'; 
          }
        }
        // Lógica: 24h Antes do Check-in (PULA se o hóspede já preencheu e o status for pre_checkin_done)
        else if (diffDaysIn === 1 && activeRules['pre_checkin_24h'] && stay.status === 'pending') {
          if (stay.automationFlags?.send24h && !stay.automationFlags?.preCheckinSent) {
            triggerToFire = 'pre_checkin_24h';
            flagToUpdate = 'send24h';
          }
        }
        // Lógica: Instruções de Saída (Noite anterior)
        else if (diffDaysOut === 1 && activeRules['pre_checkout'] && stay.status === 'active') {
          triggerToFire = 'pre_checkout';
        }

        // Se houver gatilho para ativar
        if (triggerToFire) {
          const rule = activeRules[triggerToFire];
          const template = templates[rule.templateId];

          if (template) {
            const guestSnap = await getDocs(query(collection(db, "properties", propertyId, "guests"), where("id", "==", stay.guestId)));
            if (guestSnap.empty) continue;
            const guest = { id: guestSnap.docs[0].id, ...guestSnap.docs[0].data() } as Guest;

            if (!guest.phone) continue;

            let cabin;
            if (stay.cabinId) {
              const cabinSnap = await getDocs(query(collection(db, "properties", propertyId, "cabins"), where("id", "==", stay.cabinId)));
              if (!cabinSnap.empty) cabin = { id: cabinSnap.docs[0].id, ...cabinSnap.docs[0].data() } as Cabin;
            }

            let delayToApply = rule.delayMinutes || 0;

            // CÁLCULO PRECISO PARA O PRE-CHECKOUT (18:00h do Brasil)
            if (triggerToFire === 'pre_checkout') {
              const runTime = new Date();
              const brtHour = parseInt(runTime.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }), 10);
              const brtMin = parseInt(runTime.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', minute: 'numeric' }), 10);
              
              const currentMinutesPassed = (brtHour * 60) + brtMin;
              const targetMinutes = 18 * 60; // 18:00
              
              if (currentMinutesPassed < targetMinutes) {
                 delayToApply = targetMinutes - currentMinutesPassed; // Faltam X minutos para as 18h
              } else {
                 delayToApply = 0; // Se o cron já rodou depois das 18h, envia na hora
              }
            }

            await AutomationService.queueMessage(
              propertyId, stay.id, guest.phone, template, triggerToFire as any, guest, cabin, stay, delayToApply
            );
            queuedCount++;

            if (flagToUpdate) {
              await updateDoc(stayDoc.ref, {
                [`automationFlags.${flagToUpdate}`]: false
              });
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