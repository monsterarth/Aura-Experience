// src/app/api/admin/concierge/new-request-data/route.ts
// Retorna cabanas (com estadia ativa embutida) e itens ativos para o modal de novo pedido de concierge.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

    try {
        const [cabinsRes, staysRes, itemsRes] = await Promise.all([
            supabaseAdmin.from('cabins').select('id, name').eq('propertyId', propertyId).order('name', { ascending: true }),
            supabaseAdmin
                .from('stays')
                .select('id, cabinId, guestId')
                .eq('propertyId', propertyId)
                .in('status', ['active', 'pending', 'pre_checkin_done']),
            supabaseAdmin
                .from('concierge_items')
                .select('*')
                .eq('propertyId', propertyId)
                .eq('active', true)
                .eq('deleted', false)
                .order('order', { ascending: true }),
        ]);

        const stays: any[] = staysRes.data || [];

        // Batch lookup guest names
        const guestIds = Array.from(new Set(stays.map(s => s.guestId).filter(Boolean))) as string[];
        const guestNameMap: Record<string, string> = {};
        if (guestIds.length > 0) {
            const { data: guests } = await supabaseAdmin
                .from('guests')
                .select('id, fullName')
                .in('id', guestIds);
            (guests || []).forEach((g: any) => { guestNameMap[g.id] = g.fullName; });
        }

        // Build cabin options with embedded stay info
        const stayByCabinId: Record<string, { stayId: string; guestName: string }> = {};
        stays.forEach(s => {
            if (s.cabinId) {
                stayByCabinId[s.cabinId] = {
                    stayId: s.id,
                    guestName: guestNameMap[s.guestId] ?? '—',
                };
            }
        });

        const cabins = (cabinsRes.data || []).map((c: any) => {
            const match = stayByCabinId[c.id];
            return { id: c.id, name: c.name, stayId: match?.stayId, guestName: match?.guestName };
        });

        return NextResponse.json({
            cabins,
            items: itemsRes.data ?? [],
        });
    } catch (error) {
        console.error('[concierge/new-request-data]', error);
        return NextResponse.json(null, { status: 500 });
    }
}
