// src/app/api/admin/concierge/catalog/route.ts
// Retorna itens e grupos do catálogo de concierge.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

    // Escopo de propriedade: admin-tier pode passar propertyId livre; demais cargos ficam presos
    // à própria propriedade (antes qualquer staff autenticado lia o catálogo de qualquer propriedade).
    const isAdminTier = ['super_admin', 'admin', 'manager'].includes(auth.staff.role);
    const { searchParams } = new URL(request.url);
    const requested = searchParams.get('propertyId');
    const propertyId = isAdminTier && requested ? requested : auth.staff.propertyId;
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

    try {
        const [itemsRes, groupsRes] = await Promise.all([
            supabaseAdmin
                .from('concierge_items')
                .select('*, group:concierge_groups(*)')
                .eq('propertyId', propertyId)
                .eq('deleted', false)
                .order('order', { ascending: true }),
            supabaseAdmin
                .from('concierge_groups')
                .select('*')
                .eq('propertyId', propertyId)
                .eq('active', true)
                .order('order', { ascending: true }),
        ]);

        return NextResponse.json({
            items: itemsRes.data ?? [],
            groups: groupsRes.data ?? [],
        });
    } catch (error) {
        console.error('[concierge/catalog]', error);
        return NextResponse.json(null, { status: 500 });
    }
}
