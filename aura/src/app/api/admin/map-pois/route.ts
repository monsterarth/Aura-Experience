// src/app/api/admin/map-pois/route.ts
// CRUD de Pontos de Interesse (MapPoi) — marcadores leves no mapa do resort.
// Usados para portões, locais de foto, trilhas, estacionamentos e lugares externos.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { MapPoi } from "@/types/aura";

// GET /api/admin/map-pois?propertyId=xxx
export async function GET(request: NextRequest) {
    const auth = await requireAuth(["super_admin", "admin", "manager", "reception"]);
    if (isAuthError(auth)) return auth;

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId") ?? auth.staff.propertyId;

    if (!supabaseAdmin) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const { data, error } = await supabaseAdmin
        .from("map_pois")
        .select("*")
        .eq("propertyId", propertyId)
        .order("createdAt", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pois: data ?? [] });
}

// POST /api/admin/map-pois — cria novo POI
export async function POST(request: NextRequest) {
    const auth = await requireAuth(["super_admin", "admin", "manager"]);
    if (isAuthError(auth)) return auth;

    if (!supabaseAdmin) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const body = await request.json();
    const { propertyId = auth.staff.propertyId, name, category = "other", ...rest } = body;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const id = crypto.randomUUID();
    const { error } = await supabaseAdmin
        .from("map_pois")
        .insert({ id, propertyId, name, category, showOnMap: true, ...rest });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id }, { status: 201 });
}

// PATCH /api/admin/map-pois — atualiza POI (body deve conter id)
export async function PATCH(request: NextRequest) {
    const auth = await requireAuth(["super_admin", "admin", "manager"]);
    if (isAuthError(auth)) return auth;

    if (!supabaseAdmin) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabaseAdmin
        .from("map_pois")
        .update(fields)
        .eq("id", id)
        .eq("propertyId", auth.staff.propertyId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

// DELETE /api/admin/map-pois?id=xxx
export async function DELETE(request: NextRequest) {
    const auth = await requireAuth(["super_admin", "admin", "manager"]);
    if (isAuthError(auth)) return auth;

    if (!supabaseAdmin) return NextResponse.json({ error: "Server error" }, { status: 500 });

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabaseAdmin
        .from("map_pois")
        .delete()
        .eq("id", id)
        .eq("propertyId", auth.staff.propertyId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
