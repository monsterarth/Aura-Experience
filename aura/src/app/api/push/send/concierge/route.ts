import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendPushNotification } from "@/lib/push-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { type: string; record: any };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const { type, record } = body;
  if (type !== "INSERT") return NextResponse.json({ ok: true });

  const propertyId: string = record?.propertyId;
  if (!propertyId) return NextResponse.json({ ok: true });

  const { data: subs } = await supabaseAdmin!
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("propertyId", propertyId)
    .in("role", ["houseman", "admin", "manager", "super_admin"]);

  if (!subs?.length) return NextResponse.json({ ok: true });

  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPushNotification(sub, {
        title: "Novo pedido",
        body: "Há um novo pedido de concierge aguardando atendimento.",
        url: "/houseman",
        tag: `houseman-request-${record.id}`,
        role: "houseman",
      });
      if (result.gone) {
        await supabaseAdmin!.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    })
  );

  return NextResponse.json({ ok: true });
}
