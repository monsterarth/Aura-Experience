import { supabase } from "@/lib/supabase";
import { Event, EventStatus, EventType, EventCategory } from "@/types/aura";
import { AuditService } from "./audit-service";

export interface EventFilters {
  status?: EventStatus;
  type?: EventType;
  category?: EventCategory;
  featured?: boolean;
}

export const EventService = {

  async getEvents(propertyId: string, filters?: EventFilters): Promise<Event[]> {
    let query = supabase
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
    let query = supabase
      .from('events')
      .select('*')
      .eq('propertyId', propertyId)
      .eq('status', 'published')
      .order('startDate', { ascending: true });

    if (fromDate) query = query.gte('startDate', fromDate);

    const { data, error } = await query;
    if (error) { console.error("Error fetching published events:", error); return []; }
    return data as Event[];
  },

  async getEventsForCalendar(propertyId: string, year: number, month: number): Promise<Event[]> {
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endOfMonth = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('propertyId', propertyId)
      .neq('status', 'cancelled')
      .lte('startDate', endOfMonth)
      .or(`endDate.gte.${startOfMonth},and(endDate.is.null,startDate.gte.${startOfMonth})`);

    if (error) { console.error("Error fetching calendar events:", error); return []; }
    return data as Event[];
  },

  async getEventById(propertyId: string, id: string): Promise<Event | null> {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .eq('propertyId', propertyId)
      .single();

    if (error || !data) return null;
    return data as Event;
  },

  async createEvent(
    propertyId: string,
    data: Omit<Event, 'id' | 'createdAt' | 'updatedAt'>,
    actorId: string,
    actorName: string
  ): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const payload = { ...data, id, propertyId, createdAt: now, updatedAt: now };

    const { error } = await supabase.from('events').insert(payload);
    if (error) throw error;

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: 'EVENT_CREATED',
      entity: 'EVENT',
      entityId: id,
      details: `Evento "${data.title}" criado.`,
    });

    return id;
  },

  async updateEvent(
    propertyId: string,
    id: string,
    data: Partial<Event>,
    actorId: string,
    actorName: string
  ): Promise<void> {
    const { error } = await supabase
      .from('events')
      .update({ ...data, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .eq('propertyId', propertyId);

    if (error) throw error;

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: 'EVENT_UPDATED',
      entity: 'EVENT',
      entityId: id,
      details: `Evento atualizado.`,
    });
  },

  async publishEvent(
    propertyId: string,
    id: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    const { error } = await supabase
      .from('events')
      .update({ status: 'published', updatedAt: new Date().toISOString() })
      .eq('id', id)
      .eq('propertyId', propertyId);

    if (error) throw error;

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: 'EVENT_PUBLISHED',
      entity: 'EVENT',
      entityId: id,
      details: `Evento publicado.`,
    });
  },

  async deleteEvent(
    propertyId: string,
    id: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    const { error } = await supabase
      .from('events')
      .update({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .eq('id', id)
      .eq('propertyId', propertyId);

    if (error) throw error;

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: 'EVENT_DELETED',
      entity: 'EVENT',
      entityId: id,
      details: `Evento cancelado/excluído.`,
    });
  },
};
