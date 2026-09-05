import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { Stay, Guest, Cabin, AutomationRule, MessageTemplate, Property } from "@/types/aura";
import { AutomationService } from "@/services/automation-service";

async function writeCronLog(action: string, entityId: string, details: string, newData: object) {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      propertyId: 'system',
      userId: 'cron',
      userName: 'Sistema (Cron)',
      action,
      entity: 'CRON',
      entityId,
      details,
      newData,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[Audit] Falha ao gravar log de cron:', e);
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();

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

        // Compare only date portion — checkOut is stored as ISO timestamp
        const stayCheckOutDate = stayData?.checkOut ? stayData.checkOut.slice(0, 10) : null;
        if (!stayCheckOutDate || stayCheckOutDate !== tomorrowStr) {
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
        .eq('triggerEvent', 'pre_checkout')
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

      // Faixa do dia, não igualdade: checkOut é timestamptz ("2026-08-17T15:00:00+00")
      // e `.eq(checkOut, '2026-08-17')` vira 00:00:00+00 no Postgres — nunca casava,
      // então esta rede de segurança do pre_checkout nunca enfileirou nada.
      // O recorte é o dia UTC, o mesmo que a Fase A usa no slice(0,10).
      const dayAfter = new Date(tomorrowStr + 'T00:00:00Z');
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

      const { data: staysSnap } = await supabaseAdmin
        .from('stays')
        .select('*')
        .eq('propertyId', propertyId)
        .eq('status', 'active')
        .gte('checkOut', `${tomorrowStr}T00:00:00Z`)
        .lt('checkOut', dayAfter.toISOString());

      if (!staysSnap) continue;

      for (const stayDoc of staysSnap) {
        const stay = stayDoc as any as Stay;

        // Qualquer mensagem não cancelada conta como "já existe". Antes o filtro era
        // `status in (pending, processing)`: quando este cron roda, a mensagem enfileirada
        // de manhã pelo daily-automations já saiu (status 'sent'), a busca não achava nada
        // e uma segunda era enfileirada — 20 hóspedes receberam as instruções de saída
        // duplicadas em 30 dias, sempre com ~9h entre as duas criações.
        //
        // O `.maybeSingle()` também saiu: ele ERRA quando encontra mais de uma linha, e o
        // erro não era verificado — ou seja, justamente onde já havia duplicata, `existing`
        // vinha nulo e o cron acrescentava mais uma. O bug se realimentava.
        const { data: existing, error: existingError } = await supabaseAdmin
          .from('messages')
          .select('id')
          .eq('stayId', stay.id)
          .eq('triggerEvent', 'pre_checkout')
          .neq('status', 'cancelled')
          .limit(1);

        if (existingError) {
          console.error(`[evening-revalidation] checagem de duplicata falhou (estadia ${stay.id}):`, existingError.message);
          continue; // na dúvida, não enfileira: repetir mensagem é pior que atrasar
        }
        if (existing?.length) continue;

        const { data: guestSnap } = await supabaseAdmin
          .from('guests')
          .select('*')
          .eq('id', stay.guestId).eq('propertyId', propertyId)
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
          propertyId, stay.id, guest.phone, template, 'pre_checkout', guest, cabin, stay, 30, property, supabaseAdmin
        );
        queuedCount++;
      }
    }

    const finishedAt = new Date().toISOString();
    await writeCronLog(
      'CRON_EVENING_REVALIDATION',
      'evening-revalidation',
      `${cancelledCount} mensagem(ns) cancelada(s), ${queuedCount} enfileirada(s)`,
      { cancelledCount, queuedCount, startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime() }
    );
    return NextResponse.json({
      success: true,
      cancelledCount,
      queuedCount,
      message: `Revalidação vespertina concluída. ${cancelledCount} mensagens canceladas, ${queuedCount} enfileiradas.`
    });
  } catch (error: any) {
    const finishedAt = new Date().toISOString();
    await writeCronLog(
      'CRON_EVENING_REVALIDATION',
      'evening-revalidation',
      `ERRO: ${error.message}`,
      { startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(), error: error.message }
    );
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
