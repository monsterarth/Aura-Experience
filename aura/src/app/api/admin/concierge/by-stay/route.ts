// src/app/api/admin/concierge/by-stay/route.ts
//
// O concierge de UMA estadia, do ponto de vista da conta:
//   GET  → pedidos da estadia (o que está em aberto e o que está emprestado com
//          o hóspede), enriquecidos com nome/categoria/preço do item.
//   POST → lançar itens do catálogo na conta ("launch"), marcar um empréstimo
//          como devolvido ("return") ou extraviado ("lost").
//
// Empréstimo não tem tabela própria: é um pedido de item `category: 'loan'` que
// ficou em `delivered`. Por isso o que a camareira ou o mensageiro entregam pelo
// app aparece na conta sozinho — mesma fila, uma verdade só.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { FOLIO_CLOSED } from '@/lib/folio-guard';
import { supabaseAdmin } from '@/lib/supabase';
import { ConciergeService } from '@/services/concierge-service';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

    const { searchParams } = new URL(request.url);
    const propertyId = scopedPropertyId(auth, searchParams.get('propertyId'));
    const stayId = searchParams.get('stayId');
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
    if (!stayId) return NextResponse.json({ error: 'stayId required' }, { status: 400 });

    try {
        const { data: raw } = await supabaseAdmin
            .from('concierge_requests')
            .select('id, "itemId", quantity, status, urgent, notes, total_price, "createdAt", "assignedName", "requestedBy"')
            .eq('propertyId', propertyId)
            .eq('stayId', stayId)
            .order('createdAt', { ascending: false });

        const requests: any[] = raw || [];
        const itemIds = Array.from(new Set(requests.map(r => r.itemId).filter(Boolean))) as string[];
        const { data: items } = itemIds.length
            ? await supabaseAdmin.from('concierge_items').select('id, name, category, price, loss_price').in('id', itemIds)
            : { data: [] as any[] };

        const byId: Record<string, any> = {};
        (items || []).forEach((i: any) => { byId[i.id] = i; });

        return NextResponse.json({
            requests: requests.map(r => {
                const item = byId[r.itemId];
                return {
                    ...r,
                    itemName: item?.name ?? 'Item',
                    category: item?.category ?? 'consumption',
                    price: item?.price ?? 0,
                    lossPrice: item?.loss_price ?? 0,
                };
            }),
        });
    } catch (error) {
        console.error('[concierge/by-stay]', error);
        return NextResponse.json(null, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAuth(['super_admin', 'admin', 'manager', 'reception']);
    if (isAuthError(auth)) return auth;

    const body = await request.json().catch(() => ({}));
    const propertyId = scopedPropertyId(auth, body?.propertyId);
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

    const actorId = auth.staff.id;
    const actorName = auth.staff.fullName || 'Recepção';

    try {
        if (body.action === 'launch') {
            const cart = (body.cart ?? {}) as Record<string, number>;
            if (!body.stayId) return NextResponse.json({ error: 'stayId required' }, { status: 400 });
            if (Object.keys(cart).length === 0) return NextResponse.json({ error: 'Carrinho vazio.' }, { status: 400 });
            const launched = await ConciergeService.launchItems(
                propertyId,
                { stayId: body.stayId, cabinId: body.cabinId, cart, requestedBy: 'guest', notes: body.notes },
                actorId, actorName,
            );
            return NextResponse.json({ ok: true, launched });
        }

        if (body.action === 'return' || body.action === 'lost') {
            if (!body.requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 });
            if (body.action === 'return') await ConciergeService.returnRequest(propertyId, body.requestId, actorId, actorName);
            else await ConciergeService.markLost(propertyId, body.requestId, actorId, actorName);
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: 'action inválida ("launch" | "return" | "lost").' }, { status: 400 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha na operação.';
        const code = (error as { code?: string })?.code;
        const status = code === 'CONFLICT' || code === FOLIO_CLOSED ? 409 : 500;
        console.error('[concierge/by-stay POST]', error);
        return NextResponse.json({ error: message }, { status });
    }
}
