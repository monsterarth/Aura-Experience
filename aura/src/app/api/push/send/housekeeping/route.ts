import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendPushNotification } from "@/lib/push-server";

export const dynamic = "force-dynamic";

async function cleanExpired(endpoint: string) {
  await supabaseAdmin!.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

async function fanOut(
  staffIds: string[],
  propertyId: string,
  payload: Parameters<typeof sendPushNotification>[1]
) {
  const { data: subs } = await supabaseAdmin!
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("staffId", staffIds)
    .eq("propertyId", propertyId);

  if (!subs?.length) return;

  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPushNotification(sub, payload);
      if (result.gone) await cleanExpired(sub.endpoint);
    })
  );
}

async function fanOutByRole(
  propertyId: string,
  roles: string[],
  payload: Parameters<typeof sendPushNotification>[1]
) {
  const { data: subs } = await supabaseAdmin!
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("propertyId", propertyId)
    .in("role", roles);

  if (!subs?.length) return;

  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPushNotification(sub, payload);
      if (result.gone) await cleanExpired(sub.endpoint);
    })
  );
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { type: string; record: any; old_record?: any };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const { type, record, old_record } = body;
  const propertyId: string = record?.propertyId;
  if (!propertyId) return NextResponse.json({ ok: true });

  // INSERT: notifica maids assignadas
  if (type === "INSERT") {
    const assignedTo: string[] = record.assignedTo ?? [];
    if (assignedTo.length > 0) {
      await fanOut(assignedTo, propertyId, {
        title: "Nova tarefa",
        body: "Você recebeu uma nova tarefa de governança.",
        url: "/maid",
        tag: `maid-task-${record.id}`,
        role: "maid",
      });
    }
  }

  // UPDATE: notifica governance quando status muda para waiting_conference
  if (
    type === "UPDATE" &&
    record.status === "waiting_conference" &&
    old_record?.status !== "waiting_conference"
  ) {
    await fanOutByRole(propertyId, ["governance", "admin", "manager", "super_admin"], {
      title: "Conferência pendente",
      body: "Uma tarefa aguarda sua conferência de qualidade.",
      url: "/governanta",
      tag: `gov-conference-${record.id}`,
      role: "governance",
    });
  }

  // UPDATE: notifica maids recém-adicionadas ao assignedTo
  if (type === "UPDATE") {
    const newIds: string[] = record.assignedTo ?? [];
    const oldIds: string[] = old_record?.assignedTo ?? [];
    const added = newIds.filter((id: string) => !oldIds.includes(id));
    if (added.length > 0) {
      await fanOut(added, propertyId, {
        title: "Tarefa atribuída",
        body: "Você recebeu uma nova tarefa de governança.",
        url: "/maid",
        tag: `maid-task-${record.id}`,
        role: "maid",
      });
    }
  }

  return NextResponse.json({ ok: true });
}
