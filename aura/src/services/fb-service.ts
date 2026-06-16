import { supabase } from '@/lib/supabase';
import { FBCategory, FBMenuItem, FBOrder, FBSettings } from '@/types/aura';
import { StockIntegration } from './stock-integration';

const mapCategory = (dbObj: any): FBCategory => ({
    id: dbObj.id,
    propertyId: dbObj.property_id,
    name: dbObj.name,
    name_en: dbObj.name_en || undefined,
    name_es: dbObj.name_es || undefined,
    type: dbObj.type,
    selectionTarget: dbObj.selection_target,
    maxPerGuest: dbObj.max_per_guest,
    alaCarte: dbObj.ala_carte ?? false,
    order: dbObj.order,
    imageUrl: dbObj.image_url,
    createdAt: dbObj.created_at,
});

const mapMenuItem = (dbObj: any): FBMenuItem => ({
    id: dbObj.id,
    propertyId: dbObj.property_id,
    categoryId: dbObj.category_id,
    name: dbObj.name,
    name_en: dbObj.name_en || undefined,
    name_es: dbObj.name_es || undefined,
    description: dbObj.description,
    description_en: dbObj.description_en || undefined,
    description_es: dbObj.description_es || undefined,
    price: dbObj.price,
    ingredients: dbObj.ingredients,
    flavors: dbObj.flavors,
    active: dbObj.active,
    order: dbObj.order,
    imageUrl: dbObj.image_url,
    createdAt: dbObj.created_at,
});

const mapOrder = (dbObj: any): FBOrder => ({
    id: dbObj.id,
    propertyId: dbObj.property_id,
    stayId: dbObj.stay_id,
    type: dbObj.type,
    modality: dbObj.modality,
    status: dbObj.status,
    items: dbObj.items,
    totalPrice: dbObj.total_price,
    deliveryTime: dbObj.delivery_time,
    deliveryDate: dbObj.delivery_date,
    requestedBy: dbObj.requested_by,
    guestName: dbObj.guest_name,
    cabinName: dbObj.cabin_name,
    tableId: dbObj.table_id,
    attendanceId: dbObj.attendance_id,
    createdAt: dbObj.created_at,
    updatedAt: dbObj.updated_at,
});

export const fbService = {
    // --- SETTINGS ---
    async updateSettings(propertyId: string, fbSettings: FBSettings): Promise<void> {
        const { data: currentProperty, error: fetchError } = await supabase
            .from('properties')
            .select('settings')
            .eq('id', propertyId)
            .single();

        if (fetchError) throw fetchError;

        const newSettings = {
            ...currentProperty.settings,
            fbSettings,
        };

        const { error } = await supabase
            .from('properties')
            .update({ settings: newSettings })
            .eq('id', propertyId);

        if (error) throw error;
    },

    async setDailyBreakfastMode(propertyId: string, mode: 'delivery' | 'buffet'): Promise<void> {
        const { data: prop, error: fetchError } = await supabase
            .from('properties')
            .select('settings')
            .eq('id', propertyId)
            .single();

        if (fetchError) throw fetchError;

        const current = (prop?.settings?.fbSettings || {}) as FBSettings;
        const updated: FBSettings = {
            ...current,
            breakfast: { ...current.breakfast, dailyMode: mode } as FBSettings['breakfast'],
        };
        await this.updateSettings(propertyId, updated);
    },

    // --- CATEGORIES ---
    async getCategories(propertyId: string): Promise<FBCategory[]> {
        const { data, error } = await supabase
            .from('fb_categories')
            .select('*')
            .eq('property_id', propertyId)
            .order('order', { ascending: true })
            .order('name');
        if (error) throw error;
        return (data || []).map(mapCategory);
    },

    async createCategory(
        propertyId: string,
        name: string,
        type: FBCategory['type'],
        selectionTarget?: 'individual' | 'group_portion' | 'group_unit',
        maxPerGuest?: number,
        order: number = 0,
        imageUrl?: string,
        name_en?: string,
        name_es?: string,
        alaCarte?: boolean
    ): Promise<FBCategory> {
        const { data, error } = await supabase
            .from('fb_categories')
            .insert([{ property_id: propertyId, name, name_en: name_en || null, name_es: name_es || null, type, selection_target: selectionTarget, max_per_guest: maxPerGuest, order, image_url: imageUrl, ala_carte: alaCarte ?? false }])
            .select()
            .single();
        if (error) throw error;
        return mapCategory(data);
    },

    async updateCategory(
        id: string,
        name: string,
        type: FBCategory['type'],
        selectionTarget?: 'individual' | 'group_portion' | 'group_unit',
        maxPerGuest?: number,
        order?: number,
        imageUrl?: string,
        name_en?: string,
        name_es?: string,
        alaCarte?: boolean
    ): Promise<FBCategory> {
        const toUpdate: any = { name, name_en: name_en || null, name_es: name_es || null, type, selection_target: selectionTarget, max_per_guest: maxPerGuest, ala_carte: alaCarte ?? false };
        if (order !== undefined) toUpdate.order = order;
        if (imageUrl !== undefined) toUpdate.image_url = imageUrl;

        const { data, error } = await supabase
            .from('fb_categories')
            .update(toUpdate)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return mapCategory(data);
    },

    async deleteCategory(propertyId: string, id: string): Promise<void> {
        const { error } = await supabase
            .from('fb_categories')
            .delete()
            .eq('id', id)
            .eq('property_id', propertyId);
        if (error) throw error;
    },

    async updateCategoryOrder(updates: { id: string, order: number }[]): Promise<void> {
        // Since Supabase RPC is the standard way to do bulk updates, we can just do simple loops or 
        // individual updates if the amount is small. We will do individual updates for simplicity.
        for (const update of updates) {
            await supabase.from('fb_categories').update({ order: update.order }).eq('id', update.id);
        }
    },

    // --- MENU ITEMS ---
    async getMenuItems(propertyId: string): Promise<FBMenuItem[]> {
        const { data, error } = await supabase
            .from('fb_menu_items')
            .select('*')
            .eq('property_id', propertyId)
            .order('order', { ascending: true })
            .order('name');
        if (error) throw error;
        return (data || []).map(mapMenuItem);
    },

    async createMenuItem(item: Omit<FBMenuItem, 'id' | 'createdAt'>): Promise<FBMenuItem> {
        const { data, error } = await supabase
            .from('fb_menu_items')
            .insert([
                {
                    property_id: item.propertyId,
                    category_id: item.categoryId,
                    name: item.name,
                    name_en: item.name_en || null,
                    name_es: item.name_es || null,
                    description: item.description,
                    description_en: item.description_en || null,
                    description_es: item.description_es || null,
                    price: item.price,
                    ingredients: item.ingredients,
                    flavors: item.flavors,
                    active: item.active,
                    order: item.order || 0,
                    image_url: item.imageUrl,
                },
            ])
            .select()
            .single();
        if (error) throw error;
        return mapMenuItem(data);
    },

    async updateMenuItem(id: string, item: Partial<FBMenuItem>): Promise<FBMenuItem> {
        const toUpdate: any = {};
        if (item.name !== undefined) toUpdate.name = item.name;
        if (item.name_en !== undefined) toUpdate.name_en = item.name_en || null;
        if (item.name_es !== undefined) toUpdate.name_es = item.name_es || null;
        if (item.categoryId !== undefined) toUpdate.category_id = item.categoryId;
        if (item.description !== undefined) toUpdate.description = item.description;
        if (item.description_en !== undefined) toUpdate.description_en = item.description_en || null;
        if (item.description_es !== undefined) toUpdate.description_es = item.description_es || null;
        if (item.price !== undefined) toUpdate.price = item.price;
        if (item.ingredients !== undefined) toUpdate.ingredients = item.ingredients;
        if (item.flavors !== undefined) toUpdate.flavors = item.flavors;
        if (item.active !== undefined) toUpdate.active = item.active;
        if (item.order !== undefined) toUpdate.order = item.order;
        if (item.imageUrl !== undefined) toUpdate.image_url = item.imageUrl;

        const { data, error } = await supabase
            .from('fb_menu_items')
            .update(toUpdate)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return mapMenuItem(data);
    },

    async deleteMenuItem(propertyId: string, id: string): Promise<void> {
        const { error } = await supabase
            .from('fb_menu_items')
            .delete()
            .eq('id', id)
            .eq('property_id', propertyId);
        if (error) throw error;
    },

    async updateMenuItemOrder(updates: { id: string, order: number }[]): Promise<void> {
        for (const update of updates) {
            await supabase.from('fb_menu_items').update({ order: update.order }).eq('id', update.id);
        }
    },

    // --- ORDERS ---
    async getOrderForStayDate(stayId: string, deliveryDate: string, type: FBOrder['type']): Promise<FBOrder | null> {
        const { data, error } = await supabase
            .from('fb_orders')
            .select('*')
            .eq('stay_id', stayId)
            .eq('delivery_date', deliveryDate)
            .eq('type', type)
            .neq('status', 'cancelled')
            .maybeSingle();
        if (error) throw error;
        return data ? mapOrder(data) : null;
    },

    async updateOrder(id: string, patch: { items: FBOrder['items'], totalPrice?: number, deliveryTime?: string }): Promise<FBOrder> {
        const { data, error } = await supabase
            .from('fb_orders')
            .update({
                items: patch.items,
                total_price: patch.totalPrice,
                delivery_time: patch.deliveryTime,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return mapOrder(data);
    },

    async createOrder(order: Omit<FBOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<FBOrder> {
        // Enforce order time window for breakfast deliveries
        if (order.type === 'breakfast' && order.propertyId) {
            const { data: prop } = await supabase
                .from('properties')
                .select('settings')
                .eq('id', order.propertyId)
                .single();

            const delivery = prop?.settings?.fbSettings?.breakfast?.delivery;
            if (delivery?.orderWindowStart && delivery?.orderWindowEnd) {
                const now = new Date();
                const hhmm = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                if (hhmm < delivery.orderWindowStart || hhmm > delivery.orderWindowEnd) {
                    throw new Error(`ORDER_WINDOW_CLOSED:${delivery.orderWindowStart}:${delivery.orderWindowEnd}`);
                }
            }
        }

        // Prevent duplicate orders for the same stay+date+type
        if (order.stayId && order.deliveryDate) {
            const existing = await this.getOrderForStayDate(order.stayId, order.deliveryDate, order.type);
            if (existing) throw new Error(`ORDER_EXISTS:${existing.id}`);
        }

        const { data, error } = await supabase
            .from('fb_orders')
            .insert([
                {
                    property_id: order.propertyId,
                    stay_id: order.stayId,
                    type: order.type,
                    modality: order.modality,
                    status: order.status,
                    items: order.items,
                    total_price: order.totalPrice,
                    delivery_time: order.deliveryTime,
                    delivery_date: order.deliveryDate,
                },
            ])
            .select()
            .single();
        if (error) throw error;
        return mapOrder(data);
    },

    async getOrders(propertyId: string, filters?: { date?: string; type?: 'breakfast' | 'restaurant' }): Promise<FBOrder[]> {
        let query = supabase
            .from('fb_orders')
            .select('*')
            .eq('property_id', propertyId)
            .order('delivery_date', { ascending: true, nullsFirst: false })
            .order('delivery_time', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (filters?.date) {
            // Match by delivery_date OR (delivery_date is null AND created_at falls on that date)
            query = query.or(`delivery_date.eq.${filters.date},and(delivery_date.is.null,created_at.gte.${filters.date}T00:00:00,created_at.lte.${filters.date}T23:59:59)`);
        }
        if (filters?.type) {
            query = query.eq('type', filters.type);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map(mapOrder);
    },

    async updateOrderStatus(id: string, status: FBOrder['status']): Promise<FBOrder> {
        const { data: prev } = await supabase.from('fb_orders').select('status').eq('id', id).single();
        const { data, error } = await supabase
            .from('fb_orders')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        const order = mapOrder(data);
        // Baixa de estoque por ficha técnica ao entregar (1ª vez). Best-effort.
        if (status === 'delivered' && prev?.status !== 'delivered') {
            await this._deductStockForOrder(order);
        }
        return order;
    },

    /** Explode a ficha técnica do pedido e baixa cada insumo vinculado (integração de estoque). */
    async _deductStockForOrder(order: FBOrder): Promise<void> {
        try {
            const menuItems = await this.getMenuItems(order.propertyId);
            const map = new Map(menuItems.map(m => [m.id, m]));
            const actor = { id: 'system', name: 'F&B' };
            for (const oi of (order.items || [])) {
                const mi = map.get(oi.menuItemId);
                if (!mi) continue;
                // Usa os ingredientes do sabor escolhido (se houver), senão os do item.
                let ings = mi.ingredients || [];
                if (oi.flavor && mi.flavors?.length) {
                    const fl = mi.flavors.find(f => f.name === oi.flavor);
                    if (fl?.ingredients?.length) ings = fl.ingredients;
                }
                for (const ing of ings) {
                    if (!ing.productId || !ing.consumptionQty) continue;
                    await StockIntegration.consumeForSale(
                        order.propertyId,
                        { productId: ing.productId, quantity: ing.consumptionQty * oi.quantity, referenceType: 'fb', referenceId: order.id },
                        actor,
                    );
                }
            }
        } catch (e) {
            console.error('[F&B] baixa de estoque do pedido falhou (ignorado):', e);
        }
    }
};
