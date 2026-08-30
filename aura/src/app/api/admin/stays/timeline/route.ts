// src/app/api/admin/stays/timeline/route.ts
// Linha do tempo de uma estadia — o extrato de tudo que aconteceu nela.
// A junção das dez fontes mora em StayTimelineService; aqui só a sessão e o escopo.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, scopedPropertyId } from "@/lib/api-auth";
import { serverError } from "@/lib/api-error";
import { StayTimelineService } from "@/services/stay-timeline-service";

export const dynamic = "force-dynamic";

const ROLES = ["super_admin", "admin", "manager", "reception", "governance"] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const stayId = searchParams.get("stayId");
  if (!stayId) return NextResponse.json({ error: "stayId é obrigatório." }, { status: 400 });

  const propertyId = scopedPropertyId(auth, searchParams.get("propertyId"));
  if (!propertyId) return NextResponse.json({ error: "Propriedade não resolvida." }, { status: 400 });

  try {
    const events = await StayTimelineService.getForStay(propertyId, stayId);
    return NextResponse.json({ events });
  } catch (e) {
    return serverError("stays/timeline", e);
  }
}
