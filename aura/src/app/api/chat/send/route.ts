//src\app\api\chat\send\route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth, isAuthError } from "@/lib/api-auth";

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

    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("settings")
      .eq("id", propertyId)
      .single();

    const cfg = property?.settings?.whatsappConfig;
    const apiUrl = cfg?.apiUrl || process.env.EVOLUTION_API_URL;
    const apiKey = cfg?.apiKey || process.env.EVOLUTION_API_KEY;
    const instanceName = cfg?.instanceName
      || cfg?.instances?.[0]?.instanceName
      || process.env.EVOLUTION_INSTANCE;

    if (!apiUrl || !apiKey || !instanceName) {
      return NextResponse.json({ error: "Configuração da Evolution API ausente no servidor." }, { status: 500 });
    }

    const baseUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;

    const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({ number, text: message }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Erro desconhecido na Evolution API" }));
      await supabaseAdmin
        .from("messages")
        .update({ status: "failed", errorMessage: errorData.error || "Falha na comunicação com a Evolution API" })
        .eq("id", messageId);
      return NextResponse.json({ error: "Falha ao enviar via Evolution API" }, { status: response.status });
    }

    const data = await response.json();
    const apiMessageId = data?.key?.id || null;

    await supabaseAdmin
      .from("messages")
      .update({ status: "sent", messageIdApi: apiMessageId })
      .eq("id", messageId);

    return NextResponse.json({ success: true, messageId: apiMessageId });

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
