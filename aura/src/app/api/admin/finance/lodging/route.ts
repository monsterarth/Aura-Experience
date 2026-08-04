// Financeiro — painel de diárias da estadia.
// GET  lista as noites (valor efetivo, lançada ou não, negociada ou não)
// POST altera: pausar/retomar o automático, mudar o valor de UMA noite,
//      não cobrar uma noite ou voltar ao valor padrão.
//
// Escrita é SEMPRE gated por gerência: quem não é gerente precisa que um
// gerente digite e-mail e senha no modal (verificação server-side em
// requireManagerApproval — nunca no browser, que trocaria a sessão).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { requireManagerApproval, requestIp } from "@/lib/manager-override";
import { supabaseAdmin } from "@/lib/supabase";
import { FinanceService } from "@/services/finance-service";

export const dynamic = "force-dynamic";

const READ_ROLES = ["super_admin", "admin", "manager", "reception"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const url = new URL(req.url);
  const stayId = url.searchParams.get("stayId");
  const propertyId = url.searchParams.get("propertyId") || auth.staff.propertyId;
  if (!stayId || !propertyId) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    const data = await FinanceService.getLodgingNights(propertyId, stayId);
    // Informa a UI se este operador já pode confirmar sem chamar o gerente.
    const isManager = ["super_admin", "admin", "manager"].some(
      (r) => auth.staff.role === r || auth.staff.secondaryRoles?.includes(r as never)
    );
    return NextResponse.json({ ...data, isManager });
  } catch (e) {
    console.error("Erro ao carregar diárias:", e);
    return NextResponse.json({ error: "Falha ao carregar as diárias." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const stayId: string | undefined = body?.stayId;
  const action: string | undefined = body?.action;
  if (!propertyId || !stayId || !action) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // Gate de gerência (o próprio operador, ou o gerente que digitou no modal).
  const approval = await requireManagerApproval(
    {
      id: auth.staff.id, fullName: auth.staff.fullName, role: auth.staff.role,
      secondaryRoles: auth.staff.secondaryRoles, propertyId: auth.staff.propertyId,
    },
    body?.override,
    requestIp(req)
  );
  if (approval instanceof NextResponse) return approval;

  const actor = { id: auth.staff.id, name: auth.staff.fullName };

  try {
    if (action === "pause" || action === "resume") {
      await FinanceService.setLodgingPaused(
        propertyId, stayId, action === "pause", actor, approval.approvedByName
      );
      const data = await FinanceService.getLodgingNights(propertyId, stayId);
      return NextResponse.json({ success: true, ...data, approvedBy: approval.approvedByName });
    }

    if (action === "setNight") {
      const refDate: string = body?.refDate;
      if (!ISO_DATE.test(refDate || "")) {
        return NextResponse.json({ error: "Data inválida" }, { status: 400 });
      }
      // null = voltar ao padrão · 0 = não cobrar · >0 = valor negociado
      const raw = body?.value;
      const value = raw === null || raw === undefined ? null : Number(raw);
      if (value !== null && (!isFinite(value) || value < 0)) {
        return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
      }

      await FinanceService.setNightOverride(
        propertyId, stayId, refDate, value, actor, approval.approvedByName
      );
      const data = await FinanceService.getLodgingNights(propertyId, stayId);
      return NextResponse.json({ success: true, ...data, approvedBy: approval.approvedByName });
    }

    return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
  } catch (e) {
    console.error("Erro ao alterar diárias:", e);
    const msg = e instanceof Error ? e.message : "Falha ao alterar as diárias.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
