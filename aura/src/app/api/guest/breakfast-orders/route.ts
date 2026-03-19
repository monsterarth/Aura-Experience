// src/app/api/guest/breakfast-orders/route.ts
// API route para pedidos de café da manhã feitos pelo portal do hóspede.
// Usa supabaseAdmin para contornar RLS — o hóspede é anônimo (sem sessão).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function mapOrder(d: any) {
    return {
        id: d.id, propertyId: d.property_id, stayId: d.stay_id, type: d.type,
        modality: d.modality, status: d.status, items: d.items, totalPrice: d.total_price,
        deliveryTime: d.delivery_time, deliveryDate: d.delivery_date,
        createdAt: d.created_at, updatedAt: d.updated_at,
    };
}

/**
 * Valida que o stayId pertence ao propertyId (segurança anti-abuso).
 */
async function validateStayOwnership(stayId: string, propertyId: string) {
    if (!supabaseAdmin) return false;
    const { data, error } = await supabaseAdmin
        .from('stays')
        .select('id')
        .eq('id', stayId)
        .eq('propertyId', propertyId)
        .single();
    return !error && !!data;
}

/**
 * GET /api/guest/breakfast-orders?stayId=...&propertyId=...&deliveryDate=...&type=breakfast
 * Busca pedido existente para o stay+date+type.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const stayId = searchParams.get("stayId");
        const propertyId = searchParams.get("propertyId");
        const deliveryDate = searchParams.get("deliveryDate");
        const type = searchParams.get("type") || "breakfast";

        if (!stayId || !propertyId || !deliveryDate) {
            return NextResponse.json({ error: "Missing required params: stayId, propertyId, deliveryDate" }, { status: 400 });
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        if (!(await validateStayOwnership(stayId, propertyId))) {
            return NextResponse.json({ error: "Invalid stay or property" }, { status: 403 });
        }

        const { data, error } = await supabaseAdmin
            .from('fb_orders')
            .select('*')
            .eq('stay_id', stayId)
            .eq('property_id', propertyId)
            .eq('delivery_date', deliveryDate)
            .eq('type', type)
            .neq('status', 'cancelled')
            .maybeSingle();

        if (error) {
            console.error("[guest/breakfast-orders GET] Error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ order: data ? mapOrder(data) : null });
    } catch (err) {
        console.error("[guest/breakfast-orders GET] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * POST /api/guest/breakfast-orders
 * Cria novo pedido de café da manhã.
 * Body: { propertyId, stayId, modality, items, totalPrice, deliveryTime?, deliveryDate, tableId?, attendanceId? }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { propertyId, stayId, modality, items, totalPrice, deliveryTime, deliveryDate, tableId, attendanceId } = body;

        if (!propertyId || !stayId || !modality || !items || !deliveryDate) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        if (!(await validateStayOwnership(stayId, propertyId))) {
            return NextResponse.json({ error: "Invalid stay or property" }, { status: 403 });
        }

        // Enforce order time window for breakfast deliveries
        if (modality === 'delivery') {
            const { data: prop } = await supabaseAdmin
                .from('properties')
                .select('settings')
                .eq('id', propertyId)
                .single();

            const delivery = prop?.settings?.fbSettings?.breakfast?.delivery;
            if (delivery?.orderWindowStart && delivery?.orderWindowEnd) {
                const now = new Date();
                const hhmm = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                if (hhmm < delivery.orderWindowStart || hhmm > delivery.orderWindowEnd) {
                    return NextResponse.json(
                        { error: `ORDER_WINDOW_CLOSED:${delivery.orderWindowStart}:${delivery.orderWindowEnd}` },
                        { status: 400 }
                    );
                }
            }
        }

        // Prevent duplicate orders for the same stay+date+type
        const { data: existing } = await supabaseAdmin
            .from('fb_orders')
            .select('id')
            .eq('stay_id', stayId)
            .eq('delivery_date', deliveryDate)
            .eq('type', 'breakfast')
            .neq('status', 'cancelled')
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ error: `ORDER_EXISTS:${existing.id}` }, { status: 409 });
        }

        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        const insertPayload: Record<string, unknown> = {
            id,
            property_id: propertyId,
            stay_id: stayId,
            type: 'breakfast',
            modality,
            status: 'pending',
            items,
            total_price: totalPrice || 0,
            delivery_date: deliveryDate,
            delivery_time: deliveryTime || null,
            created_at: now,
            updated_at: now,
        };

        // Campos extras do buffet
        if (tableId) insertPayload.table_id = tableId;
        if (attendanceId) insertPayload.attendance_id = attendanceId;
        if (modality === 'buffet') insertPayload.requested_by = 'guest';

        const { error } = await supabaseAdmin
            .from('fb_orders')
            .insert(insertPayload);

        if (error) {
            console.error("[guest/breakfast-orders POST] Insert error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ id }, { status: 201 });
    } catch (err) {
        console.error("[guest/breakfast-orders POST] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * PATCH /api/guest/breakfast-orders
 * Atualiza pedido existente (itens, totalPrice, deliveryTime).
 * Body: { orderId, stayId, propertyId, items, totalPrice?, deliveryTime? }
 */
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { orderId, stayId, propertyId, items, totalPrice, deliveryTime } = body;

        if (!orderId || !stayId || !propertyId || !items) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        if (!(await validateStayOwnership(stayId, propertyId))) {
            return NextResponse.json({ error: "Invalid stay or property" }, { status: 403 });
        }

        // Validate order belongs to this stay+property
        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('fb_orders')
            .select('id, status')
            .eq('id', orderId)
            .eq('stay_id', stayId)
            .eq('property_id', propertyId)
            .single();

        if (fetchError || !existing) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const updatePayload: Record<string, unknown> = {
            items,
            updated_at: new Date().toISOString(),
        };
        if (totalPrice !== undefined) updatePayload.total_price = totalPrice;
        if (deliveryTime !== undefined) updatePayload.delivery_time = deliveryTime;

        const { error } = await supabaseAdmin
            .from('fb_orders')
            .update(updatePayload)
            .eq('id', orderId);

        if (error) {
            console.error("[guest/breakfast-orders PATCH] Update error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[guest/breakfast-orders PATCH] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * DELETE /api/guest/breakfast-orders?orderId=...&stayId=...&propertyId=...
 * Cancela pedido existente.
 */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get("orderId");
        const stayId = searchParams.get("stayId");
        const propertyId = searchParams.get("propertyId");

        if (!orderId || !stayId || !propertyId) {
            return NextResponse.json({ error: "Missing required params" }, { status: 400 });
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        if (!(await validateStayOwnership(stayId, propertyId))) {
            return NextResponse.json({ error: "Invalid stay or property" }, { status: 403 });
        }

        // Validate order belongs to this stay+property
        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('fb_orders')
            .select('id, status')
            .eq('id', orderId)
            .eq('stay_id', stayId)
            .eq('property_id', propertyId)
            .single();

        if (fetchError || !existing) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        if (!['pending', 'confirmed'].includes(existing.status)) {
            return NextResponse.json({ error: "This order cannot be cancelled" }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('fb_orders')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', orderId);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[guest/breakfast-orders DELETE] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
