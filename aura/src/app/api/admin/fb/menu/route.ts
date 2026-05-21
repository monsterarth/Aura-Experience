// src/app/api/admin/fb/menu/route.ts
// Retorna categorias e itens de cardápio para o modal de pedido do salão.
// fb_categories e fb_menu_items usam snake_case — mapeados aqui para camelCase.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
    const auth = await requireAuth();
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json(null, { status: 500 });

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

    try {
        const [categoriesRes, itemsRes] = await Promise.all([
            supabaseAdmin
                .from('fb_categories')
                .select('*')
                .eq('property_id', propertyId)
                .in('type', ['breakfast', 'both'])
                .eq('ala_carte', true),
            supabaseAdmin
                .from('fb_menu_items')
                .select('*')
                .eq('property_id', propertyId)
                .eq('active', true),
        ]);

        const categories = (categoriesRes.data || []).map((d: any) => ({
            id: d.id,
            propertyId: d.property_id,
            name: d.name,
            name_en: d.name_en,
            name_es: d.name_es,
            type: d.type,
            selectionTarget: d.selection_target,
            maxPerGuest: d.max_per_guest,
            alaCarte: d.ala_carte ?? false,
            order: d.order,
            imageUrl: d.image_url,
            createdAt: d.created_at,
        }));

        const items = (itemsRes.data || []).map((d: any) => ({
            id: d.id,
            propertyId: d.property_id,
            categoryId: d.category_id,
            name: d.name,
            name_en: d.name_en,
            name_es: d.name_es,
            description: d.description,
            price: d.price,
            ingredients: d.ingredients || [],
            flavors: d.flavors,
            active: d.active,
            order: d.order,
            imageUrl: d.image_url,
            createdAt: d.created_at,
        }));

        return NextResponse.json({ categories, items });
    } catch (error) {
        console.error('[fb/menu]', error);
        return NextResponse.json(null, { status: 500 });
    }
}
