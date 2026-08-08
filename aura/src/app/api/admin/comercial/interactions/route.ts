// Hub Comercial — histórico de interações de um lead (timeline) + nota manual.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { CrmService } from "@/services/crm-service";
import { CrmEntityType } from "@/types/aura";

export const dynamic = "force-dynamic";

const ROLES = ["super_admin", "admin", "manager", "reception"] as const;

const isEntityType = (v: unknown): v is CrmEntityType => v === "quote" || v === "wedding";

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const url = new URL(req.url);
  const propertyId = url.searchParams.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  if (!isEntityType(entityType) || !entityId) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const interactions = await CrmService.getInteractions(propertyId, entityType, entityId);
  return NextResponse.json({ interactions });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  const { entityType, entityId } = body ?? {};
  const note = String(body?.note ?? "").trim();
  if (!isEntityType(entityType) || !entityId || !note) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  await CrmService.logInteraction(propertyId, entityType, String(entityId), "note", {
    note, actorId: auth.staff.id, actorName: auth.staff.fullName,
  });
  const interactions = await CrmService.getInteractions(propertyId, entityType, String(entityId));
  return NextResponse.json({ ok: true, interactions });
}
