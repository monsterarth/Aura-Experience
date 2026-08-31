import { NextResponse } from "next/server";
import { fanOut, fanOutByRole } from "@/lib/push-notify";

export const dynamic = "force-dynamic";

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
