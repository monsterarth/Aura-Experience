// src/app/api/guest/stay-bookings/route.ts
// Retorna todas as reservas de estruturas de uma estadia em um dia específico.
// Usado pela hero section do portal do hóspede para listar agendamentos ativos.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const stayId = searchParams.get("stayId");
    const propertyId = searchParams.get("propertyId");
    const date = searchParams.get("date");

    if (!stayId || !propertyId || !date) {
        return NextResponse.json({ error: "Missing required params" }, { status: 400 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data: bookingsData, error } = await supabaseAdmin
        .from("structure_bookings")
        .select("*")
        .eq("stayId", stayId)
        .eq("propertyId", propertyId)
        .eq("date", date)
        .in("status", ["pending", "approved"])
        .order("startTime", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const bookings = bookingsData || [];
    if (bookings.length === 0) return NextResponse.json([]);

    // Fetch structure names manually (avoids dependency on FK constraints)
    const structureIds = [...new Set(bookings.map((b: any) => b.structureId).filter(Boolean))];
    const { data: structuresData } = await supabaseAdmin
        .from("structures")
        .select("id, name, units")
        .in("id", structureIds);

    const structureMap = new Map((structuresData || []).map((s: any) => [s.id, s]));

    const result = bookings.map((b: any) => {
        const structure = structureMap.get(b.structureId) as any;
        const structureName: string | null = structure?.name ?? null;
        const unitName: string | null =
            b.unitId && structure?.units
                ? (structure.units.find((u: any) => u.id === b.unitId)?.name ?? null)
                : null;
        return { ...b, structureName, unitName };
    });

    return NextResponse.json(result);
}
