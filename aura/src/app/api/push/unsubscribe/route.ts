import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { serverError } from "@/lib/api-error";

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const { endpoint } = body;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint é obrigatório." }, { status: 400 });
  }

  const { error } = await supabaseAdmin!
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("staffId", auth.staff.id);

  if (error) return serverError('push/unsubscribe', error);

  return NextResponse.json({ ok: true });
}
