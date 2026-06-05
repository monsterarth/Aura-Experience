// src/app/api/admin/reception/dashboard/route.ts
// Retorna todos os dados estáticos do painel da recepção em uma única chamada.
// Usa supabaseAdmin (service role) — sem browser navigator.locks.
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

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const today = todayStart.toISOString().split('T')[0];
    const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    try {
        // Cabanas fora da ocupação (extras / uso da casa) — excluídas dos números de ocupação
        const { data: ignoredCabinsData } = await supabaseAdmin.from('cabins')
            .select('id').eq('propertyId', propertyId).eq('ignoreInOccupancy', true);
        const ignoredCabinIds = (ignoredCabinsData ?? []).map((c: any) => c.id as string);

        const [
            cabinsRes,
            staffRes,
            checkinsDoneRes,
            checkinsTotalRes,
            checkoutsDoneRes,
            checkoutsTotalRes,
            occupiedRes,
            totalCabinsRes,
            arrivingCabinsRes,
            availableCabinsRes,
            structuresRes,
            structureBookingsRes,
            surveyRes,
            msgRes,
            breakfastTodayRes,
            breakfastTomorrowRes,
            todayArrivalsRes,
        ] = await Promise.all([
            supabaseAdmin.from('cabins').select('id, name, status').eq('propertyId', propertyId),
            supabaseAdmin.from('staff').select('id, fullName').eq('propertyId', propertyId),
            // Check-ins feitos hoje
            supabaseAdmin.from('stays').select('id', { count: 'exact', head: true })
                .eq('propertyId', propertyId)
                .gte('checkIn', todayStart.toISOString()).lte('checkIn', todayEnd.toISOString())
                .eq('status', 'active'),
            // Check-ins esperados hoje
            supabaseAdmin.from('stays').select('id', { count: 'exact', head: true })
                .eq('propertyId', propertyId)
                .gte('checkIn', todayStart.toISOString()).lte('checkIn', todayEnd.toISOString())
                .in('status', ['pending', 'pre_checkin_done', 'active']),
            // Check-outs feitos hoje
            supabaseAdmin.from('stays').select('id', { count: 'exact', head: true })
                .eq('propertyId', propertyId)
                .gte('checkOut', todayStart.toISOString()).lte('checkOut', todayEnd.toISOString())
                .in('status', ['checked_out', 'finished', 'archived']),
            // Check-outs esperados hoje
            supabaseAdmin.from('stays').select('id', { count: 'exact', head: true })
                .eq('propertyId', propertyId)
                .gte('checkOut', todayStart.toISOString()).lte('checkOut', todayEnd.toISOString())
                .in('status', ['active', 'checked_out', 'finished', 'archived']),
            // Cabanas ocupadas (exclui estadias em cabanas fora da ocupação)
            (() => {
                let q = supabaseAdmin!.from('stays').select('id', { count: 'exact', head: true })
                    .eq('propertyId', propertyId).eq('status', 'active');
                if (ignoredCabinIds.length) q = q.or(`cabinId.is.null,cabinId.not.in.(${ignoredCabinIds.join(',')})`);
                return q;
            })(),
            // Total de cabanas (exclui as marcadas como fora da ocupação)
            supabaseAdmin.from('cabins').select('id', { count: 'exact', head: true })
                .eq('propertyId', propertyId).eq('ignoreInOccupancy', false),
            // Cabanas com chegada hoje (não disponíveis para walk-in)
            supabaseAdmin.from('stays').select('cabinId')
                .eq('propertyId', propertyId)
                .gte('checkIn', todayStart.toISOString()).lte('checkIn', todayEnd.toISOString())
                .in('status', ['pending', 'pre_checkin_done', 'active'])
                .not('cabinId', 'is', null),
            // Cabanas disponíveis (exclui as marcadas como fora da ocupação)
            supabaseAdmin.from('cabins').select('id')
                .eq('propertyId', propertyId).eq('status', 'available').eq('ignoreInOccupancy', false),
            // Estruturas
            supabaseAdmin.from('structures').select('*').eq('propertyId', propertyId),
            // Reservas de estruturas hoje (exceto canceladas/rejeitadas)
            supabaseAdmin.from('structure_bookings').select('*')
                .eq('propertyId', propertyId).eq('date', today)
                .not('status', 'in', '("cancelled","rejected")'),
            // Pesquisas de satisfação nas últimas 48h
            supabaseAdmin.from('survey_responses').select('id, stayId, metrics, createdAt')
                .eq('propertyId', propertyId).gte('createdAt', since48h).order('createdAt', { ascending: false }),
            // Mensagens com falha nas últimas 48h
            supabaseAdmin.from('messages').select('id, triggerEvent, to, createdAt')
                .eq('propertyId', propertyId).eq('status', 'failed')
                .gte('createdAt', since48h).order('createdAt', { ascending: false }).limit(5),
            // Pedidos de café hoje (fb_orders usa snake_case)
            supabaseAdmin.from('fb_orders').select('*')
                .eq('property_id', propertyId).eq('type', 'breakfast').eq('delivery_date', today)
                .neq('status', 'cancelled'),
            // Pedidos de café amanhã
            supabaseAdmin.from('fb_orders').select('*')
                .eq('property_id', propertyId).eq('type', 'breakfast').eq('delivery_date', tomorrowStr)
                .neq('status', 'cancelled'),
            // Chegadas de hoje ainda pendentes — usadas pela recepção para notificar
            // quando a governanta libera uma cabana com check-in no dia
            supabaseAdmin.from('stays').select('cabinId, guestId, internalUse, internalLabel')
                .eq('propertyId', propertyId)
                .gte('checkIn', todayStart.toISOString()).lte('checkIn', todayEnd.toISOString())
                .in('status', ['pending', 'pre_checkin_done'])
                .not('cabinId', 'is', null),
        ]);

        const cabins: any[] = cabinsRes.data || [];
        const cabinNameMap: Record<string, string> = Object.fromEntries(cabins.map(c => [c.id, c.name]));

        // Stats
        const arrivingCabinIds = new Set((arrivingCabinsRes.data || []).map((s: any) => s.cabinId));
        const availableCabinIds: string[] = (availableCabinsRes.data || []).map((c: any) => c.id);
        const walkIns = availableCabinIds.filter(id => !arrivingCabinIds.has(id)).length;
        const stats = {
            checkinsDone: checkinsDoneRes.count ?? 0,
            checkinsTotal: checkinsTotalRes.count ?? 0,
            checkoutsDone: checkoutsDoneRes.count ?? 0,
            checkoutsTotal: checkoutsTotalRes.count ?? 0,
            occupiedCabins: occupiedRes.count ?? 0,
            totalCabins: totalCabinsRes.count ?? 0,
            walkIns,
        };

        // Reservas de estruturas — embutir nome da cabana via stayId
        const activeBookings: any[] = structureBookingsRes.data || [];
        const bookingStayIds = Array.from(new Set(activeBookings.filter(b => b.stayId).map(b => b.stayId)));
        const bookingStayCabinMap: Record<string, string> = {};
        if (bookingStayIds.length > 0) {
            const { data: stayRows } = await supabaseAdmin.from('stays').select('id, cabinId').in('id', bookingStayIds);
            (stayRows || []).forEach((s: any) => {
                if (s.cabinId && cabinNameMap[s.cabinId]) bookingStayCabinMap[s.id] = cabinNameMap[s.cabinId];
            });
        }
        const structureBookings = activeBookings.map(b => ({
            ...b,
            bookingCabinName: b.stayId ? (bookingStayCabinMap[b.stayId] ?? null) : null,
        }));

        // Detratores — embutir nome da cabana via stayId
        const detractorList: any[] = (surveyRes.data || []).filter((r: any) => r.metrics?.isDetractor === true).slice(0, 5);
        const detractorStayIds = Array.from(new Set(detractorList.filter(r => r.stayId).map(r => r.stayId)));
        const detractorStayCabinMap: Record<string, string> = {};
        if (detractorStayIds.length > 0) {
            const { data: stayRows } = await supabaseAdmin.from('stays').select('id, cabinId').in('id', detractorStayIds);
            (stayRows || []).forEach((s: any) => {
                if (s.cabinId && cabinNameMap[s.cabinId]) detractorStayCabinMap[s.id] = cabinNameMap[s.cabinId];
            });
        }
        const detractors = detractorList.map(r => ({
            ...r,
            cabinName: r.stayId ? (detractorStayCabinMap[r.stayId] ?? 'Hóspede') : 'Hóspede',
        }));

        // Pedidos de café — converter snake_case → camelCase + embutir nome da cabana
        const allBreakfastRaw: any[] = [
            ...(breakfastTodayRes.data || []),
            ...(breakfastTomorrowRes.data || []),
        ];
        allBreakfastRaw.sort((a, b) => {
            const da = (a.delivery_date ?? '') + (a.delivery_time ?? '');
            const db = (b.delivery_date ?? '') + (b.delivery_time ?? '');
            return da.localeCompare(db);
        });
        const breakfastStayIds = Array.from(new Set(allBreakfastRaw.filter(o => o.stay_id).map(o => o.stay_id)));
        const breakfastStayCabinMap: Record<string, string> = {};
        if (breakfastStayIds.length > 0) {
            const { data: stayRows } = await supabaseAdmin.from('stays').select('id, cabinId').in('id', breakfastStayIds);
            (stayRows || []).forEach((s: any) => {
                if (s.cabinId && cabinNameMap[s.cabinId]) breakfastStayCabinMap[s.id] = cabinNameMap[s.cabinId];
            });
        }
        const breakfastOrders = allBreakfastRaw.map(o => ({
            id: o.id,
            propertyId: o.property_id,
            stayId: o.stay_id,
            type: o.type,
            modality: o.modality,
            status: o.status,
            items: o.items,
            totalPrice: o.total_price,
            deliveryTime: o.delivery_time,
            deliveryDate: o.delivery_date,
            guestName: o.guest_name,
            cabinName: o.stay_id
                ? (breakfastStayCabinMap[o.stay_id] ?? o.cabin_name ?? 'Cabana')
                : (o.cabin_name ?? 'Cabana'),
        }));

        // Chegadas do dia — resolve nomes de hóspedes em lote para notificação da recepção
        const arrivalsRaw: any[] = todayArrivalsRes.data ?? [];
        const arrivalGuestIds = Array.from(new Set(arrivalsRaw.filter(s => s.guestId).map(s => s.guestId as string)));
        const arrivalGuestMap: Record<string, string> = {};
        if (arrivalGuestIds.length > 0) {
            const { data: guestRows } = await supabaseAdmin
                .from('guests').select('id, fullName').in('id', arrivalGuestIds);
            (guestRows ?? []).forEach((g: any) => { arrivalGuestMap[g.id] = g.fullName; });
        }
        const todayArrivals = arrivalsRaw.map((s: any) => ({
            cabinId:   s.cabinId,
            cabinName: cabinNameMap[s.cabinId] ?? 'Cabana',
            guestName: stayDisplayName(s, s.guestId ? arrivalGuestMap[s.guestId] : undefined),
            internalUse: !!s.internalUse,
        }));

        return NextResponse.json({
            stats,
            cabins,
            staff: staffRes.data ?? [],
            structures: structuresRes.data ?? [],
            structureBookings,
            detractors,
            msgFailures: msgRes.data ?? [],
            breakfastOrders,
            todayArrivals,
        });
    } catch (error) {
        console.error('[reception/dashboard]', error);
        return NextResponse.json(null, { status: 500 });
    }
}
