// src/app/api/webhook/evolution/route.ts
// Recebe eventos de mensagens da Evolution API e persiste no Supabase.
// Substitui o antigo /api/webhook/whatsapp/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Extrai o texto legível de um payload de mensagem Evolution
function extractText(message: Record<string, any>): string {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    (message?.imageMessage ? "[imagem]" : null) ||
    (message?.audioMessage ? "[áudio]" : null) ||
    (message?.videoMessage ? "[vídeo]" : null) ||
    (message?.documentMessage ? "[documento]" : null) ||
    (message?.stickerMessage ? "[sticker]" : null) ||
    "[mensagem]"
  );
}

function extractMediaUrl(message: Record<string, any>): string | null {
  return (
    message?.imageMessage?.url ||
    message?.audioMessage?.url ||
    message?.videoMessage?.url ||
    message?.documentMessage?.url ||
    null
  );
}

// Resolve propertyId a partir do nome da instância Evolution
async function resolvePropertyId(instance: string): Promise<string | null> {
  const { data: properties } = await supabaseAdmin
    .from("properties")
    .select("id, settings");

  const match = properties?.find((p) => {
    const cfg = p.settings?.whatsappConfig;
    if (!cfg) return false;
    if (cfg.instanceName === instance) return true;
    if (cfg.instances?.some((i: { instanceName: string }) => i.instanceName === instance)) return true;
    return false;
  });

  return match?.id ?? null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Aceitar apenas eventos de mensagem
    const event: string = body.event || "";
    if (!["messages.upsert", "MESSAGES_UPSERT", "send.message", "SEND_MESSAGE"].includes(event)) {
      return NextResponse.json({ success: true, message: "Evento ignorado." });
    }

    const instance: string = body.instance;
    const data = body.data;

    if (!instance || !data?.key) {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }

    const propertyId = await resolvePropertyId(instance);
    if (!propertyId) {
      console.warn(`[WEBHOOK EVOLUTION] Instância desconhecida: ${instance}`);
      return NextResponse.json({ error: "Instância não encontrada." }, { status: 404 });
    }

    const remoteJid: string = data.key.remoteJid || "";
    const contactNumber = remoteJid.replace("@s.whatsapp.net", "").replace(/[^0-9]/g, "");
    const direction: "inbound" | "outbound" = data.key.fromMe ? "outbound" : "inbound";
    const messageId: string = data.key.id;
    const text = extractText(data.message || {});
    const mediaUrl = extractMediaUrl(data.message || {});

    if (!contactNumber || !text) {
      return NextResponse.json({ error: "Parâmetros obrigatórios em falta." }, { status: 400 });
    }

    console.log(`[WEBHOOK EVOLUTION] ${direction} | ${contactNumber} → ${propertyId} | id: ${messageId}`);

    // ==========================================
    // BARREIRA ANTI-ECO (DESDUPLICAÇÃO)
    // ==========================================
    if (direction === "outbound") {
      // 1. Checar por messageId (mais confiável)
      const { data: byApiId } = await supabaseAdmin
        .from("messages")
        .select("id")
        .eq("propertyId", propertyId)
        .eq("messageIdApi", messageId)
        .maybeSingle();

      if (byApiId) {
        console.log(`♻️ [WEBHOOK EVOLUTION] Eco por messageIdApi. (msg: ${byApiId.id})`);
        return NextResponse.json({ success: true, message: "Eco do sistema ignorado." });
      }

      // 2. Checar por similaridade de corpo (cobre prefixos de máscara, traduções)
      const { data: recentMessages } = await supabaseAdmin
        .from("messages")
        .select("id, body, originalBody, createdAt, status")
        .eq("propertyId", propertyId)
        .eq("contactId", contactNumber)
        .eq("direction", "outbound")
        .order("createdAt", { ascending: false })
        .limit(5);

      if (recentMessages && recentMessages.length > 0) {
        const incomingClean = text.replace(/\*/g, "").trim();

        const match = recentMessages.find((m) => {
          if (!m.createdAt) return false;
          const diffSeconds = (Date.now() - new Date(m.createdAt).getTime()) / 1000;
          if (diffSeconds > 120) return false;

          const bodyClean = (m.body || "").replace(/\*/g, "").trim();
          const origClean = (m.originalBody || "").replace(/\*/g, "").trim();

          const dbTexts = [bodyClean, origClean].filter(Boolean);
          for (const dbText of dbTexts) {
            if (incomingClean === dbText) return true;
            if (incomingClean.length > 10 && dbText.includes(incomingClean)) return true;
            if (dbText.length > 10 && incomingClean.includes(dbText)) return true;
          }
          return false;
        });

        if (match) {
          if (!["sent", "delivered", "read"].includes(match.status)) {
            await supabaseAdmin.from("messages").update({ status: "sent" }).eq("id", match.id);
          }
          console.log(`♻️ [WEBHOOK EVOLUTION] Eco por body match. (msg: ${match.id})`);
          return NextResponse.json({ success: true, message: "Eco do sistema ignorado." });
        }
      }
    }
    // ==========================================

    const isoNow = new Date().toISOString();

    // 1. Persistir mensagem
    await supabaseAdmin.from("messages").upsert(
      {
        id: messageId,
        propertyId,
        contactId: contactNumber,
        to: direction === "outbound" ? contactNumber : propertyId,
        body: text,
        originalBody: null,
        mediaUrl: mediaUrl || null,
        direction,
        isAutomated: false,
        status: direction === "inbound" ? "delivered" : "sent",
        createdAt: isoNow,
        attempts: 0,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

    // 2. Atualizar sidebar (communications)
    const { data: comms } = await supabaseAdmin
      .from("communications")
      .select("unread")
      .eq("id", contactNumber)
      .eq("propertyId", propertyId)
      .single();

    const currentUnread = comms?.unread || 0;
    const newUnread = direction === "inbound" ? currentUnread + 1 : currentUnread;

    await supabaseAdmin.from("communications").upsert(
      {
        id: contactNumber,
        propertyId,
        lastMessage: text,
        updatedAt: isoNow,
        unread: newUnread,
        ...(direction === "inbound" && { archived: false }),
      },
      { onConflict: "id,propertyId" }
    );

    // 3. Garantir contato na agenda (não sobrescreve contato existente)
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("id", contactNumber)
      .eq("propertyId", propertyId)
      .maybeSingle();

    if (!contact) {
      await supabaseAdmin.from("contacts").insert({
        id: contactNumber,
        propertyId,
        name: "+" + contactNumber,
        phone: contactNumber,
        isGuest: false,
        createdAt: isoNow,
        updatedAt: isoNow,
      });
    }

    return NextResponse.json({ success: true, message: "Mensagem guardada com sucesso." });

  } catch (error: any) {
    console.error("❌ [WEBHOOK EVOLUTION] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
