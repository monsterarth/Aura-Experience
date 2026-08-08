// Tarifário — orçamentos salvos / funil de vendas (CRM leve).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["super_admin", "admin", "manager", "reception"] as const;
const DELETE_ROLES = ["super_admin", "admin", "manager"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const propertyId = new URL(req.url).searchParams.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  try {
    const quotes = await RateService.listQuotes(propertyId);
    return NextResponse.json({ quotes });
  } catch (e) {
    console.error("Erro ao listar orçamentos:", e);
    return NextResponse.json({ error: "Falha ao carregar o funil." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!body?.quote) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    const id = await RateService.saveQuote(propertyId, body.quote, auth.staff.id, auth.staff.fullName);
    return NextResponse.json({ id });
  } catch (e) {
    console.error("Erro ao salvar orçamento:", e);
    const msg = e instanceof Error ? e.message : "Falha ao salvar o orçamento.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!body?.id || !body?.patch) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    await RateService.updateQuote(propertyId, String(body.id), body.patch);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Erro ao atualizar orçamento:", e);
    return NextResponse.json({ error: "Falha ao atualizar o orçamento." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth([...DELETE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const propertyId = url.searchParams.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!id) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    await RateService.deleteQuote(propertyId, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Erro ao excluir orçamento:", e);
    return NextResponse.json({ error: "Falha ao excluir o orçamento." }, { status: 500 });
  }
}
