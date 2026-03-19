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

    const { data, error } = await supabaseAdmin
        .from("structure_bookings")
        .select(`*, structures(name, units(id, name))`)
        .eq("stayId", stayId)
        .eq("propertyId", propertyId)
        .eq("date", date)
        .in("status", ["pending", "approved"])
        .order("startTime", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten structure/unit names into the booking object so the guest portal
    // can display them even for reception-only (hidden) structures.
    const bookings = (data || []).map((b: any) => {
        const structureName: string | null = b.structures?.name ?? null;
        const unitName: string | null =
            b.unitId && b.structures?.units
                ? (b.structures.units.find((u: any) => u.id === b.unitId)?.name ?? null)
                : null;
        const { structures: _s, ...rest } = b;
        return { ...rest, structureName, unitName };
    });

    return NextResponse.json(bookings);
}
