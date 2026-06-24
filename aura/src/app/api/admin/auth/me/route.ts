// src/app/api/admin/auth/me/route.ts
// Retorna staff + property validando a sessão pelos COOKIES (server-side). Usado pelo AuthContext
// para resolver a auth sem depender do client do browser (evita o lock no F5). NÃO confia no
// header x-user-id (forjável) — valida sempre via getUser() sobre os cookies da request.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createClientServer } from '@/lib/supabase-server';

export async function GET() {
    try {
        const supabase = createClientServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json(null, { status: 401 });

        if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

        const { data: staff } = await supabaseAdmin
            .from('staff')
            .select('*')
            .eq('id', user.id)
            .single();

        if (!staff) return NextResponse.json(null, { status: 404 });

        // Inclui property para o PropertyContext não precisar do client do browser
        let property = null;
        if (staff.propertyId) {
            const { data } = await supabaseAdmin
                .from('properties')
                .select('*')
                .eq('id', staff.propertyId)
                .single();
            property = data;
        }

        return NextResponse.json({ staff, property });
    } catch {
        return NextResponse.json(null, { status: 500 });
    }
}
