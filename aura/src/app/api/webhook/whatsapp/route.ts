//src\app\api\webhook\whatsapp\route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { propertyId, contactNumber, text, direction, messageId, mediaUrl, originalText } = body;

    // Limpa o número de telefone (ex: remove @s.whatsapp.net e outros caracteres)
    const cleanContactNumber = contactNumber ? contactNumber.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '') : '';

    if (!propertyId || !cleanContactNumber || !text) {
      return NextResponse.json({ error: "Parâmetros obrigatórios em falta." }, { status: 400 });
    }

    console.log(`[WEBHOOK] Mensagem recebida de ${cleanContactNumber} para a propriedade ${propertyId} | Direção: ${direction}`);


    // ==========================================
    // 🛡️ BARREIRA ANTI-ECO (DESDUPLICAÇÃO)
    // ==========================================
    if (direction === "outbound") {
      // 1. Check by messageId first (most reliable)
      if (messageId) {
        const { data: byApiId } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("propertyId", propertyId)
          .eq("messageIdApi", messageId)
          .maybeSingle();

        if (byApiId) {
          console.log(`♻️ [WEBHOOK] Eco por messageIdApi para ${cleanContactNumber}. (msg: ${byApiId.id})`);
          return NextResponse.json({ success: true, message: "Eco do sistema ignorado com sucesso." });
        }
      }

      // 2. Check by body/originalBody similarity (handles translation + prefix differences)
      const { data: recentMessages } = await supabaseAdmin
        .from("messages")
        .select("id, body, originalBody, createdAt, status")
        .eq("propertyId", propertyId)
        .eq("contactId", cleanContactNumber)
        .eq("direction", "outbound")
        .order("createdAt", { ascending: false })
        .limit(5);

      if (recentMessages && recentMessages.length > 0) {
        const incomingClean = text.replace(/\*/g, '').trim();
        const incomingOrigClean = originalText ? originalText.replace(/\*/g, '').trim() : '';

        const match = recentMessages.find(m => {
          if (!m.createdAt) return false;
          const diffSeconds = (Date.now() - new Date(m.createdAt).getTime()) / 1000;
          if (diffSeconds > 120) return false;

          const bodyClean = (m.body || '').replace(/\*/g, '').trim();
          const origClean = (m.originalBody || '').replace(/\*/g, '').trim();

          // Compare all combinations: incoming text/originalText vs DB body/originalBody
          const candidates = [incomingClean, incomingOrigClean].filter(Boolean);
          const dbTexts = [bodyClean, origClean].filter(Boolean);

          for (const candidate of candidates) {
            for (const dbText of dbTexts) {
              if (candidate === dbText) return true;
              if (candidate.length > 10 && dbText.includes(candidate)) return true;
              if (dbText.length > 10 && candidate.includes(dbText)) return true;
            }
          }
          return false;
        });

        if (match) {
          if (match.status !== 'sent' && match.status !== 'delivered' && match.status !== 'read') {
            await supabaseAdmin.from("messages").update({ status: 'sent' }).eq('id', match.id);
          }
          console.log(`♻️ [WEBHOOK] Eco por body match para ${cleanContactNumber}. (msg: ${match.id})`);
          return NextResponse.json({ success: true, message: "Eco do sistema ignorado com sucesso." });
        }
      }
    }
    // ==========================================

    const newId = messageId || crypto.randomUUID();
    const isoNow = new Date().toISOString();

    await supabaseAdmin.from("messages").upsert({
      id: newId,
      propertyId,
      contactId: cleanContactNumber,
      to: direction === "outbound" ? cleanContactNumber : propertyId,
      body: text,
      originalBody: originalText || null,
      mediaUrl: mediaUrl || null,
      direction: direction === "inbound" ? "inbound" : "outbound",
      isAutomated: false,
      status: direction === "inbound" ? "delivered" : "sent",
      createdAt: isoNow,
      attempts: 0,
      ...(messageId && { id: messageId }) // garante caso tenha vindo na API externa
    }, { onConflict: 'id' });

    // 2. Atualizar a Barra Lateral (Communications)
    // Precisamos de count(unread) incremental
    const { data: comms } = await supabaseAdmin.from('communications')
      .select('unread')
      .eq('id', cleanContactNumber)
      .eq('propertyId', propertyId)
      .single();

    const currentUnread = comms?.unread || 0;
    const newUnread = direction === "inbound" ? currentUnread + 1 : 0;

    await supabaseAdmin.from('communications').upsert({
      id: cleanContactNumber,
      propertyId,
      lastMessage: text,
      updatedAt: isoNow,
      unread: newUnread,
      ...(direction === "inbound" && { archived: false })
    }, { onConflict: 'id' });

    // 3. Garantir que existe na Agenda (nunca sobrescreve contato existente)
    const { data: contact } = await supabaseAdmin.from("contacts")
      .select("id")
      .eq("id", cleanContactNumber)
      .eq("propertyId", propertyId)
      .maybeSingle();

    if (!contact) {
      await supabaseAdmin.from("contacts").insert({
        id: cleanContactNumber,
        propertyId,
        name: "+" + cleanContactNumber,
        phone: cleanContactNumber,
        isGuest: false,
        createdAt: isoNow,
        updatedAt: isoNow
      });
    }

    return NextResponse.json({ success: true, message: "Mensagem guardada no Supabase com sucesso." });

  } catch (error: any) {
    console.error("❌ Erro no Webhook do WhatsApp:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}