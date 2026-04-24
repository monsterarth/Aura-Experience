// src/app/api/admin/stays/route.ts
// Server-side stays list — bypasses browser navigator.locks entirely.
// Uses supabaseAdmin (service role, no auth lock) to fetch stays + guest/cabin names.
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
    try {
        // Validate session server-side
        const cookieStore = cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll(); },
                    setAll() {},
                },
            }
        );
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json(null, { status: 401 });

        if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

        const { searchParams } = new URL(request.url);
        const propertyId = searchParams.get('propertyId');
        const statusParam = searchParams.get('status'); // comma-separated

        if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

        const statusList = statusParam ? statusParam.split(',') : [];

        let query = supabaseAdmin
            .from('stays')
            .select('*')
            .eq('propertyId', propertyId)
            .order('checkIn', { ascending: true });

        if (statusList.length > 0) {
            query = query.in('status', statusList);
        }

        const { data: stays, error } = await query;
        if (error || !stays) return NextResponse.json([], { status: 200 });

        // Enrich with guest name, cabin name, and pending folio count
        const enriched = await Promise.all(stays.map(async (stay: any) => {
            const [gRes, cRes, folioRes] = await Promise.all([
                stay.guestId
                    ? supabaseAdmin!.from('guests').select('fullName').eq('id', stay.guestId).maybeSingle()
                    : Promise.resolve({ data: null }),
                stay.cabinId
                    ? supabaseAdmin!.from('cabins').select('name').eq('id', stay.cabinId).maybeSingle()
                    : Promise.resolve({ data: null }),
                supabaseAdmin!.from('folio_items').select('id, description, quantity, unitPrice, totalPrice, status, category', { count: 'exact' }).eq('stayId', stay.id),
            ]);
            const folioItems = (folioRes.data ?? []) as any[];
            const pendingFolioCount = folioItems.filter((f: any) => f.status === 'pending').length;
            return {
                ...stay,
                guestName: gRes.data ? (gRes.data as any).fullName : 'Hóspede desconhecido',
                cabinName: cRes.data ? (cRes.data as any).name : 'Sem Cabana',
                folioItems,
                pendingFolioCount,
                hasOpenFolio: pendingFolioCount > 0,
            };
        }));

        return NextResponse.json(enriched);
    } catch {
        return NextResponse.json(null, { status: 500 });
    }
}
