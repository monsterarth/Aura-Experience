// src/app/api/admin/governance/init/route.ts
// Retorna cabanas, staff, estruturas e estadias ativas (com nomes) para a página de governança.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { stayDisplayName } from '@/lib/stay-display';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

    try {
        const [cabinsRes, staffRes, structuresRes, staysRes] = await Promise.all([
            supabaseAdmin.from('cabins').select('*').eq('propertyId', propertyId),
            supabaseAdmin.from('staff').select('*').eq('propertyId', propertyId),
            supabaseAdmin.from('structures').select('*').eq('propertyId', propertyId),
            supabaseAdmin
                .from('stays')
                .select('id, cabinId, hasPet, checkIn, checkOut, guestId, counts, areaConfigs, expectedArrivalTime, internalUse, internalLabel')
                .eq('propertyId', propertyId)
                .eq('status', 'active'),
        ]);

        const stays: any[] = staysRes.data || [];

        const guestIds = Array.from(new Set(stays.map(s => s.guestId).filter(Boolean))) as string[];
        const guestNameMap: Record<string, string> = {};
        if (guestIds.length > 0) {
            const { data: guests } = await supabaseAdmin
                .from('guests')
                .select('id, fullName')
                .in('id', guestIds);
            (guests || []).forEach((g: any) => { guestNameMap[g.id] = g.fullName; });
        }

        const activeStays = stays.map(s => ({
            id: s.id,
            cabinId: s.cabinId,
            hasPet: s.hasPet ?? false,
            checkIn: s.checkIn,
            checkOut: s.checkOut,
            guestName: stayDisplayName(s, s.guestId ? guestNameMap[s.guestId] : undefined),
            internalUse: !!s.internalUse,
            counts: s.counts ?? undefined,
            areaConfigs: s.areaConfigs ?? undefined,
            expectedArrivalTime: s.expectedArrivalTime ?? undefined,
        }));

        return NextResponse.json({
            cabins: cabinsRes.data ?? [],
            staff: staffRes.data ?? [],
            structures: structuresRes.data ?? [],
            activeStays,
        });
    } catch (error) {
        console.error('[governance/init]', error);
        return NextResponse.json(null, { status: 500 });
    }
}
