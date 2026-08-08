// Tarifário — conversão de orçamento (ganhou): garante a ficha do hóspede
// (vinculado, achado pelo documento ou criado a partir do lead) e marca 'won'.
// A página então abre /admin/stays/new pré-preenchida.
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
  if (!body?.id) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    const result = await RateService.convertQuote(
      propertyId,
      String(body.id),
      auth.staff.id,
      auth.staff.fullName
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error("Erro ao converter orçamento:", e);
    const msg = e instanceof Error ? e.message : "Falha ao converter o orçamento.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
