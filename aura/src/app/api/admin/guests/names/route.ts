// src/app/api/admin/guests/names/route.ts
// Bulk guest name lookup by IDs — used by reservation map to avoid RLS issues
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError, scopedPropertyId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
    const auth = await requireAuth(['super_admin', 'admin', 'manager', 'reception', 'governance']);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json({}, { status: 500 });

    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

    if (ids.length === 0) return NextResponse.json({});

    // Escopo de tenant: cargos não-cross-tenant só resolvem nomes da PRÓPRIA
    // propriedade (o mapa mostra só a dela). Antes não havia filtro NENHUM — um id
    // de hóspede de outra pousada resolvia o nome. super_admin (propertyId null)
    // segue resolvendo entre propriedades.
    const scoped = scopedPropertyId(auth, body.propertyId);
    let query = supabaseAdmin.from('guests').select('id, fullName').in('id', ids);
    if (scoped) query = query.eq('propertyId', scoped);
    const { data } = await query;

    const map: Record<string, string> = {};
    for (const g of data ?? []) map[g.id] = g.fullName;
    return NextResponse.json(map);
}
