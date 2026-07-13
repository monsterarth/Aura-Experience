import { supabase, supabaseAdmin } from "@/lib/supabase";
import { ConciergeGroup, ConciergeItem, ConciergeRequest } from "@/types/aura";
import { AuditService } from "./audit-service";
import { StayService } from "./stay-service";
import { StockIntegration, StockLevels } from "./stock-integration";

// No servidor (rota de campo) usa service-role — o lançamento de frigobar da conferência
// pendurava no lock frio quando rodava pelo client do browser. No browser, mantém o client
// autenticado (RLS). Mesmo padrão do housekeeping/maintenance-service. Escopo atual: apenas
// a cadeia do launchFrigobar (createRequest → deliverRequest → _calculateConsumptionCost)
// usa db(); os demais métodos só rodam no browser hoje.
const db = () => (typeof window === 'undefined' && supabaseAdmin ? supabaseAdmin : supabase);

export const ConciergeService = {

  // ==========================================
  // GROUPS
  // ==========================================

  async getGroups(propertyId: string): Promise<ConciergeGroup[]> {
    const { data } = await supabase
      .from('concierge_groups')
      .select('*')
      .eq('propertyId', propertyId)
      .eq('active', true)
      .order('order', { ascending: true });
    return (data || []) as ConciergeGroup[];
  },

  async createGroup(
    propertyId: string,
    data: Omit<ConciergeGroup, 'id' | 'propertyId' | 'createdAt' | 'updatedAt'>,
    actorId: string,
    actorName: string
  ): Promise<ConciergeGroup> {
    const now = new Date().toISOString();
    const payload = { ...data, id: crypto.randomUUID(), propertyId, createdAt: now, updatedAt: now };
    const { data: created, error } = await supabase
      .from('concierge_groups')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'CREATE', entity: 'CONCIERGE', entityId: created.id,
      details: `Grupo de concierge criado: ${data.name}`,
    });

    return created as ConciergeGroup;
  },

  async updateGroup(
    propertyId: string,
    groupId: string,
    data: Partial<Omit<ConciergeGroup, 'id' | 'propertyId' | 'createdAt'>>,
    actorId: string,
    actorName: string
  ): Promise<void> {
    const { error } = await supabase
      .from('concierge_groups')
      .update({ ...data, updatedAt: new Date().toISOString() })
      .eq('id', groupId)
      .eq('propertyId', propertyId);
    if (error) throw error;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'UPDATE', entity: 'CONCIERGE', entityId: groupId,
      details: `Grupo de concierge atualizado: ${groupId}`,
    });
  },

  async deleteGroup(
    propertyId: string,
    groupId: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    await this.updateGroup(propertyId, groupId, { active: false }, actorId, actorName);

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'DELETE', entity: 'CONCIERGE', entityId: groupId,
      details: `Grupo de concierge desativado: ${groupId}`,
    });
  },

  // ==========================================
  // CATALOG
  // ==========================================

  async getConciergeItems(propertyId: string): Promise<ConciergeItem[]> {
    const { data } = await supabase
      .from('concierge_items')
      .select('*, group:concierge_groups(*)')
      .eq('propertyId', propertyId)
      .eq('deleted', false)
      .order('order', { ascending: true });
    return this._annotateAvailability(propertyId, (data || []) as ConciergeItem[]);
  },

  async getConciergeItemsForGuest(propertyId: string): Promise<ConciergeItem[]> {
    const { data } = await supabase
      .from('concierge_items')
      .select('*, group:concierge_groups(*)')
      .eq('propertyId', propertyId)
      .eq('active', true)
      .eq('deleted', false)
      .eq('availableForGuest', true)
      .order('order', { ascending: true });
    return this._annotateAvailability(propertyId, (data || []) as ConciergeItem[]);
  },

  async getConciergeItemsForMaid(propertyId: string): Promise<ConciergeItem[]> {
    const { data } = await supabase
      .from('concierge_items')
      .select('*, group:concierge_groups(*)')
      .eq('propertyId', propertyId)
      .eq('active', true)
      .eq('deleted', false)
      .eq('availableForMaid', true)
      .order('order', { ascending: true });
    return this._annotateAvailability(propertyId, (data || []) as ConciergeItem[]);
  },

  async getArchivedItems(propertyId: string): Promise<ConciergeItem[]> {
    const { data } = await supabase
      .from('concierge_items')
      .select('*, group:concierge_groups(*)')
      .eq('propertyId', propertyId)
      .eq('deleted', true)
      .order('updatedAt', { ascending: false });
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
    const { error } = await supabase
      .from('concierge_items')
      .update({ deleted: true, active: false, updatedAt: new Date().toISOString() })
      .eq('id', itemId)
      .eq('propertyId', propertyId);
    if (error) throw error;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'DELETE', entity: 'CONCIERGE', entityId: itemId,
      details: `Item de concierge arquivado: ${itemId}`,
    });
  },

  async restoreItem(
    propertyId: string,
    itemId: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    const { error } = await supabase
      .from('concierge_items')
      .update({ deleted: false, active: true, updatedAt: new Date().toISOString() })
      .eq('id', itemId)
      .eq('propertyId', propertyId);
    if (error) throw error;

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'UPDATE', entity: 'CONCIERGE', entityId: itemId,
      details: `Item de concierge restaurado do arquivo: ${itemId}`,
    });
  },

  // ==========================================
  // REQUESTS
  // ==========================================

  // Helper: enrich raw requests with item and cabin data via separate queries
  // (avoids PostgREST embedded join issues with camelCase FK columns)
  async _enrichRequests(requests: any[]): Promise<ConciergeRequest[]> {
    if (!requests.length) return [];

    const itemIds = Array.from(new Set(requests.map((r) => r.itemId).filter(Boolean)));
    const cabinIds = Array.from(new Set(requests.map((r) => r.cabinId).filter(Boolean)));

    const [itemsRes, cabinsRes] = await Promise.all([
      supabase.from('concierge_items').select('*').in('id', itemIds),
      cabinIds.length
        ? supabase.from('cabins').select('id, name').in('id', cabinIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const itemMap = Object.fromEntries((itemsRes.data || []).map((i: any) => [i.id, i]));
    const cabinMap = Object.fromEntries((cabinsRes.data || []).map((c: any) => [c.id, c.name]));

    return requests.map((r) => ({
      ...r,
      item: itemMap[r.itemId] ?? null,
      cabinName: cabinMap[r.cabinId] ?? null,
    })) as ConciergeRequest[];
  },

  async getConciergeRequestsForStay(
    propertyId: string,
    stayId: string
  ): Promise<ConciergeRequest[]> {
    const { data } = await supabase
      .from('concierge_requests')
      .select('*')
      .eq('propertyId', propertyId)
      .eq('stayId', stayId)
      .order('createdAt', { ascending: false });
    return this._enrichRequests(data || []);
  },

  async getPendingRequests(propertyId: string, requestedBy?: 'guest' | 'maid'): Promise<ConciergeRequest[]> {
    let query = supabase
      .from('concierge_requests')
      .select('*')
      .eq('propertyId', propertyId)
      .in('status', ['pending', 'in_progress'])
      .order('createdAt', { ascending: true });
    if (requestedBy) query = query.eq('requestedBy', requestedBy);
    const { data } = await query;
    return this._enrichRequests(data || []);
  },

  async getTodayRequests(propertyId: string): Promise<ConciergeRequest[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('concierge_requests')
      .select('*')
      .eq('propertyId', propertyId)
      .neq('status', 'pending')
      .gte('createdAt', todayStart.toISOString())
      .order('createdAt', { ascending: false });
    return this._enrichRequests(data || []);
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
    const { data } = await db()
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
      stayId?: string;
      cabinId?: string;
      itemId: string;
      quantity: number;
      notes?: string;
      requestedBy?: 'guest' | 'maid';
      urgent?: boolean;
    },
    actorId: string,
    actorName: string
  ): Promise<ConciergeRequest> {
    // Disponibilidade: itens de consumo com ficha técnica não podem ser pedidos
    // sem estoque (reforço servidor; fail-open se módulo off — ver _assertAvailable).
    const { data: itemRow } = await db()
      .from('concierge_items').select('*').eq('id', data.itemId).single();
    if (itemRow) await this._assertAvailable(data.propertyId, itemRow as ConciergeItem, data.quantity);

    const now = new Date().toISOString();
    const payload = {
      ...data,
      id: crypto.randomUUID(),
      status: 'pending',
      requestedBy: data.requestedBy ?? 'guest',
      createdAt: now,
      updatedAt: now,
    };

    const { data: created, error } = await db()
      .from('concierge_requests')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    // Enrich audit log with item name and guest identity
    let auditUserName = actorName;
    let auditDetails = `Pedido de concierge: qty=${data.quantity}`;
    try {
      const [{ data: itemNameData }, cabinRes, stayRes] = await Promise.all([
        db().from('concierge_items').select('name').eq('id', data.itemId).single(),
        data.cabinId
          ? db().from('cabins').select('number').eq('id', data.cabinId).single()
          : Promise.resolve({ data: null }),
        data.stayId
          ? db().from('stays').select('guestId').eq('id', data.stayId).single()
          : Promise.resolve({ data: null }),
      ]);
      const itemName = itemNameData?.name || data.itemId;
      auditDetails = `Pedido de concierge: ${data.quantity}x ${itemName}`;
      if (cabinRes.data && stayRes.data) {
        const { data: guestData } = await db()
          .from('guests').select('fullName').eq('id', stayRes.data.guestId).single();
        if (guestData) {
          const firstName = guestData.fullName.split(' ')[0];
          auditUserName = `${cabinRes.data.number} - ${firstName}`;
        }
      }
    } catch { /* enrich fails silently */ }

    await AuditService.log({
      propertyId: data.propertyId, userId: actorId, userName: auditUserName,
      action: 'CONCIERGE_REQUESTED', entity: 'CONCIERGE', entityId: created.id,
      details: auditDetails,
    });

    return created as ConciergeRequest;
  },

  async assignRequest(
    propertyId: string,
    requestId: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    const { error } = await supabase
      .from('concierge_requests')
      .update({ status: 'in_progress', assignedTo: actorId, assignedName: actorName, updatedAt: new Date().toISOString() })
      .eq('id', requestId)
      .eq('propertyId', propertyId);
    if (error) throw error;
  },

  async deliverRequest(
    propertyId: string,
    requestId: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    // 1. Fetch request + item
    const { data: req, error: reqErr } = await db()
      .from('concierge_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (reqErr || !req) throw new Error('Request not found');

    const { data: itemRow } = await db()
      .from('concierge_items')
      .select('*')
      .eq('id', req.itemId)
      .single();
    const item = itemRow as ConciergeItem;
    let totalPrice = 0;

    // 2. Calculate total_price
    if (item.category === 'consumption') {
      totalPrice = await this._calculateConsumptionCost(req.stayId, req.itemId, req.quantity, item);
    } else {
      // loan: charge delivery price if > 0
      totalPrice = (item.price || 0) * req.quantity;
    }

    // 3. Update request
    const { error: updErr } = await db()
      .from('concierge_requests')
      .update({ status: 'delivered', total_price: totalPrice, updatedAt: new Date().toISOString() })
      .eq('id', requestId);
    if (updErr) throw updErr;

    // 4. Baixa de estoque (integração) — explode a ficha técnica. No-op se módulo off ou sem vínculo.
    if (item.category === 'consumption') {
      await this._deductStockForRequest(propertyId, item, req.quantity, requestId, { id: actorId, name: actorName });
    }

    // 5. Charge folio if applicable
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

    // 6. Audit — enriquecer com nome do item, hóspede e cabana
    let guestLabel = '';
    try {
      const { data: stay } = await db().from('stays').select('guestId, cabinId').eq('id', req.stayId).single();
      if (stay) {
        const [{ data: guest }, { data: cabin }] = await Promise.all([
          stay.guestId ? db().from('guests').select('fullName').eq('id', stay.guestId).single() : Promise.resolve({ data: null }),
          stay.cabinId ? db().from('cabins').select('name').eq('id', stay.cabinId).single() : Promise.resolve({ data: null }),
        ]);
        const who = guest?.fullName?.split(' ')[0] || '';
        const where = cabin?.name || '';
        if (who || where) guestLabel = ` (${[who, where].filter(Boolean).join(' — ')})`;
      }
    } catch { /* não bloqueia a entrega */ }

    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'CONCIERGE_DELIVERED', entity: 'CONCIERGE', entityId: requestId,
      details: `Entregou "${item.name}"${guestLabel}. Cobrado: R$${totalPrice.toFixed(2)}`,
    });
  },

  async notDeliverRequest(
    propertyId: string,
    requestId: string,
    reason: string
  ): Promise<void> {
    const { error } = await supabase
      .from('concierge_requests')
      .update({ status: 'not_delivered', notDeliveredReason: reason, updatedAt: new Date().toISOString() })
      .eq('id', requestId)
      .eq('propertyId', propertyId);
    if (error) throw error;
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
    const { data: req, error: reqErr } = await db()
      .from('concierge_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (reqErr || !req) throw new Error('Request not found');

    const { data: itemRow } = await db()
      .from('concierge_items')
      .select('*')
      .eq('id', req.itemId)
      .single();
    const item = itemRow as ConciergeItem;

    // 2. Update status
    const { error: updErr } = await supabase
      .from('concierge_requests')
      .update({ status: 'lost', updatedAt: new Date().toISOString() })
      .eq('id', requestId);
    if (updErr) throw updErr;

    // 3. Baixa de estoque (integração) — item de empréstimo extraviado (não retorna).
    if (item.category === 'loan') {
      await this._deductStockForRequest(propertyId, item, req.quantity, requestId, { id: actorId, name: actorName });
    }

    // 4. Charge loss_price if defined
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

    // 5. Audit
    await AuditService.log({
      propertyId, userId: actorId, userName: actorName,
      action: 'CONCIERGE_LOST', entity: 'CONCIERGE', entityId: requestId,
      details: `Item de empréstimo extraviado. loss_price=${item.loss_price ?? 0}`,
    });
  },

  // ==========================================
  // ESTOQUE — ficha técnica (baixa) + disponibilidade
  // ==========================================

  /** Componentes efetivos da ficha técnica (com fallback ao vínculo legado 1:1). */
  _stockComponents(item: ConciergeItem): { productId: string; consumptionQty: number; locationId?: string | null }[] {
    if (item.stockComponents?.length) {
      return item.stockComponents.filter(c => c.productId && c.consumptionQty > 0);
    }
    return item.productId ? [{ productId: item.productId, consumptionQty: 1 }] : [];
  },

  /** Item entra no gate de disponibilidade? (consumo + toggle ligado + tem ficha) */
  _itemGatesStock(item: ConciergeItem): boolean {
    return item.category === 'consumption'
      && !!item.deductFromStock
      && this._stockComponents(item).length > 0;
  },

  /** Há saldo p/ atender `quantity` unidades do item? Cada componente olha o seu local ("Baixar de"). */
  _hasStockFor(item: ConciergeItem, quantity: number, levels: StockLevels): boolean {
    if (!this._itemGatesStock(item)) return true;
    return this._stockComponents(item).every(
      c => StockIntegration.availableFor(levels, c.productId, c.locationId) >= c.consumptionQty * quantity,
    );
  },

  /**
   * Explode a ficha técnica do item e baixa cada insumo vinculado (best-effort).
   * Com toggle ligado usa stockComponents; senão cai no vínculo legado 1:1.
   */
  async _deductStockForRequest(
    propertyId: string,
    item: ConciergeItem,
    quantity: number,
    requestId: string,
    actor: { id: string; name: string },
  ): Promise<void> {
    if (!(quantity > 0)) return;
    for (const c of this._stockComponents(item)) {
      await StockIntegration.consumeForSale(
        propertyId,
        { productId: c.productId, quantity: c.consumptionQty * quantity, referenceType: 'concierge', referenceId: requestId, fromLocationId: c.locationId ?? null },
        actor,
      );
    }
  },

  /** Marca cada item com stockAvailable. Fail-open: módulo off/erro → tudo disponível. */
  async _annotateAvailability(propertyId: string, items: ConciergeItem[]): Promise<ConciergeItem[]> {
    if (!items.some(i => this._itemGatesStock(i))) {
      return items.map(i => ({ ...i, stockAvailable: true }));
    }
    const levels = await StockIntegration.getStockLevels(propertyId);
    if (!levels) return items.map(i => ({ ...i, stockAvailable: true }));
    return items.map(i => ({ ...i, stockAvailable: this._hasStockFor(i, 1, levels) }));
  },

  /** Lança se o item não tem estoque p/ a quantidade pedida (reforço anti-pedido). */
  async _assertAvailable(propertyId: string, item: ConciergeItem, quantity: number): Promise<void> {
    if (!this._itemGatesStock(item)) return;
    const levels = await StockIntegration.getStockLevels(propertyId);
    if (!levels) return; // fail-open: módulo off ou erro não bloqueia
    if (!this._hasStockFor(item, quantity, levels)) {
      throw new Error('Item indisponível no momento (sem estoque).');
    }
  },

  // ==========================================
  // FRIGOBAR (itens de Concierge no grupo "Frigobar")
  // ==========================================

  /** Itens de frigobar = itens do catálogo no grupo "Frigobar".
   *  Critério é só o grupo: a conferência de checkout precisa de TODOS os produtos do frigobar
   *  para lançar consumo, independentemente da flag availableForMaid (que governa reposição). */
  async getFrigobarItems(propertyId: string): Promise<ConciergeItem[]> {
    const { data } = await supabase
      .from('concierge_items')
      .select('*, group:concierge_groups(*)')
      .eq('propertyId', propertyId)
      .eq('active', true)
      .eq('deleted', false)
      .order('order', { ascending: true });
    const items = ((data || []) as ConciergeItem[])
      .filter(i => (i.group?.name || '').trim().toLowerCase() === 'frigobar');
    return this._annotateAvailability(propertyId, items);
  },

  /** Lança o consumo de frigobar pelo pipeline do concierge (folio + estoque + histórico). */
  async launchFrigobar(
    propertyId: string,
    params: { stayId: string; cabinId?: string; cart: Record<string, number> },
    actorId: string,
    actorName: string,
  ): Promise<void> {
    for (const [itemId, qty] of Object.entries(params.cart)) {
      if (!qty || qty <= 0) continue;
      const req = await this.createRequest(
        { propertyId, stayId: params.stayId, cabinId: params.cabinId, itemId, quantity: qty, requestedBy: 'maid' },
        actorId, actorName,
      );
      await this.deliverRequest(propertyId, req.id, actorId, actorName);
    }
  },

  // ==========================================
  // REALTIME
  // ==========================================

  listenToPendingRequests(
    propertyId: string,
    callback: (requests: ConciergeRequest[]) => void,
    requestedBy?: 'guest' | 'maid'
  ): () => void {
    const fetchPending = async () => {
      const requests = await this.getPendingRequests(propertyId, requestedBy);
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
