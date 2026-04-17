// src/app/api/admin/auth/me/route.ts
// Fast-path: retorna staff data lendo a sessão diretamente dos cookies (server-side).
// Usado pelo AuthContext para bypassar o browser lock do Supabase no F5.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
    try {
        // Fast-path: middleware already validated the session and injected the userId.
        // If the middleware blocked the request (no session), this route is never reached.
        const userId = request.headers.get('x-user-id');
        if (!userId) return NextResponse.json(null, { status: 401 });

        if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

        const { data: staff } = await supabaseAdmin
            .from('staff')
            .select('*')
            .eq('id', userId)
            .single();

        if (!staff) return NextResponse.json(null, { status: 404 });

        // Inclui property para o PropertyContext não precisar do browser client
        let property = null;
        const propertyId = staff.propertyId
            || (typeof staff.propertyId === 'undefined' ? null : staff.propertyId);
        if (propertyId) {
            const { data } = await supabaseAdmin
                .from('properties')
                .select('*')
                .eq('id', propertyId)
                .single();
            property = data;
        }

        return NextResponse.json({ staff, property });
    } catch {
        return NextResponse.json(null, { status: 500 });
    }
}
