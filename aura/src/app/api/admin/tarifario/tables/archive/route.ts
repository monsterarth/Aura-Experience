// Tarifário — arquivar/restaurar tabela de preços (gestão). Arquivada some
// das listas ativas e dos selects de período; regra antiga que ainda aponta
// para ela continua resolvendo (a resposta lista essas regras para a UI
// avisar sem bloquear).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const ROLES = ["super_admin", "admin", "manager"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!body?.id || typeof body?.archived !== "boolean") {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const result = await RateService.archiveTable(
      propertyId, String(body.id), body.archived,
      { id: auth.staff.id, name: auth.staff.fullName }
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao arquivar a tabela.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
