import { NextResponse } from "next/server";
import { fanOutByRole } from "@/lib/push-notify";

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

  await fanOutByRole(propertyId, ["houseman", "admin", "manager", "super_admin"], {
    title: "Novo pedido",
    body: "Há um novo pedido de concierge aguardando atendimento.",
    url: "/houseman",
    tag: `houseman-request-${record.id}`,
    role: "houseman",
  });

  return NextResponse.json({ ok: true });
}
