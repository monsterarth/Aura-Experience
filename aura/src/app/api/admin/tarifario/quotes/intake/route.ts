// Tarifário — cadastro do titular preenchido pelo CLIENTE na proposta pública.
//
// GET  ?id=  → devolve o `intake` para o drawer do lead (dado sensível: CPF,
//              endereço — por isso não vem no pipeline, só sob demanda e com
//              sessão).
// POST       → correção pela recepção. O link do cliente trava no primeiro
//              envio; consertar um CPF trocado é trabalho de quem tem sessão.
//
// Rota própria (e não o PATCH genérico do orçamento) porque `intake` é
// estruturado — QUOTE_PATCH_FIELDS é para colunas escalares.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";
import { QuoteIntake } from "@/types/aura";

export const dynamic = "force-dynamic";

const READ_ROLES = ["super_admin", "admin", "manager", "reception"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const propertyId = url.searchParams.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId ?? undefined);
  if (denied) return denied;
  if (!id || !propertyId) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { data } = await supabaseAdmin
    .from("rate_quotes")
    .select("intake, intakeAt")
    .eq("id", id)
    .eq("propertyId", propertyId)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  return NextResponse.json({ intake: data.intake ?? null, intakeAt: data.intakeAt ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId || !body?.id || !body?.intake) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const intake = await RateService.updateQuoteIntake(
      propertyId,
      String(body.id),
      body.intake as Partial<QuoteIntake>,
      { id: auth.staff.id, name: auth.staff.fullName }
    );
    return NextResponse.json({ intake });
  } catch (e) {
    console.error("Erro ao corrigir o cadastro do titular:", e);
    const msg = e instanceof Error ? e.message : "Falha ao salvar o cadastro.";
    const bad = /não encontrado|ainda não tem cadastro/i.test(msg);
    return NextResponse.json({ error: msg }, { status: bad ? 400 : 500 });
  }
}
