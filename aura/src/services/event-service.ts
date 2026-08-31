// src/services/event-service.ts
//
// SERVER-ONLY. Usa `supabaseAdmin` (service-role) e é consumido pela rota
// `/api/admin/eventos`, nunca importado por componente de tela.
//
// Antes este arquivo importava o client do NAVEGADOR: as páginas de Eventos e
// Calendário liam e escreviam direto do browser, apoiadas na policy
// `Staff can manage events USING(true)`. A escrita ainda era spread cru do
// formulário. A troca para service-role só é segura porque a rota valida sessão,
// cargo e propriedade antes de chegar aqui — o saneamento do corpo vive em
// `@/lib/event-payload`.
import { supabaseAdmin } from "@/lib/supabase";
import { Event, EventStatus, EventType, EventCategory } from "@/types/aura";
import { notEndedBefore } from "@/lib/event-dates";
import { AuditService } from "./audit-service";

export interface EventFilters {
  status?: EventStatus;
  type?: EventType;
  category?: EventCategory;
  featured?: boolean;
}

/** Falha alto e cedo se alguém importar isto no browser. */
function db() {
  if (!supabaseAdmin) throw new Error("EventService é server-only (supabaseAdmin ausente).");
  return supabaseAdmin;
}

export const EventService = {

  async getEvents(propertyId: string, filters?: EventFilters): Promise<Event[]> {
    let query = db()
      .from('events')
      .select('*')
      .eq('propertyId', propertyId)
      .order('startDate', { ascending: true });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.type) query = query.eq('type', filters.type);
    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.featured !== undefined) query = query.eq('featured', filters.featured);

    const { data, error } = await query;
    if (error) { console.error("Error fetching events:", error); return []; }
    return data as Event[];
  },

  async getPublishedEvents(propertyId: string, fromDate?: string): Promise<Event[]> {
    let query = db()
      .from('events')
      .select('*')
      .eq('propertyId', propertyId)
      .eq('status', 'published')
      .order('startDate', { ascending: true });

    // Corte pelo FIM: evento em curso continua na lista até terminar. Data
    // malformada cai no mesmo caminho de "sem fromDate" (devolve tudo que está
    // publicado) em vez de virar filtro interpolado.
    if (fromDate) {
      const notEnded = notEndedBefore(fromDate);
      if (notEnded) query = query.or(notEnded);
    }

    const { data, error } = await query;
    if (error) { console.error("Error fetching published events:", error); return []; }
    return data as Event[];
  },

  async getEventsForCalendar(propertyId: string, year: number, month: number): Promise<Event[]> {
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endOfMonth = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const { data, error } = await db()
      .from('events')
      .select('*')
      .eq('propertyId', propertyId)
      .neq('status', 'cancelled')
      .lte('startDate', endOfMonth)
      .or(notEndedBefore(startOfMonth)!);

    if (error) { console.error("Error fetching calendar events:", error); return []; }
    return data as Event[];
  },


  /** `data` já vem saneado por `sanitizeEventInput` — a rota é a única porta. */
  async createEvent(
    propertyId: string,
    data: Record<string, unknown>,
    actorId: string,
    actorName: string
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error } = await db().from('events').insert({
      ...data, id, propertyId, createdAt: now, updatedAt: now,
    });
    if (error) throw error;

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: 'EVENT_CREATED',
      entity: 'EVENT',
      entityId: id,
      details: `Evento "${data.title ?? ''}" criado.`,
    });

    return id;
  },

  /** Devolve false quando nenhuma linha casou (id inexistente ou de outra propriedade). */
  async updateEvent(
    propertyId: string,
    id: string,
    data: Record<string, unknown>,
    actorId: string,
    actorName: string
  ): Promise<boolean> {
    const { data: rows, error } = await db()
      .from('events')
      .update({ ...data, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .eq('propertyId', propertyId)
      .select('id, title');

    if (error) throw error;
    if (!rows || rows.length === 0) return false;

    // Publicar tem peso próprio na auditoria: é o ato que leva o evento para a
    // tela do hóspede. Despublicar volta a ser edição comum.
    const published = data.status === 'published';
    const title = (rows[0] as { title?: string }).title ?? '';
    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: published ? 'EVENT_PUBLISHED' : 'EVENT_UPDATED',
      entity: 'EVENT',
      entityId: id,
      details: published ? `Evento "${title}" publicado.` : `Evento "${title}" atualizado.`,
    });
    return true;
  },

  /** Exclusão lógica: vira `cancelled`. Devolve false quando nada casou. */
  async deleteEvent(
    propertyId: string,
    id: string,
    actorId: string,
    actorName: string
  ): Promise<boolean> {
    const { data: rows, error } = await db()
      .from('events')
      .update({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .eq('id', id)
      .eq('propertyId', propertyId)
      .select('id, title');

    if (error) throw error;
    if (!rows || rows.length === 0) return false;

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: 'EVENT_DELETED',
      entity: 'EVENT',
      entityId: id,
      details: `Evento "${(rows[0] as { title?: string }).title ?? ''}" cancelado.`,
    });
    return true;
  },
};
