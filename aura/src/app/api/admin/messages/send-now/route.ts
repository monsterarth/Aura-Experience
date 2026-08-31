import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { resolveEvolutionConfig, sendEvolutionText } from "@/lib/evolution";

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

  const cfg = await resolveEvolutionConfig(propertyId);
  if (!cfg.ok) {
    return NextResponse.json({ error: cfg.message }, { status: 500 });
  }

  await supabaseAdmin.from("messages").update({ status: "processing" }).eq("id", messageId);

  const sent = await sendEvolutionText(cfg.config, msg.to, msg.body, "send-now");
  const now = new Date().toISOString();
  const attempts = (msg.attempts || 0) + 1;

  if (!sent.ok) {
    await supabaseAdmin
      .from("messages")
      .update({ status: "failed", attempts, errorMessage: sent.errorMessage, lastAttemptAt: now })
      .eq("id", messageId);
    return NextResponse.json({ error: sent.errorMessage }, { status: sent.status ?? 500 });
  }

  await supabaseAdmin
    .from("messages")
    .update({ status: "sent", messageIdApi: sent.apiMessageId, attempts, lastAttemptAt: now, errorMessage: null })
    .eq("id", messageId);

  // No modo seguro nada saiu: a mensagem consta como enviada e o envio não vira log de auditoria.
  if (sent.safeMode) return NextResponse.json({ success: true, safeMode: true });

  // Nome do contato (id = número) e trecho do corpo — o log conta a história
  // sozinho; o UUID da mensagem fica só no entityId.
  const { data: contact } = await supabaseAdmin
    .from("contacts").select("name").eq("id", msg.to).eq("propertyId", propertyId).maybeSingle();
  const snippet = (msg.body || "").slice(0, 60) + ((msg.body || "").length > 60 ? "…" : "");
  await supabaseAdmin.from("audit_logs").insert({
    id: crypto.randomUUID(),
    propertyId,
    userId: auth.staff.id,
    userName: auth.staff.fullName,
    action: "MESSAGE_MANUAL_SEND",
    entity: "MESSAGE",
    entityId: messageId,
    details: `Reenvio manual para ${contact?.name ?? msg.to}: "${snippet}"`,
    timestamp: new Date().toISOString()
  });

  return NextResponse.json({ success: true });
}
