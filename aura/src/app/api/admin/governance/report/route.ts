// src/app/api/admin/governance/report/route.ts
// Retorna chegadas para uma data específica (relatório de governança).
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

    try {
        const { data: arrivalsData } = await supabaseAdmin
            .from('stays')
            .select('id, cabinId, checkIn, checkOut, guestId, counts, hasPet, areaConfigs, expectedArrivalTime')
            .eq('propertyId', propertyId)
            .gte('checkIn', date)
            .lte('checkIn', `${date}T23:59:59`)
            .neq('status', 'cancelled');

        const rows: any[] = arrivalsData || [];

        const guestIds = Array.from(new Set(rows.map(s => s.guestId).filter(Boolean))) as string[];
        const guestNameMap: Record<string, string> = {};
        if (guestIds.length > 0) {
            const { data: guests } = await supabaseAdmin
                .from('guests')
                .select('id, fullName')
                .in('id', guestIds);
            (guests || []).forEach((g: any) => { guestNameMap[g.id] = g.fullName; });
        }

        const arrivals = rows.map(s => ({
            cabinId: s.cabinId,
            guestName: guestNameMap[s.guestId] ?? 'Hóspede',
            checkIn: s.checkIn,
            checkOut: s.checkOut,
            hasPet: s.hasPet ?? false,
            counts: s.counts ?? undefined,
            areaConfigs: s.areaConfigs ?? undefined,
            expectedArrivalTime: s.expectedArrivalTime ?? undefined,
        }));

        return NextResponse.json({ arrivals });
    } catch (error) {
        console.error('[governance/report]', error);
        return NextResponse.json(null, { status: 500 });
    }
}
