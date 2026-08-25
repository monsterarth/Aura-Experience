// src/app/api/admin/concierge/by-stay/route.ts
// Pedidos de concierge de UMA estadia (modal + ficha completa), enriquecidos com o
// nome do item. O navegador não lê concierge_requests direto desde o hardening da
// anon key — toda leitura admin passa por rota com service-role.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

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
            .select('id, "itemId", quantity, status, urgent, notes, "createdAt"')
            .eq('propertyId', propertyId)
            .eq('stayId', stayId)
            .order('createdAt', { ascending: false });

        const requests: any[] = raw || [];
        const itemIds = Array.from(new Set(requests.map(r => r.itemId).filter(Boolean))) as string[];
        const { data: items } = itemIds.length
            ? await supabaseAdmin.from('concierge_items').select('id, name').in('id', itemIds)
            : { data: [] as any[] };

        const itemName: Record<string, string> = {};
        (items || []).forEach((i: any) => { itemName[i.id] = i.name; });

        return NextResponse.json({
            requests: requests.map(r => ({ ...r, itemName: itemName[r.itemId] ?? 'Item' })),
        });
    } catch (error) {
        console.error('[concierge/by-stay]', error);
        return NextResponse.json(null, { status: 500 });
    }
}
