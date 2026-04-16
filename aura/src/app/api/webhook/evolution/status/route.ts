// src/app/api/webhook/evolution/status/route.ts
// Recebe eventos de atualização de status de mensagens da Evolution API
// e atualiza o campo statusApi no Supabase.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Mapeamento de status Evolution → statusApi numérico (compatível com o antigo sistema)
const EVOLUTION_STATUS_MAP: Record<string, number> = {
  PENDING: 0,
  SERVER_ACK: 1,
  DELIVERY_ACK: 2,
  READ: 3,
  PLAYED: 4,
};

export async function POST(req: Request) {
  try {
    // Validar API key da Evolution
    const apiKey = req.headers.get("apikey");
    const expectedKey = process.env.EVOLUTION_API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Aceitar apenas eventos de update de mensagens
    const event: string = body.event || "";
    if (!["messages.update", "MESSAGES_UPDATE"].includes(event)) {
      return NextResponse.json({ success: true, message: "Evento ignorado." });
    }

    const updates: Array<{ key: { id: string; fromMe?: boolean }; update: { status?: string } }> =
      Array.isArray(body.data) ? body.data : [body.data];

    for (const item of updates) {
      const messageId = item?.key?.id;
      const newStatus = item?.update?.status;

      if (!messageId || !newStatus) continue;

      const statusApi = EVOLUTION_STATUS_MAP[newStatus];
      if (statusApi === undefined) continue;

      // Tentar pelo id direto primeiro, depois pelo messageIdApi
      let { data: msgDoc } = await supabaseAdmin
        .from("messages")
        .select("id")
        .eq("id", messageId)
        .maybeSingle();

      if (!msgDoc) {
        const { data: byApiId } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("messageIdApi", messageId)
          .maybeSingle();
        msgDoc = byApiId;
      }

      if (!msgDoc) continue;

      await supabaseAdmin
        .from("messages")
        .update({ statusApi })
        .eq("id", msgDoc.id);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("❌ [WEBHOOK EVOLUTION STATUS] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
