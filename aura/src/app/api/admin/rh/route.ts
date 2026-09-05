// src/app/api/admin/rh/route.ts
//
// Lado administrativo do RH v2: a grade do mês, os padrões de jornada, os
// modelos, as ausências e a publicação.
//
// O gate de módulo é POR SEÇÃO, não pela rota inteira. `pessoas` é core — toda
// propriedade tem funcionário — enquanto `escala` e `ausencias` só respondem com
// o módulo `rh` ligado. Esconder no menu e deixar a rota aberta não é
// modularizar, é maquiar; mas fechar a rota inteira tiraria o cadastro de equipe
// de quem não contratou escala.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, scopedPropertyId, requireModule } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { HRService, patternLabel } from "@/services/hr-service";
import { daysOfMonth } from "@/lib/schedule-engine";
import type { UserRole } from "@/types/aura";
import type { WorkPattern } from "@/lib/schedule-engine";
import type { AbsenceStatus, AbsenceType } from "@/types/hr";

export const dynamic = "force-dynamic";

/** Quem monta a escala. Centralizado por decisão do dono — uma pessoa monta a de todos os setores. */
const WRITE_ROLES: UserRole[] = ["super_admin", "admin", "manager"];
/** Quem consulta. A governança precisa ver quem está de serviço para distribuir faxina. */
const READ_ROLES: UserRole[] = ["super_admin", "admin", "manager", "governance", "reception", "director"];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const rhOff = (propertyId: string) => requireModule(propertyId, "rh");

function badMonth(month: string | null): month is null {
  return !month || !MONTH_RE.test(month);
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(READ_ROLES);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const propertyId = scopedPropertyId(auth, searchParams.get("propertyId"));
  if (!propertyId) return NextResponse.json({ error: "propertyId é obrigatório." }, { status: 400 });

  const section = searchParams.get("section") ?? "escala";

  try {
    if (section === "escala") {
      const off = await rhOff(propertyId);
      if (off) return off;
      const month = searchParams.get("month");
      if (badMonth(month)) return NextResponse.json({ error: "month no formato YYYY-MM é obrigatório." }, { status: 400 });
      return NextResponse.json(await HRService.getMonthGrid(propertyId, month));
    }

    // Os dias já materializados de um período. É o que os painéis (gestão e
    // direção) consomem no lugar de recalcular a escala no navegador.
    if (section === "dias") {
      const off = await rhOff(propertyId);
      if (off) return off;
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      if (!from || !to) return NextResponse.json({ error: "from e to são obrigatórios." }, { status: 400 });
      return NextResponse.json(await HRService.getShifts(propertyId, from, to));
    }

    if (section === "ausencias") {
      const off = await rhOff(propertyId);
      if (off) return off;
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      if (!from || !to) return NextResponse.json({ error: "from e to são obrigatórios." }, { status: 400 });
      return NextResponse.json(await HRService.getAbsences(propertyId, from, to));
    }

    if (section === "padroes") {
      const off = await rhOff(propertyId);
      if (off) return off;
      const staffId = searchParams.get("staffId");
      const padroes = staffId
        ? await HRService.getPatternsForStaff(staffId, propertyId)
        : await HRService.getPatterns(propertyId);
      // O rótulo vem pronto do servidor: é derivado da FORMA do padrão, e
      // recalculá-lo na tela seria a segunda cópia da regra.
      return NextResponse.json(padroes.map(p => ({ ...p, label: patternLabel(p) })));
    }

    if (section === "modelos") {
      const off = await rhOff(propertyId);
      if (off) return off;
      return NextResponse.json(await HRService.getTemplates(propertyId));
    }

    // `pessoas` é CORE: responde mesmo com o módulo desligado.
    if (section === "pessoas") {
      const { data, error } = await supabaseAdmin
        .from("staff")
        .select("id, fullName, role, active, hireDate, timeSource, profilePictureUrl")
        .eq("propertyId", propertyId)
        .order("active", { ascending: false })
        .order("role")
        .order("fullName");
      if (error) throw new Error(error.message);
      return NextResponse.json(data ?? []);
    }

    return NextResponse.json({ error: `Seção desconhecida: ${section}.` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao ler o RH." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(WRITE_ROLES);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const propertyId = scopedPropertyId(auth, typeof body.propertyId === "string" ? body.propertyId : null);
  if (!propertyId) return NextResponse.json({ error: "propertyId é obrigatório." }, { status: 400 });

  const off = await rhOff(propertyId);
  if (off) return off;

  const actor = { id: auth.staff.id, name: auth.staff.fullName ?? "—" };
  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "materializar": {
        const month = String(body.month ?? "");
        if (badMonth(month)) return NextResponse.json({ error: "month inválido." }, { status: 400 });
        const dias = daysOfMonth(month);
        const r = await HRService.materialize(propertyId, dias[0], dias[dias.length - 1]);
        return NextResponse.json(r);
      }

      case "publicar": {
        const month = String(body.month ?? "");
        if (badMonth(month)) return NextResponse.json({ error: "month inválido." }, { status: 400 });
        return NextResponse.json(await HRService.publishMonth(propertyId, month, actor));
      }

      case "despublicar": {
        const month = String(body.month ?? "");
        if (badMonth(month)) return NextResponse.json({ error: "month inválido." }, { status: 400 });
        await HRService.unpublishMonth(propertyId, month);
        return NextResponse.json({ ok: true });
      }

      case "replicar": {
        const month = String(body.month ?? "");
        if (badMonth(month)) return NextResponse.json({ error: "month inválido." }, { status: 400 });
        const copiados = await HRService.replicatePreviousMonth(propertyId, month, actor);
        return NextResponse.json({ copiados });
      }

      case "salvarPadrao": {
        const p = body.pattern as Record<string, unknown> | undefined;
        if (!p?.staffId || !p?.base || !p?.effectiveFrom) {
          return NextResponse.json({ error: "pattern precisa de staffId, base e effectiveFrom." }, { status: 400 });
        }
        // Campos escolhidos um a um de propósito: espalhar o corpo deixaria o
        // cliente escrever qualquer coluna da tabela, `propertyId` incluído.
        const salvo = await HRService.savePattern(
          {
            id: p.id ? String(p.id) : undefined,
            staffId: String(p.staffId),
            propertyId,
            templateId: p.templateId ? String(p.templateId) : null,
            base: p.base as WorkPattern["base"],
            startTime: p.startTime ? String(p.startTime) : null,
            endTime: p.endTime ? String(p.endTime) : null,
            weekdays: Array.isArray(p.weekdays) ? (p.weekdays as number[]) : null,
            cycleOnDays: typeof p.cycleOnDays === "number" ? p.cycleOnDays : null,
            cycleOffDays: typeof p.cycleOffDays === "number" ? p.cycleOffDays : null,
            cycleAnchor: p.cycleAnchor ? String(p.cycleAnchor) : null,
            rules: Array.isArray(p.rules) ? (p.rules as WorkPattern["rules"]) : [],
            weekdayTimeOverrides: (p.weekdayTimeOverrides ?? null) as WorkPattern["weekdayTimeOverrides"],
            effectiveFrom: String(p.effectiveFrom),
            effectiveTo: p.effectiveTo ? String(p.effectiveTo) : null,
            note: p.note ? String(p.note) : null,
          },
          actor,
        );
        // A escala do mês corrente em diante passa a valer já — senão a pessoa
        // salva o padrão e a grade continua mostrando o anterior.
        const mesAtual = String(body.month ?? "").match(MONTH_RE)
          ? String(body.month)
          : String(salvo.effectiveFrom).slice(0, 7);
        const dias = daysOfMonth(mesAtual);
        await HRService.materialize(propertyId, dias[0], dias[dias.length - 1], {
          staffIds: [salvo.staffId],
        });
        return NextResponse.json(salvo);
      }

      case "ajustarDia": {
        const d = body.day as Record<string, unknown> | undefined;
        if (!d?.staffId || !d?.date) {
          return NextResponse.json({ error: "day precisa de staffId e date." }, { status: 400 });
        }
        return NextResponse.json(
          await HRService.setDay(
            {
              staffId: String(d.staffId),
              propertyId,
              date: String(d.date),
              isWork: Boolean(d.isWork),
              startTime: d.startTime ? String(d.startTime) : null,
              endTime: d.endTime ? String(d.endTime) : null,
              note: d.note ? String(d.note) : null,
            },
            actor,
          ),
        );
      }

      case "desfazerDia": {
        const staffId = String(body.staffId ?? "");
        const date = String(body.date ?? "");
        if (!staffId || !date) return NextResponse.json({ error: "staffId e date são obrigatórios." }, { status: 400 });
        await HRService.resetDay(staffId, propertyId, date);
        return NextResponse.json({ ok: true });
      }

      case "salvarAusencia": {
        const a = body.absence as Record<string, unknown> | undefined;
        if (!a?.staffId || !a?.type || !a?.startDate || !a?.endDate) {
          return NextResponse.json({ error: "absence precisa de staffId, type, startDate e endDate." }, { status: 400 });
        }
        return NextResponse.json(
          await HRService.saveAbsence(
            {
              id: a.id ? String(a.id) : undefined,
              staffId: String(a.staffId),
              propertyId,
              type: a.type as AbsenceType,
              startDate: String(a.startDate),
              endDate: String(a.endDate),
              isPartialDay: Boolean(a.isPartialDay),
              startTime: a.startTime ? String(a.startTime) : null,
              endTime: a.endTime ? String(a.endTime) : null,
              status: (a.status as AbsenceStatus) ?? "confirmada",
              reason: a.reason ? String(a.reason) : null,
              documentUrl: a.documentUrl ? String(a.documentUrl) : null,
              createdBy: null,
              createdByName: null,
            },
            actor,
          ),
        );
      }

      case "apagarAusencia": {
        const id = String(body.id ?? "");
        if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
        await HRService.deleteAbsence(id);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Ação desconhecida: ${action}.` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao gravar no RH." },
      { status: 500 },
    );
  }
}
