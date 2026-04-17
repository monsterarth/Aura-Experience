// src/app/api/admin/stays/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await requireAuth(['super_admin', 'admin', 'reception', 'governance']);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

    const { data: stay } = await supabaseAdmin
        .from('stays')
        .select('*')
        .eq('id', params.id)
        .eq('propertyId', propertyId)
        .single();

    if (!stay) return NextResponse.json(null, { status: 404 });

    const [gRes, cRes] = await Promise.all([
        stay.guestId
            ? supabaseAdmin.from('guests').select('*').eq('id', stay.guestId).maybeSingle()
            : Promise.resolve({ data: null }),
        stay.cabinId
            ? supabaseAdmin.from('cabins').select('*').eq('id', stay.cabinId).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    return NextResponse.json({
        stay,
        guest: gRes.data ?? null,
        cabin: cRes.data ?? null,
    });
}
