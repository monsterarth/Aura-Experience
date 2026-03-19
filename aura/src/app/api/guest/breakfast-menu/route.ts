// src/app/api/guest/breakfast-menu/route.ts
// API route para leitura do menu de café da manhã pelo portal do hóspede.
// Usa supabaseAdmin para contornar RLS — o hóspede é anônimo (sem sessão).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Mapeadores snake_case → camelCase (mesmo padrão do fb-service)
function mapCategory(d: any) {
    return {
        id: d.id, propertyId: d.property_id, name: d.name, name_en: d.name_en || undefined,
        name_es: d.name_es || undefined, type: d.type, selectionTarget: d.selection_target,
        maxPerGuest: d.max_per_guest, alaCarte: d.ala_carte ?? false, order: d.order,
        imageUrl: d.image_url, createdAt: d.created_at,
    };
}

function mapMenuItem(d: any) {
    return {
        id: d.id, propertyId: d.property_id, categoryId: d.category_id, name: d.name,
        name_en: d.name_en || undefined, name_es: d.name_es || undefined,
        description: d.description, description_en: d.description_en || undefined,
        description_es: d.description_es || undefined, price: d.price,
        ingredients: d.ingredients, flavors: d.flavors, active: d.active,
        order: d.order, imageUrl: d.image_url, createdAt: d.created_at,
    };
}

/**
 * GET /api/guest/breakfast-menu?propertyId=...
 * Retorna categorias e itens do menu de café da manhã (camelCase).
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const propertyId = searchParams.get("propertyId");

        if (!propertyId) {
            return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        const [categoriesResult, menuItemsResult] = await Promise.all([
            supabaseAdmin
                .from('fb_categories')
                .select('*')
                .eq('property_id', propertyId)
                .order('order', { ascending: true })
                .order('name'),
            supabaseAdmin
                .from('fb_menu_items')
                .select('*')
                .eq('property_id', propertyId)
                .order('order', { ascending: true })
                .order('name'),
        ]);

        if (categoriesResult.error) {
            console.error("[guest/breakfast-menu] Categories error:", categoriesResult.error);
            return NextResponse.json({ error: categoriesResult.error.message }, { status: 500 });
        }

        if (menuItemsResult.error) {
            console.error("[guest/breakfast-menu] Menu items error:", menuItemsResult.error);
            return NextResponse.json({ error: menuItemsResult.error.message }, { status: 500 });
        }

        return NextResponse.json({
            categories: (categoriesResult.data || []).map(mapCategory),
            menuItems: (menuItemsResult.data || []).map(mapMenuItem),
        });
    } catch (err) {
        console.error("[guest/breakfast-menu GET] Unexpected error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
