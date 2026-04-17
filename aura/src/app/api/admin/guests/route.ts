// src/app/api/admin/guests/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
    const auth = await requireAuth(['super_admin', 'admin', 'reception', 'governance']);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json([], { status: 500 });

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

    let query = supabaseAdmin
        .from('guests')
        .select('*')
        .eq('propertyId', propertyId)
        .order('fullName', { ascending: true })
        .limit(100);

    const search = searchParams.get('search')?.trim();
    if (search) {
        query = query.or(
            `fullName.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,id.ilike.%${search}%`
        );
    }

    const { data, error } = await query;
    if (error) return NextResponse.json([], { status: 200 });
    return NextResponse.json(data ?? []);
}
