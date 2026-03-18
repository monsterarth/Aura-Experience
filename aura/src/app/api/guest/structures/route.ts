// src/app/api/guest/structures/route.ts
// Leitura server-side das estruturas para o portal do hóspede.
// Usa supabaseAdmin para não inicializar sessão de auth no browser do hóspede
// (evita conflito de Web Lock com a sessão autenticada do admin no mesmo browser).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");

    if (!propertyId) {
        return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
        .from("structures")
        .select("*")
        .eq("propertyId", propertyId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filtra apenas as estruturas visíveis ao hóspede
    const guestStructures = (data || []).filter(
        (s: any) => s.visibility === "guest_auto_approve" || s.visibility === "guest_request"
    );

    return NextResponse.json(guestStructures);
}
