// Altera UMA acomodação do orçamento: a cabana escolhida (categoryId=null
// desmarca) e/ou o preço oferecido de UMA cabana dela (price.value=null volta
// ao tarifário). Endpoint próprio em vez de PATCH livre: o preço de tabela vem
// sempre das `options` calculadas no servidor, e a oferta manual é explícita —
// registrada na timeline e na auditoria com a cabana citada.
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
    // Só entra no patch o que veio no body — omitir é diferente de limpar.
    const patch: {
      selectedCategory?: string | null;
      price?: { categoryId: string; value: number | null };
    } = {};
    if ("categoryId" in body) patch.selectedCategory = body.categoryId ? String(body.categoryId) : null;
    if (body?.price?.categoryId) {
      patch.price = {
        categoryId: String(body.price.categoryId),
        value: body.price.value == null ? null : Number(body.price.value),
      };
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nada para alterar" }, { status: 400 });
    }

    const quote = await RateService.patchQuoteRoom(
      propertyId, String(body.id), String(body.roomId), patch,
      { id: auth.staff.id, name: auth.staff.fullName }
    );
    return NextResponse.json({ quote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao registrar a escolha.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
