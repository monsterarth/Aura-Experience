import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let body: { endpoint?: string; p256dh?: string; auth?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const { endpoint, p256dh, auth: authKey } = body;
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "endpoint, p256dh e auth são obrigatórios." }, { status: 400 });
  }

  const { error } = await supabaseAdmin!
    .from("push_subscriptions")
    .upsert(
      {
        staffId: auth.staff.id,
        propertyId: auth.staff.propertyId,
        role: auth.staff.role,
        endpoint,
        p256dh,
        auth: authKey,
        updatedAt: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

  if (error) {
    console.error("[Push] subscribe error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
