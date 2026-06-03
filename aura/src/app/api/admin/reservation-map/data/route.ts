// src/app/api/admin/reservation-map/data/route.ts
// Retorna cabanas, stays (com nomes), tarefas e staff para o mapa de reservas.
// Usa supabaseAdmin — sem browser navigator.locks.
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
    const windowStart = searchParams.get('windowStart');
    const windowEnd = searchParams.get('windowEnd');
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

    try {
        // Stays query — com ou sem filtro de janela de datas
        let staysQuery = supabaseAdmin
            .from('stays')
            .select('*')
            .eq('propertyId', propertyId)
            .in('status', ['pending', 'pre_checkin_done', 'active', 'finished']);

        if (windowStart && windowEnd) {
            staysQuery = staysQuery.lte('checkIn', windowEnd).gte('checkOut', windowStart);
        }

        const [cabinsRes, staysRes, maintenanceRes, hkRes, staffRes] = await Promise.all([
            supabaseAdmin.from('cabins').select('*').eq('propertyId', propertyId).order('name'),
            staysQuery,
            supabaseAdmin.from('maintenance_tasks').select('*')
                .eq('propertyId', propertyId)
                .not('cabinId', 'is', null)
                .in('status', ['pending', 'in_progress']),
            supabaseAdmin.from('housekeeping_tasks').select('*')
                .eq('propertyId', propertyId)
                .in('status', ['pending', 'in_progress', 'waiting_conference']),
            supabaseAdmin.from('staff').select('id, fullName').eq('propertyId', propertyId),
        ]);

        const stays: any[] = staysRes.data || [];

        // Enriquecer stays com nome do hóspede via batch lookup
        const guestIds = Array.from(new Set(stays.map(s => s.guestId).filter(Boolean))) as string[];
        const guestNameMap: Record<string, string> = {};
        if (guestIds.length > 0) {
            const { data: guests } = await supabaseAdmin
                .from('guests')
                .select('id, fullName')
                .in('id', guestIds);
            (guests || []).forEach((g: any) => { guestNameMap[g.id] = g.fullName; });
        }

        const enrichedStays = stays.map(s => ({
            ...s,
            guestName: stayDisplayName(s, s.guestId ? guestNameMap[s.guestId] : undefined),
        }));

        return NextResponse.json({
            cabins: cabinsRes.data ?? [],
            stays: enrichedStays,
            maintenanceTasks: maintenanceRes.data ?? [],
            housekeepingTasks: hkRes.data ?? [],
            staff: staffRes.data ?? [],
        });
    } catch (error) {
        console.error('[reservation-map/data]', error);
        return NextResponse.json(null, { status: 500 });
    }
}
