// src/app/api/admin/timeclock/route.ts
//
// Ponto — leitura do período e registro/correção de batidas.
//
// A regra de acesso que organiza o arquivo: **todo mundo mexe no próprio ponto,
// só a gestão mexe no dos outros.** Isso vale para ler e para escrever, e é
// verificado aqui e não na página — a tela esconde o que não serve, mas quem
// decide é a rota.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, hasRole, scopedPropertyId } from "@/lib/api-auth";
import { TimeClockService, type TimeClockActor } from "@/services/timeclock-service";
import type { UserRole } from "@/types/aura";

/** Quem pode ver e corrigir o ponto de outra pessoa. */
const MANAGER_ROLES: UserRole[] = ["super_admin", "admin", "manager"];

/**
 * IP de origem. Coletado em toda batida e **sem bloquear nada** — quando um dia
 * se quiser exigir "só de dentro da pousada", o histórico já dirá qual é o IP da
 * fazenda. (O navegador não lê o SSID do Wi-Fi: não existe API para isso.)
 */
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Data ISO válida? Impede que um campo vazio vire "Invalid Date" no banco. */
function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * GET /api/admin/timeclock?from=&to=&staffId=
 *
 * `from`/`to` são instantes ISO calculados pelo CLIENTE, que é quem conhece o
 * fuso da pousada — o servidor roda em UTC e não deve adivinhar onde o dia
 * começa. `to` é exclusivo.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const from = validIso(searchParams.get("from"));
  const to = validIso(searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json({ error: "Informe o período (from/to)." }, { status: 400 });
  }

  const isManager = hasRole(auth.staff.role, auth.staff.secondaryRoles, MANAGER_ROLES);
  const requestedStaffId = searchParams.get("staffId");
  // A leitura é SEMPRE de uma pessoa. Sem `staffId` explícito, é o próprio — um
  // gestor abrindo a página veria o ponto da pousada inteira empilhado num só
  // relatório, o que não é o ponto de ninguém. Sem cargo de gestão, o staffId
  // pedido é ignorado: nem 403, nem os dados de outra pessoa.
  const staffId = isManager && requestedStaffId ? requestedStaffId : auth.staff.id;
  const propertyId = scopedPropertyId(auth, searchParams.get("propertyId"));

  try {
    const events = await TimeClockService.listEvents({ staffId, from, to });

    // O painel de gestão precisa da lista de quem registra ponto para montar o
    // seletor de pessoa; o funcionário comum não recebe o cadastro dos colegas.
    const tracked = isManager && propertyId ? await TimeClockService.listTrackedStaff(propertyId) : [];

    return NextResponse.json({
      events,
      canManage: isManager,
      staff: tracked.map(s => ({ id: s.id, fullName: s.fullName, role: s.role, timeSource: s.timeSource ?? "none" })),
    });
  } catch (error: unknown) {
    console.error("[Aura API Error] GET timeclock:", error);
    return NextResponse.json({ error: "Erro ao carregar o ponto." }, { status: 500 });
  }
}

/**
 * POST /api/admin/timeclock
 * Ações: `punch` · `manual` · `adjust` · `delete`
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const isManager = hasRole(auth.staff.role, auth.staff.secondaryRoles, MANAGER_ROLES);
  const actor: TimeClockActor = { id: auth.staff.id, name: auth.staff.fullName };

  try {
    switch (action) {
      /* Bater o próprio ponto. Nunca aceita staffId do corpo: bater ponto por
         outra pessoa não é correção, é falsificação — quem precisa registrar
         para um colega usa `manual`, que fica marcado como digitado. */
      case "punch": {
        const kind = body.kind === "out" ? "out" : "in";
        // A propriedade vem da tela (validada por scopedPropertyId): o super_admin
        // não tem pousada fixa no cadastro, e sem isto a batida dele nasceria
        // órfã de propriedade em vez de ficar onde o trabalho aconteceu.
        const propertyId = scopedPropertyId(auth, typeof body.propertyId === "string" ? body.propertyId : null);
        const result = await TimeClockService.punch({
          staffId: auth.staff.id,
          propertyId,
          kind,
          actor,
          ip: clientIp(request),
          lat: toNumber(body.lat),
          lng: toNumber(body.lng),
          geoAccuracy: toNumber(body.geoAccuracy),
        });
        if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
        return NextResponse.json({ event: result.event });
      }

      case "manual": {
        const staffId = String(body.staffId ?? auth.staff.id);
        if (staffId !== auth.staff.id && !isManager) {
          return NextResponse.json({ error: "Sem permissão para lançar ponto de outra pessoa." }, { status: 403 });
        }
        const ts = validIso(body.ts);
        if (!ts) return NextResponse.json({ error: "Informe a data e a hora." }, { status: 400 });

        const target = staffId === auth.staff.id ? null : await TimeClockService.getStaff(staffId);
        if (staffId !== auth.staff.id && !target) {
          return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });
        }

        const event = await TimeClockService.addManual({
          staffId,
          // Batida de outra pessoa herda a propriedade DELA; a própria segue a
          // pousada ativa na tela, pelo mesmo motivo do punch.
          propertyId: target
            ? target.propertyId
            : scopedPropertyId(auth, typeof body.propertyId === "string" ? body.propertyId : null),
          ts,
          kind: body.kind === "out" ? "out" : "in",
          note: typeof body.note === "string" ? body.note : null,
          actor,
        });
        return NextResponse.json({ event });
      }

      case "adjust":
      case "delete": {
        const eventId = String(body.eventId ?? "");
        if (!eventId) return NextResponse.json({ error: "Batida não informada." }, { status: 400 });

        // A posse é conferida no servidor: sem isto, o id de uma batida alheia no
        // corpo do request bastaria para editar o ponto de outra pessoa.
        const target = await TimeClockService.getEvent(eventId);
        if (!target) return NextResponse.json({ error: "Batida não encontrada." }, { status: 404 });

        const isOwn = target.staffId === auth.staff.id;
        // Gestão alcança o ponto da própria pousada; atravessar propriedade é só
        // do super_admin, como no resto do admin.
        const sameProperty = target.propertyId === auth.staff.propertyId;
        const canTouch = isOwn || (isManager && (sameProperty || auth.staff.role === "super_admin"));
        if (!canTouch) {
          return NextResponse.json({ error: "Batida não encontrada." }, { status: 404 });
        }

        if (action === "adjust") {
          const ts = validIso(body.ts);
          if (!ts) return NextResponse.json({ error: "Informe o novo horário." }, { status: 400 });
          const event = await TimeClockService.adjust({
            eventId,
            ts,
            note: typeof body.note === "string" ? body.note : undefined,
            actor,
          });
          return NextResponse.json({ event });
        }

        await TimeClockService.remove({
          eventId,
          reason: typeof body.reason === "string" ? body.reason : null,
          actor,
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error("[Aura API Error] POST timeclock:", error);
    return NextResponse.json({ error: "Erro ao registrar o ponto." }, { status: 500 });
  }
}
