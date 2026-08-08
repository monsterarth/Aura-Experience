// Tarifário — vincula a estadia recém-criada ao orçamento que a originou:
// grava stayId no funil, leva o preço congelado para a estadia
// (nightlyRate/lodgingTotal) e faz o catch-up de diárias já vencidas.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";
import { FinanceService } from "@/services/finance-service";

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
  if (!body?.quoteId || !body?.stayId) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const result = await RateService.linkQuoteToStay(
      propertyId, String(body.quoteId), String(body.stayId),
      auth.staff.id, auth.staff.fullName
    );
    // Estadia retroativa: lança já as noites vencidas (senão o cron pega amanhã).
    const posted = await FinanceService
      .postDueLodgingForStay(propertyId, String(body.stayId))
      .catch(() => 0);
    return NextResponse.json({ ...result, nightsPosted: posted });
  } catch (e) {
    console.error("Erro ao vincular orçamento à estadia:", e);
    const msg = e instanceof Error ? e.message : "Falha ao vincular.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
