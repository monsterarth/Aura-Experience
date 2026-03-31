// src/app/api/admin/auth/me/route.ts
// Fast-path: retorna staff data lendo a sessão diretamente dos cookies (server-side).
// Usado pelo AuthContext para bypassar o browser lock do Supabase no F5.
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
    try {
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

        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return NextResponse.json(null, { status: 401 });

        if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

        const { data: staff } = await supabaseAdmin
            .from('staff')
            .select('*')
            .eq('id', user.id)
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
