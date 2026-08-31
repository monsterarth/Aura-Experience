import { NextResponse } from "next/server";
import { fanOut, fanOutByRole } from "@/lib/push-notify";

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

  const payload = {
    title: "Nova tarefa de manutenção",
    body: "Uma nova tarefa de manutenção foi atribuída.",
    url: "/maintenance",
    tag: `maintenance-task-${record.id}`,
    role: "maintenance",
  };

  // Com responsável, só ele; sem responsável, a equipe toda da propriedade.
  if (assignedTo.length > 0) {
    await fanOut(assignedTo, propertyId, payload);
  } else {
    await fanOutByRole(propertyId, ["maintenance", "technician", "admin", "manager", "super_admin"], payload);
  }

  return NextResponse.json({ ok: true });
}
