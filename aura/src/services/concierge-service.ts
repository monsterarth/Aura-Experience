import { supabase } from "@/lib/supabase";
import { ConciergeItem, ConciergeRequest } from "@/types/aura";
import { AuditService } from "./audit-service";
import { StayService } from "./stay-service";

export const ConciergeService = {

  // ==========================================
  // CATALOG
  // ==========================================

  async getConciergeItems(propertyId: string): Promise<ConciergeItem[]> {
    const { data } = await supabase
      .from('concierge_items')
      .select('*')
      .eq('propertyId', propertyId)
      .eq('active', true)
      .order('order', { ascending: true });
    return (data || []) as ConciergeItem[];
  },

  async createItem(
    propertyId: string,
    data: Omit<ConciergeItem, 'id' | 'propertyId' | 'createdAt' | 'updatedAt'>,
    actorId: string,
    actorName: string
  ): Promise<ConciergeItem> {
    const now = new Date().toISOString();
    const payload = {
      ...data,
      id: crypto.randomUUID(),
      propertyId,
      createdAt: now,
      updatedAt: now,
    };
    const { data: created, error } = await supabase
      .from('concierge_items')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'CREATE', entity: 'CONCIERGE', entityId: created.id,
      details: `Item de concierge criado: ${data.name}`,
    });

    return created as ConciergeItem;
  },

  async updateItem(
    propertyId: string,
    itemId: string,
    data: Partial<Omit<ConciergeItem, 'id' | 'propertyId' | 'createdAt'>>,
    actorId: string,
    actorName: string
  ): Promise<void> {
    const { error } = await supabase
      .from('concierge_items')
      .update({ ...data, updatedAt: new Date().toISOString() })
      .eq('id', itemId)
      .eq('propertyId', propertyId);
    if (error) throw error;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'UPDATE', entity: 'CONCIERGE', entityId: itemId,
      details: `Item de concierge atualizado: ${itemId}`,
    });
  },

  async deleteItem(
    propertyId: string,
    itemId: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    // Soft delete
    await this.updateItem(propertyId, itemId, { active: false }, actorId, actorName);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'DELETE', entity: 'CONCIERGE', entityId: itemId,
      details: `Item de concierge desativado: ${itemId}`,
    });
  },

  // ==========================================
  // REQUESTS
  // ==========================================

  async getConciergeRequestsForStay(
    propertyId: string,
    stayId: string
  ): Promise<ConciergeRequest[]> {
    const { data } = await supabase
      .from('concierge_requests')
      .select('*, item:concierge_items(*)')
      .eq('propertyId', propertyId)
      .eq('stayId', stayId)
      .order('createdAt', { ascending: false });
    return (data || []) as unknown as ConciergeRequest[];
  },

  async getPendingRequests(propertyId: string): Promise<ConciergeRequest[]> {
    const { data } = await supabase
      .from('concierge_requests')
      .select('*, item:concierge_items(*), cabin:cabins(name)')
      .eq('propertyId', propertyId)
      .eq('status', 'pending')
      .order('createdAt', { ascending: true });

    return ((data || []) as any[]).map((r) => ({
      ...r,
      cabinName: r.cabin?.name,
      cabin: undefined,
    })) as ConciergeRequest[];
  },

  async getTodayRequests(propertyId: string): Promise<ConciergeRequest[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('concierge_requests')
      .select('*, item:concierge_items(*), cabin:cabins(name)')
      .eq('propertyId', propertyId)
      .neq('status', 'pending')
      .gte('createdAt', todayStart.toISOString())
      .order('createdAt', { ascending: false });

    return ((data || []) as any[]).map((r) => ({
      ...r,
      cabinName: r.cabin?.name,
      cabin: undefined,
    })) as ConciergeRequest[];
  },

  // ==========================================
  // BILLING HELPERS
  // ==========================================

  async _calculateConsumptionCost(
    stayId: string,
    itemId: string,
    qty: number,
    item: ConciergeItem
  ): Promise<number> {
    const { data } = await supabase
      .from('concierge_requests')
      .select('quantity')
      .eq('stayId', stayId)
      .eq('itemId', itemId)
      .in('status', ['delivered', 'pending']);

    const previousTotal = (data ?? []).reduce((sum: number, r: any) => sum + (r.quantity || 0), 0);
    const freeRemaining = Math.max(0, item.included_qty - previousTotal);
    const billableQty = Math.max(0, qty - freeRemaining);
    return billableQty * item.price;
  },

  // ==========================================
  // LIFECYCLE ACTIONS
  // ==========================================

  async createRequest(
    data: {
      propertyId: string;
      stayId: string;
      cabinId?: string;
      itemId: string;
      quantity: number;
      notes?: string;
    },
    actorId: string,
    actorName: string
  ): Promise<ConciergeRequest> {
    const now = new Date().toISOString();
    const payload = {
      ...data,
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const { data: created, error } = await supabase
      .from('concierge_requests')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    await AuditService.log({
      propertyId: data.propertyId, userId: actorId, userName: actorName,
      action: 'CONCIERGE_REQUESTED', entity: 'CONCIERGE', entityId: created.id,
      details: `Pedido de concierge criado: itemId=${data.itemId}, qty=${data.quantity}`,
    });

    return created as ConciergeRequest;
  },

  async deliverRequest(
    propertyId: string,
    requestId: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    // 1. Fetch request + item
    const { data: req, error: reqErr } = await supabase
      .from('concierge_requests')
      .select('*, item:concierge_items(*)')
      .eq('id', requestId)
      .single();
    if (reqErr || !req) throw new Error('Request not found');

    const item = req.item as ConciergeItem;
    let totalPrice = 0;

    // 2. Calculate total_price
    if (item.category === 'consumption') {
      totalPrice = await this._calculateConsumptionCost(req.stayId, req.itemId, req.quantity, item);
    } else {
      // loan: charge delivery price if > 0
      totalPrice = (item.price || 0) * req.quantity;
    }

    // 3. Update request
    const { error: updErr } = await supabase
      .from('concierge_requests')
      .update({ status: 'delivered', total_price: totalPrice, updatedAt: new Date().toISOString() })
      .eq('id', requestId);
    if (updErr) throw updErr;

    // 4. Charge folio if applicable
    if (totalPrice > 0) {
      await StayService.addFolioItemManual(
        propertyId,
        req.stayId,
        {
          description: item.name,
          quantity: req.quantity,
          unitPrice: item.category === 'loan' ? item.price : (totalPrice / req.quantity),
          totalPrice,
          category: 'services',
          addedBy: actorId,
        },
        actorId,
        actorName
      );
    }

    // 5. Audit
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'CONCIERGE_DELIVERED', entity: 'CONCIERGE', entityId: requestId,
      details: `Pedido entregue. Cobrado: R$${totalPrice.toFixed(2)}`,
    });
  },

  async returnRequest(
    propertyId: string,
    requestId: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    const { error } = await supabase
      .from('concierge_requests')
      .update({ status: 'returned', updatedAt: new Date().toISOString() })
      .eq('id', requestId);
    if (error) throw error;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'CONCIERGE_RETURNED', entity: 'CONCIERGE', entityId: requestId,
      details: `Item de empréstimo devolvido.`,
    });
  },

  async markLost(
    propertyId: string,
    requestId: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    // 1. Fetch request + item
    const { data: req, error: reqErr } = await supabase
      .from('concierge_requests')
      .select('*, item:concierge_items(*)')
      .eq('id', requestId)
      .single();
    if (reqErr || !req) throw new Error('Request not found');

    const item = req.item as ConciergeItem;

    // 2. Update status
    const { error: updErr } = await supabase
      .from('concierge_requests')
      .update({ status: 'lost', updatedAt: new Date().toISOString() })
      .eq('id', requestId);
    if (updErr) throw updErr;

    // 3. Charge loss_price if defined
    if (item.loss_price && item.loss_price > 0) {
      const lossTotal = item.loss_price * req.quantity;
      await StayService.addFolioItemManual(
        propertyId,
        req.stayId,
        {
          description: `Perda/Extravio: ${item.name}`,
          quantity: req.quantity,
          unitPrice: item.loss_price,
          totalPrice: lossTotal,
          category: 'services',
          addedBy: actorId,
        },
        actorId,
        actorName
      );
    }

    // 4. Audit
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'CONCIERGE_LOST', entity: 'CONCIERGE', entityId: requestId,
      details: `Item de empréstimo extraviado. loss_price=${item.loss_price ?? 0}`,
    });
  },

  // ==========================================
  // REALTIME
  // ==========================================

  listenToPendingRequests(
    propertyId: string,
    callback: (requests: ConciergeRequest[]) => void
  ): () => void {
    const fetchPending = async () => {
      const requests = await this.getPendingRequests(propertyId);
      callback(requests);
    };

    fetchPending();

    const channel = supabase
      .channel(`concierge_requests_${propertyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'concierge_requests',
          filter: `propertyId=eq.${propertyId}`,
        },
        () => {
          fetchPending();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
