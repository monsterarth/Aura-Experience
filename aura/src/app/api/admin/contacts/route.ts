// src/app/api/admin/contacts/route.ts
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

    const { data, error } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('propertyId', propertyId)
        .order('updatedAt', { ascending: false });

    if (error) return NextResponse.json([], { status: 200 });
    return NextResponse.json(data ?? []);
}
