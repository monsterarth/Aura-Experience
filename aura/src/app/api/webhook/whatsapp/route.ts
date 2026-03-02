//src\app\api\webhook\whatsapp\route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { propertyId, contactNumber, text, direction, messageId, mediaUrl, originalText } = body;

    // Validação básica de segurança
    if (!propertyId || !contactNumber || !text) {
      return NextResponse.json({ error: "Parâmetros obrigatórios em falta." }, { status: 400 });
    }

    console.log(`[WEBHOOK] Mensagem recebida de ${contactNumber} para a propriedade ${propertyId} | Direção: ${direction}`);


    // ==========================================
    // 🛡️ BARREIRA ANTI-ECO (DESDUPLICAÇÃO)
    // ==========================================
    if (direction === "outbound") {
      const { data: recentMessages } = await supabaseAdmin
        .from("messages")
        .select("*")
        .eq("propertyId", propertyId)
        .eq("contactId", contactNumber)
        .eq("direction", "outbound")
        .order("createdAt", { ascending: false })
        .limit(1);

      if (recentMessages && recentMessages.length > 0) {
        const lastMsg = recentMessages[0];

        // Compara com 'body'
        if (lastMsg.body === text) {
          let isRecent = false;
          if (lastMsg.createdAt) {
            const msgTime = new Date(lastMsg.createdAt);
            const diffSeconds = (Date.now() - msgTime.getTime()) / 1000;
            if (diffSeconds < 30) isRecent = true;
          } else {
            isRecent = true;
          }

          if (isRecent) {
            console.log(`♻️ [WEBHOOK] Eco de API identificado e bloqueado para ${contactNumber}.`);
            return NextResponse.json({ success: true, message: "Eco do sistema ignorado com sucesso." });
          }
        }
      }
    }
    // ==========================================

    const newId = messageId || crypto.randomUUID();
    const isoNow = new Date().toISOString();

    await supabaseAdmin.from("messages").upsert({
      id: newId,
      propertyId,
      contactId: contactNumber,
      to: direction === "outbound" ? contactNumber : propertyId,
      from: direction === "inbound" ? contactNumber : propertyId,
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
      .eq('id', contactNumber)
      .eq('propertyId', propertyId)
      .single();

    const currentUnread = comms?.unread || 0;
    const newUnread = direction === "inbound" ? currentUnread + 1 : 0;

    await supabaseAdmin.from('communications').upsert({
      id: contactNumber,
      propertyId,
      lastMessage: text,
      updatedAt: isoNow,
      unread: newUnread,
      ...(direction === "inbound" && { archived: false })
    }, { onConflict: 'id' });

    // 3. Garantir que existe na Agenda
    const { data: contact } = await supabaseAdmin.from("contacts")
      .select("id")
      .eq("id", contactNumber)
      .eq("propertyId", propertyId)
      .single();

    if (!contact) {
      await supabaseAdmin.from("contacts").insert({
        id: contactNumber,
        propertyId,
        name: "+" + contactNumber,
        phone: contactNumber,
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