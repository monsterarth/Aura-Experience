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

  const assignedTo: string[] = record.assignedTo ?? [];

  let subs: { endpoint: string; p256dh: string; auth: string }[] = [];

  if (assignedTo.length > 0) {
    // Notifica apenas os técnicos assignados
    const { data } = await supabaseAdmin!
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("staffId", assignedTo)
      .eq("propertyId", propertyId);
    subs = data ?? [];
  } else {
    // Sem assignação: notifica todos os técnicos/manutenção da propriedade
    const { data } = await supabaseAdmin!
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("propertyId", propertyId)
      .in("role", ["maintenance", "technician", "admin", "manager", "super_admin"]);
    subs = data ?? [];
  }

  if (!subs.length) return NextResponse.json({ ok: true });

  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPushNotification(sub, {
        title: "Nova tarefa de manutenção",
        body: "Uma nova tarefa de manutenção foi atribuída.",
        url: "/maintenance",
        tag: `maintenance-task-${record.id}`,
        role: "maintenance",
      });
      if (result.gone) {
        await supabaseAdmin!.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    })
  );

  return NextResponse.json({ ok: true });
}
