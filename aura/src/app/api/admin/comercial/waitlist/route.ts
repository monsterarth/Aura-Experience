// Lista de espera para períodos — aba "Espera" da página Comercial · Reservas.
// GET ?id= devolve UMA entrada (usado pela calculadora em ?waitlistId=).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess, AuthResult } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { CrmService } from "@/services/crm-service";
import { WaitlistStatus } from "@/types/aura";

export const dynamic = "force-dynamic";

const ROLES = ["super_admin", "admin", "manager", "reception"] as const;

async function guard(): Promise<{ auth: AuthResult } | NextResponse> {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  return { auth };
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if (g instanceof NextResponse) return g;

  const params = new URL(req.url).searchParams;
  const propertyId = params.get("propertyId") || g.auth.staff.propertyId;
  const denied = assertPropertyAccess(g.auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  try {
    const id = params.get("id");
    if (id) {
      const entry = await CrmService.getWaitlistEntry(propertyId, id);
      if (!entry) return NextResponse.json({ error: "Entrada não encontrada." }, { status: 404 });
      return NextResponse.json({ entry });
    }
    const entries = await CrmService.listWaitlist(propertyId);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error("Erro ao listar a lista de espera:", e);
    return NextResponse.json({ error: "Falha ao carregar a lista de espera." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g instanceof NextResponse) return g;

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || g.auth.staff.propertyId;
  const denied = assertPropertyAccess(g.auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  try {
    const entry = await CrmService.createWaitlistEntry(propertyId, {
      name: String(body?.name ?? ""),
      phone: body?.phone ?? null,
      email: body?.email ?? null,
      periodStart: String(body?.periodStart ?? ""),
      periodEnd: String(body?.periodEnd ?? ""),
      guests: body?.guests != null ? Number(body.guests) : null,
      notes: body?.notes ?? null,
      source: body?.source ?? null,
    }, { id: g.auth.staff.id, name: g.auth.staff.fullName });
    return NextResponse.json({ entry });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao registrar na lista de espera.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (g instanceof NextResponse) return g;

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || g.auth.staff.propertyId;
  const denied = assertPropertyAccess(g.auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!body?.id || !body?.status) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    const entry = await CrmService.setWaitlistStatus(
      propertyId, String(body.id), body.status as WaitlistStatus,
      { quoteId: body.quoteId ? String(body.quoteId) : null }
    );
    return NextResponse.json({ entry });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao atualizar a entrada.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (g instanceof NextResponse) return g;

  const params = new URL(req.url).searchParams;
  const propertyId = params.get("propertyId") || g.auth.staff.propertyId;
  const denied = assertPropertyAccess(g.auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  const id = params.get("id");
  if (!id) return NextResponse.json({ error: "id ausente" }, { status: 400 });

  try {
    await CrmService.deleteWaitlistEntry(propertyId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir da lista de espera:", e);
    return NextResponse.json({ error: "Falha ao excluir a entrada." }, { status: 500 });
  }
}
