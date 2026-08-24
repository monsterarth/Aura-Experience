//src\app\api\chat\send\route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { parseEvolutionError } from "@/lib/evolution-error";
import { PropertySecretsService } from "@/services/property-secrets-service";
import { isSafeMode, logSuppressedSend } from "@/lib/safe-mode";

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
    // A chave vem de property_secrets (fora do alcance do navegador), não mais de settings.
    const secrets = await PropertySecretsService.get(propertyId);
    const apiUrl = cfg?.apiUrl || process.env.EVOLUTION_API_URL;
    const apiKey = secrets.evolutionApiKey || process.env.EVOLUTION_API_KEY;
    const instanceName = cfg?.instanceName
      || cfg?.instances?.[0]?.instanceName
      || process.env.EVOLUTION_INSTANCE;

    // Fora de produção o chat não fala com a Evolution real — a mensagem entra no banco
    // como enviada (a conversa continua legível no admin) e o conteúdo vai para o log.
    if (isSafeMode()) {
      logSuppressedSend("whatsapp", number, String(message).slice(0, 60));
      await supabaseAdmin
        .from("messages")
        .update({ status: "sent", messageIdApi: null })
        .eq("id", messageId);
      return NextResponse.json({ success: true, messageId: null, safeMode: true });
    }

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
      const rawText = await response.text();
      console.error("[chat/send] Evolution API error:", response.status, rawText);
      const errorMessage = parseEvolutionError(response.status, rawText);
      await supabaseAdmin
        .from("messages")
        .update({ status: "failed", errorMessage })
        .eq("id", messageId);
      return NextResponse.json({ error: errorMessage }, { status: response.status });
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
