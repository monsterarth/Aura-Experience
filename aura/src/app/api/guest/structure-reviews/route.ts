// src/app/api/guest/structure-reviews/route.ts
// Avaliações por área (estrutura) feitas pelo hóspede no Mapa do Resort.
// GET ?structureId= → lista as avaliações de uma área.
// POST → cria uma avaliação (valida posse via stayId+accessCode).
// Usa supabaseAdmin (hóspede não autenticado), validando dados server-side.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const structureId = searchParams.get("structureId");

    if (!structureId) {
        return NextResponse.json({ error: "Missing structureId" }, { status: 400 });
    }
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
        .from("structure_reviews")
        .select("*")
        .eq("structureId", structureId)
        .order("createdAt", { ascending: false })
        .limit(50);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const { propertyId, structureId, stayId, accessCode, guestId, guestName, rating, comment } = body;

    if (!propertyId || !structureId || !stayId || !accessCode || !rating) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (rating < 1 || rating > 5) {
        return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
    }

    // Valida posse: o stay precisa existir com esse accessCode e propriedade.
    const { data: stay } = await supabaseAdmin
        .from("stays")
        .select("id")
        .eq("id", stayId)
        .eq("accessCode", accessCode)
        .eq("propertyId", propertyId)
        .single();

    if (!stay) {
        return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
        .from("structure_reviews")
        .insert({
            id: crypto.randomUUID(),
            propertyId,
            structureId,
            stayId,
            guestId: guestId ?? null,
            guestName: guestName ?? null,
            rating,
            comment: comment ?? null,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
}
