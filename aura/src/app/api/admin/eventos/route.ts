// src/app/api/admin/eventos/route.ts
//
// CRUD de eventos server-side (fatia 2 do docs/EVENTS-V2.md).
//
// O módulo escrevia pelo client do NAVEGADOR (`event-service.ts` importava
// `@/lib/supabase`), com a policy `Staff can manage events USING(true)` anulando
// por OR o escopo por propriedade. Na prática: qualquer sessão de staff, de
// qualquer cargo e de qualquer propriedade, escrevia qualquer linha da tabela —
// e o `handleSave` mandava o objeto do formulário inteiro.
//
// Esta rota é o pré-requisito físico do resto do plano: sem ela, nenhum campo
// novo (aviso na cotação, `source` do parceiro) tem porta única de entrada.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api-error";
import { sanitizeEventInput } from "@/lib/event-payload";
import { EventService } from "@/services/event-service";

// Mesma lista da nav em Sidebar.tsx (item "eventos").
const EVENT_ROLES = ["super_admin", "admin", "reception", "manager"] as const;

/** propertyId do corpo/query só vale para quem é multi-propriedade. */
function resolveProperty(auth: { staff: { propertyId: string | null } }, requested: unknown) {
  return typeof requested === "string" && requested ? requested : auth.staff.propertyId;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth([...EVENT_ROLES]);
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const propertyId = resolveProperty(auth, url.searchParams.get("propertyId"));
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;

  try {
    // `scope=month` é o calendário: recorte por mês, incluindo o evento que
    // COMEÇA antes e atravessa o mês (o filtro de multi-dia da fatia 4).
    if (url.searchParams.get("scope") === "month") {
      const year = Number(url.searchParams.get("year"));
      const month = Number(url.searchParams.get("month"));
      if (!Number.isInteger(year) || year < 2000 || year > 2100 ||
          !Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json({ error: "Ano/mês inválidos." }, { status: 400 });
      }
      return NextResponse.json({ events: await EventService.getEventsForCalendar(propertyId!, year, month) });
    }

    return NextResponse.json({ events: await EventService.getEvents(propertyId!) });
  } catch (e) {
    return serverError("admin/eventos GET", e);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth([...EVENT_ROLES]);
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => null);
  const propertyId = resolveProperty(auth, (body as Record<string, unknown> | null)?.propertyId);
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;

  const clean = sanitizeEventInput(body, "create");
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

  try {
    const id = await EventService.createEvent(propertyId!, clean.data, auth.staff.id, auth.staff.fullName);
    return NextResponse.json({ id });
  } catch (e) {
    return serverError("admin/eventos POST", e);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth([...EVENT_ROLES]);
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

  const propertyId = resolveProperty(auth, body?.propertyId);
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;

  const clean = sanitizeEventInput(body, "update");
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

  try {
    // O update é escopado por (id, propertyId): id de outra propriedade não
    // casa nenhuma linha, então não há como editar evento alheio nem descobrir
    // que ele existe.
    const changed = await EventService.updateEvent(propertyId!, id, clean.data, auth.staff.id, auth.staff.fullName);
    if (!changed) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError("admin/eventos PATCH", e);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth([...EVENT_ROLES]);
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

  const propertyId = resolveProperty(auth, url.searchParams.get("propertyId"));
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;

  try {
    // Exclusão é lógica: vira `cancelled`. Evento apagado de verdade levaria
    // junto o histórico de quem já o viu na programação.
    const changed = await EventService.deleteEvent(propertyId!, id, auth.staff.id, auth.staff.fullName);
    if (!changed) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError("admin/eventos DELETE", e);
  }
}
