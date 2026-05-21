// src/app/api/admin/concierge/history/route.ts
// Retorna histórico de pedidos de concierge de um dia específico, enriquecido com item e cabana.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const date = searchParams.get('date'); // YYYY-MM-DD
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);

    try {
        const { data: raw } = await supabaseAdmin
            .from('concierge_requests')
            .select('*')
            .eq('propertyId', propertyId)
            .not('status', 'in', '("pending","in_progress")')
            .gte('createdAt', dayStart.toISOString())
            .lte('createdAt', dayEnd.toISOString())
            .order('createdAt', { ascending: false });

        const requests: any[] = raw || [];
        if (!requests.length) return NextResponse.json({ requests: [] });

        const itemIds = Array.from(new Set(requests.map(r => r.itemId).filter(Boolean))) as string[];
        const cabinIds = Array.from(new Set(requests.map(r => r.cabinId).filter(Boolean))) as string[];

        const [itemsRes, cabinsRes] = await Promise.all([
            itemIds.length
                ? supabaseAdmin.from('concierge_items').select('*').in('id', itemIds)
                : Promise.resolve({ data: [] as any[] }),
            cabinIds.length
                ? supabaseAdmin.from('cabins').select('id, name').in('id', cabinIds)
                : Promise.resolve({ data: [] as any[] }),
        ]);

        const itemMap: Record<string, any> = {};
        (itemsRes.data || []).forEach((i: any) => { itemMap[i.id] = i; });
        const cabinNameMap: Record<string, string> = {};
        (cabinsRes.data || []).forEach((c: any) => { cabinNameMap[c.id] = c.name; });

        const enriched = requests.map(r => ({
            ...r,
            item: r.itemId ? (itemMap[r.itemId] ?? undefined) : undefined,
            cabinName: r.cabinId ? (cabinNameMap[r.cabinId] ?? undefined) : undefined,
        }));

        return NextResponse.json({ requests: enriched });
    } catch (error) {
        console.error('[concierge/history]', error);
        return NextResponse.json(null, { status: 500 });
    }
}
