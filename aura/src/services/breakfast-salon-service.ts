// src/services/breakfast-salon-service.ts
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";
import { AuditService } from "./audit-service";
import {
  BreakfastSession, BreakfastAttendance, BreakfastTable, BreakfastVisitor, FBOrder
} from "@/types/aura";

// fb_orders usa snake_case — mapeamos para camelCase do domínio
const mapSalonOrder = (d: any): FBOrder => ({
  id: d.id,
  propertyId: d.property_id,
  stayId: d.stay_id ?? null,
  type: d.type,
  modality: d.modality,
  status: d.status,
  items: d.items ?? [],
  totalPrice: d.total_price ?? 0,
  deliveryTime: d.delivery_time ?? undefined,
  deliveryDate: d.delivery_date ?? undefined,
  tableId: d.table_id ?? undefined,
  attendanceId: d.attendance_id ?? undefined,
  requestedBy: d.requested_by ?? undefined,
  guestName: d.guest_name ?? undefined,
  cabinName: d.cabin_name ?? undefined,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});

export const BreakfastSalonService = {

  // ==========================================
  // SESSÃO
  // ==========================================

  async getTodaySession(propertyId: string): Promise<BreakfastSession | null> {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('breakfast_sessions')
      .select('*')
      .eq('propertyId', propertyId)
      .eq('date', today)
      .maybeSingle();
    return data as BreakfastSession | null;
  },

  async openSession(propertyId: string, actorName: string): Promise<BreakfastSession> {
    const today = new Date().toISOString().split('T')[0];
    const existing = await this.getTodaySession(propertyId);

    if (existing) {
      const { data } = await supabase
        .from('breakfast_sessions')
        .update({ status: 'open', openedAt: new Date().toISOString(), openedBy: actorName })
        .eq('id', existing.id)
        .select('*')
        .single();
      return data as BreakfastSession;
    }

    const id = uuidv4();
    const { data } = await supabase
      .from('breakfast_sessions')
      .insert({
        id,
        propertyId,
        date: today,
        status: 'open',
        openedAt: new Date().toISOString(),
        openedBy: actorName,
        createdAt: new Date().toISOString(),
      })
      .select('*')
      .single();
    return data as BreakfastSession;
  },

  async closeSession(sessionId: string): Promise<void> {
    await supabase
      .from('breakfast_sessions')
      .update({ status: 'closed', closedAt: new Date().toISOString() })
      .eq('id', sessionId);
  },

  // ==========================================
  // LISTA DE PRESENÇA
  // ==========================================

  async getAttendanceList(propertyId: string, sessionId: string): Promise<BreakfastAttendance[]> {
    const { data } = await supabase
      .from('breakfast_attendance')
      .select('*')
      .eq('propertyId', propertyId)
      .eq('sessionId', sessionId)
      .order('guestName', { ascending: true });
    return (data || []) as BreakfastAttendance[];
  },

  async checkInGuest(attendanceId: string): Promise<void> {
    await supabase
      .from('breakfast_attendance')
      .update({ status: 'arrived', arrivedAt: new Date().toISOString() })
      .eq('id', attendanceId);
  },

  async assignTable(attendanceId: string, tableId: string): Promise<void> {
    await supabase
      .from('breakfast_attendance')
      .update({ status: 'seated', tableId, seatedAt: new Date().toISOString() })
      .eq('id', attendanceId);
  },

  async moveGuest(attendanceId: string, newTableId: string): Promise<void> {
    await supabase
      .from('breakfast_attendance')
      .update({ tableId: newTableId })
      .eq('id', attendanceId);
  },

  async guestLeft(attendanceId: string): Promise<void> {
    await supabase
      .from('breakfast_attendance')
      .update({ status: 'left', tableId: null, leftAt: new Date().toISOString() })
      .eq('id', attendanceId);
  },

  async deactivateBreakfast(attendanceId: string): Promise<void> {
    await supabase
      .from('breakfast_attendance')
      .update({ status: 'inactive', tableId: null })
      .eq('id', attendanceId);
  },

  async reactivateBreakfast(attendanceId: string): Promise<void> {
    await supabase
      .from('breakfast_attendance')
      .update({ status: 'expected' })
      .eq('id', attendanceId);
  },

  // Busca attendance do dia por stayId (para o portal do hóspede)
  async getAttendanceByStay(propertyId: string, stayId: string): Promise<BreakfastAttendance | null> {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('breakfast_attendance')
      .select('*')
      .eq('propertyId', propertyId)
      .eq('stayId', stayId)
      .eq('date', today)
      .maybeSingle();
    return data as BreakfastAttendance | null;
  },

  // ==========================================
  // MESAS
  // ==========================================

  async createTable(propertyId: string, sessionId: string, name: string, actorName: string): Promise<BreakfastTable> {
    const id = uuidv4();
    const { data } = await supabase
      .from('breakfast_tables')
      .insert({
        id,
        propertyId,
        sessionId,
        name,
        status: 'open',
        createdBy: actorName,
        createdAt: new Date().toISOString(),
      })
      .select('*')
      .single();
    return data as BreakfastTable;
  },

  async closeTable(tableId: string): Promise<void> {
    await supabase
      .from('breakfast_tables')
      .update({ status: 'closed', closedAt: new Date().toISOString() })
      .eq('id', tableId);
  },

  async reopenTable(tableId: string): Promise<void> {
    await supabase
      .from('breakfast_tables')
      .update({ status: 'open', closedAt: null })
      .eq('id', tableId);
  },

  async getTablesForSession(sessionId: string): Promise<BreakfastTable[]> {
    const { data } = await supabase
      .from('breakfast_tables')
      .select('*')
      .eq('sessionId', sessionId)
      .order('createdAt', { ascending: true });
    return (data || []) as BreakfastTable[];
  },

  // ==========================================
  // VISITANTES
  // ==========================================

  async addVisitor(
    propertyId: string,
    sessionId: string,
    tableId: string,
    name: string
  ): Promise<BreakfastVisitor> {
    const id = uuidv4();
    const { data } = await supabase
      .from('breakfast_visitors')
      .insert({
        id,
        propertyId,
        sessionId,
        tableId,
        name,
        createdAt: new Date().toISOString(),
      })
      .select('*')
      .single();
    return data as BreakfastVisitor;
  },

  async removeVisitor(visitorId: string): Promise<void> {
    await supabase
      .from('breakfast_visitors')
      .delete()
      .eq('id', visitorId);
  },

  async getVisitorsForSession(sessionId: string): Promise<BreakfastVisitor[]> {
    const { data } = await supabase
      .from('breakfast_visitors')
      .select('*')
      .eq('sessionId', sessionId);
    return (data || []) as BreakfastVisitor[];
  },

  // ==========================================
  // PEDIDOS
  // ==========================================

  async placeWaiterOrder(
    propertyId: string,
    stayId: string | null,
    tableId: string,
    attendanceId: string | null,
    items: { menuItemId: string; name: string; quantity: number; unitPrice: number; flavor?: string; guestName?: string }[],
    actorId: string,
    actorName: string,
    guestName: string | null = null,
    cabinName: string | null = null
  ): Promise<FBOrder> {
    const id = uuidv4();
    const totalPrice = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const now = new Date().toISOString();

    const { data } = await supabase
      .from('fb_orders')
      .insert({
        id,
        property_id: propertyId,
        stay_id: stayId ?? null,
        type: 'breakfast',
        modality: 'buffet',
        status: 'pending',
        items,
        total_price: totalPrice,
        table_id: tableId,
        attendance_id: attendanceId ?? null,
        requested_by: 'waiter',
        guest_name: guestName ?? null,
        cabin_name: cabinName ?? null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    await AuditService.log({
      propertyId,
      userId: actorId,
      userName: actorName,
      action: 'FB_ORDER_CREATED',
      entity: 'FB_ORDER',
      entityId: id,
      details: `Pedido buffet pelo garçom. Mesa: ${tableId}. ${items.length} item(ns).`,
    });

    return mapSalonOrder(data);
  },

  async getOrdersBySession(propertyId: string, sessionId: string): Promise<FBOrder[]> {
    const { data: tables } = await supabase
      .from('breakfast_tables')
      .select('id')
      .eq('sessionId', sessionId);

    if (!tables?.length) return [];

    const tableIds = tables.map((t: any) => t.id);

    const { data } = await supabase
      .from('fb_orders')
      .select('*')
      .eq('property_id', propertyId)
      .eq('modality', 'buffet')
      .in('table_id', tableIds)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true });

    return (data || []).map(mapSalonOrder);
  },

  async updateOrderStatus(
    orderId: string,
    newStatus: FBOrder['status']
  ): Promise<void> {
    await supabase
      .from('fb_orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId);
  },

  // Estrutura pronta — integração com impressora configurada futuramente
  async printOrder(orderId: string): Promise<{ queued: boolean; orderId: string }> {
    console.log(`[PRINT] Order ${orderId} queued for thermal printing.`);
    // Future: send to ESC/POS endpoint with printer IP from property settings
    return { queued: true, orderId };
  },

};
