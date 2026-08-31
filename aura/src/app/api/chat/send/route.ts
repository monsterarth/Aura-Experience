//src\app\api\chat\send\route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { resolveEvolutionConfig, sendEvolutionText } from "@/lib/evolution";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let requestBody;

  try {
    requestBody = await req.json();
    const { propertyId, messageId, number, message } = requestBody;

    if (!propertyId || !messageId || !number || !message) {
      return NextResponse.json({ error: "Parâmetros incompletos" }, { status: 400 });
    }

    if (auth.staff.role !== "super_admin" && auth.staff.propertyId !== propertyId) {
      return NextResponse.json({ error: "Sem permissão para esta propriedade." }, { status: 403 });
    }

    const cfg = await resolveEvolutionConfig(propertyId);
    if (!cfg.ok) {
      return NextResponse.json({ error: cfg.message }, { status: 500 });
    }

    const sent = await sendEvolutionText(cfg.config, number, message, "chat/send");

    if (!sent.ok) {
      await supabaseAdmin
        .from("messages")
        .update({ status: "failed", errorMessage: sent.errorMessage })
        .eq("id", messageId);
      return NextResponse.json({ error: sent.errorMessage }, { status: sent.status ?? 500 });
    }

    // Modo seguro grava como enviada com id nulo: a conversa continua legível no admin.
    await supabaseAdmin
      .from("messages")
      .update({ status: "sent", messageIdApi: sent.apiMessageId })
      .eq("id", messageId);

    if (sent.safeMode) {
      return NextResponse.json({ success: true, messageId: null, safeMode: true });
    }

    return NextResponse.json({ success: true, messageId: sent.apiMessageId });

  } catch (error: any) {
    if (requestBody?.propertyId && requestBody?.messageId) {
      try {
        await supabaseAdmin
          .from("messages")
          .update({ status: "failed", errorMessage: "Servidor offline (Timeout)" })
          .eq("id", requestBody.messageId);
      } catch {
        // ignore secondary failure
      }
    }
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
