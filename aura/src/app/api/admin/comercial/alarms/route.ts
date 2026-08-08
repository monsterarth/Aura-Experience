// Alarmes comerciais (follow-up, cobrança, lembrete) — de leads ativos E de
// negociações fechadas. GET ?funnel= filtra a fila de um funil; ?entityId=
// filtra o drawer de um lead.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess, AuthResult } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { CrmService } from "@/services/crm-service";
import { WeddingService } from "@/services/wedding-service";
import { CrmAlarm, CrmEntityType } from "@/types/aura";

/** Prefixo das linhas virtuais (parcela vencida) — não existem em crm_alarms. */
const VIRTUAL_PREFIX = "inst_";

export const dynamic = "force-dynamic";

const ROLES = ["super_admin", "admin", "manager", "reception"] as const;

function parseFunnel(v: string | null | undefined): CrmEntityType | undefined {
  return v === "quote" || v === "wedding" ? v : undefined;
}

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

  const entityType = parseFunnel(params.get("funnel") || params.get("entityType"));
  const entityId = params.get("entityId") || undefined;

  try {
    const alarms = await CrmService.listAlarms(propertyId, { entityType, entityId });

    // Fila de casamentos mescla as parcelas VENCIDAS como cobranças virtuais —
    // sem estado duplicado: a fonte é wedding_installments; "concluir" = pagar.
    // A mescla fica na rota (e não no CrmService) para não criar ciclo de
    // import: wedding-service já importa crm-service.
    if (entityType === "wedding" && !entityId) {
      const overdue = await WeddingService.listOverdueInstallments(propertyId);
      const virtual: CrmAlarm[] = overdue.map((i) => ({
        id: `${VIRTUAL_PREFIX}${i.id}`,
        propertyId,
        entityType: "wedding",
        entityId: i.weddingId,
        entityLabel: i.couple,
        kind: "payment",
        title: `Parcela vencida: ${i.label}`,
        note: `R$ ${Number(i.value).toFixed(2)} — concluir marca como paga`,
        dueAt: i.dueDate!,
        dueTime: null,
        done: false,
        createdAt: i.createdAt ?? i.dueDate!,
        virtual: true,
      }));
      alarms.push(...virtual);
      alarms.sort((a, b) => (a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0));
    }

    return NextResponse.json({ alarms });
  } catch (e) {
    console.error("Erro ao listar alarmes:", e);
    return NextResponse.json({ error: "Falha ao listar alarmes." }, { status: 500 });
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
    const alarm = await CrmService.createAlarm(propertyId, {
      entityType: body?.entityType,
      entityId: String(body?.entityId || ""),
      entityLabel: String(body?.entityLabel || ""),
      kind: body?.kind,
      title: String(body?.title || ""),
      note: body?.note ?? null,
      dueAt: String(body?.dueAt || ""),
      dueTime: body?.dueTime ?? null,
    }, { id: g.auth.staff.id, name: g.auth.staff.fullName });
    return NextResponse.json({ alarm });
  } catch (e) {
    console.error("Erro ao criar alarme:", e);
    const msg = e instanceof Error ? e.message : "Falha ao criar o alarme.";
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
  if (!body?.id) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const id = String(body.id);

  try {
    // Linha virtual: concluir a cobrança = marcar a parcela como paga.
    if (id.startsWith(VIRTUAL_PREFIX)) {
      await WeddingService.setInstallmentPaid(
        propertyId, id.slice(VIRTUAL_PREFIX.length), body.done !== false,
        { id: g.auth.staff.id, name: g.auth.staff.fullName }
      );
      return NextResponse.json({ ok: true });
    }

    const alarm = await CrmService.setAlarmDone(
      propertyId, id, body.done !== false,
      { id: g.auth.staff.id, name: g.auth.staff.fullName }
    );
    return NextResponse.json({ alarm });
  } catch (e) {
    console.error("Erro ao concluir alarme:", e);
    const msg = e instanceof Error ? e.message : "Falha ao concluir o alarme.";
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
  if (id.startsWith(VIRTUAL_PREFIX)) {
    return NextResponse.json(
      { error: "Cobrança de parcela se gerencia na gestão do evento (aba financeiro)." },
      { status: 400 }
    );
  }

  try {
    await CrmService.deleteAlarm(propertyId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir alarme:", e);
    return NextResponse.json({ error: "Falha ao excluir o alarme." }, { status: 500 });
  }
}
