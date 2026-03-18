// src/app/api/guest/structure-slots/route.ts
// Leitura server-side das reservas existentes para calcular slots disponíveis.
// Usa supabaseAdmin para não inicializar sessão de auth no browser do hóspede.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const structureId = searchParams.get("structureId");
    const date = searchParams.get("date");

    if (!propertyId || !structureId || !date) {
        return NextResponse.json({ error: "Missing required params" }, { status: 400 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
        .from("structure_bookings")
        .select("*")
        .eq("propertyId", propertyId)
        .eq("structureId", structureId)
        .eq("date", date);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
}
