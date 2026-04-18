import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { propertyId, messageId } = await req.json();

  if (!propertyId || !messageId) {
    return NextResponse.json({ error: "Parâmetros incompletos" }, { status: 400 });
  }

  if (auth.staff.role !== "super_admin" && auth.staff.propertyId !== propertyId) {
    return NextResponse.json({ error: "Sem permissão para esta propriedade." }, { status: 403 });
  }

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .eq("propertyId", propertyId)
    .single();

  if (!msg) return NextResponse.json({ error: "Mensagem não encontrada." }, { status: 404 });

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("settings")
    .eq("id", propertyId)
    .single();

  const cfg = property?.settings?.whatsappConfig ?? {};
  const apiUrl: string = cfg.apiUrl || process.env.EVOLUTION_API_URL || "";
  const apiKey: string = cfg.apiKey || process.env.EVOLUTION_API_KEY || "";
  const instanceName: string =
    cfg.instanceName ||
    cfg.instances?.[0]?.instanceName ||
    process.env.EVOLUTION_INSTANCE ||
    "";

  console.log("[send-now] cfg from DB:", JSON.stringify({ apiUrl: cfg.apiUrl, hasApiKey: !!cfg.apiKey, instanceName: cfg.instanceName }));
  console.log("[send-now] resolved:", JSON.stringify({ apiUrl, hasApiKey: !!apiKey, instanceName }));

  if (!apiUrl || !apiKey || !instanceName) {
    return NextResponse.json({ error: `Configuração incompleta: apiUrl=${!!apiUrl} apiKey=${!!apiKey} instanceName=${!!instanceName}` }, { status: 500 });
  }

  const baseUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;

  await supabaseAdmin.from("messages").update({ status: "processing" }).eq("id", messageId);

  console.log("[send-now] POST", `${baseUrl}/message/sendText/${instanceName}`, "to:", msg.to);

  const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: msg.to, text: msg.body }),
  });

  if (!response.ok) {
    const rawText = await response.text();
    console.error("[send-now] Evolution API error:", response.status, rawText);
    let errorMessage = `HTTP ${response.status}`;
    try { const j = JSON.parse(rawText); errorMessage = j.error || j.message || j.response?.message || rawText; } catch { errorMessage = rawText || errorMessage; }
    await supabaseAdmin
      .from("messages")
      .update({ status: "failed", attempts: (msg.attempts || 0) + 1, errorMessage, lastAttemptAt: new Date().toISOString() })
      .eq("id", messageId);
    return NextResponse.json({ error: errorMessage }, { status: response.status });
  }

  const data = await response.json();
  const apiMessageId = data?.key?.id || null;

  await supabaseAdmin
    .from("messages")
    .update({ status: "sent", messageIdApi: apiMessageId, attempts: (msg.attempts || 0) + 1, lastAttemptAt: new Date().toISOString(), errorMessage: null })
    .eq("id", messageId);

  return NextResponse.json({ success: true });
}
