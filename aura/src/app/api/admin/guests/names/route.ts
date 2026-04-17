// src/app/api/admin/guests/names/route.ts
// Bulk guest name lookup by IDs — used by reservation map to avoid RLS issues
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
    const auth = await requireAuth(['super_admin', 'admin', 'reception', 'governance']);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json({}, { status: 500 });

    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

    if (ids.length === 0) return NextResponse.json({});

    const { data } = await supabaseAdmin
        .from('guests')
        .select('id, fullName')
        .in('id', ids);

    const map: Record<string, string> = {};
    for (const g of data ?? []) map[g.id] = g.fullName;
    return NextResponse.json(map);
}
