// Escolha da cabana de UMA acomodação do orçamento (categoryId=null desmarca).
// Endpoint próprio em vez de PATCH livre: o preço vem sempre das `options` já
// calculadas no servidor — o cliente só aponta qual das opções quer.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["super_admin", "admin", "manager", "reception"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!body?.id || !body?.roomId) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    const quote = await RateService.selectRoomCategory(
      propertyId,
      String(body.id),
      String(body.roomId),
      body.categoryId ? String(body.categoryId) : null,
      { id: auth.staff.id, name: auth.staff.fullName }
    );
    return NextResponse.json({ quote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao registrar a escolha.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
