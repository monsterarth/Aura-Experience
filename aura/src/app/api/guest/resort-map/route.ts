// src/app/api/guest/resort-map/route.ts
// Leitura server-side do Mapa Interativo do Resort para o portal do hóspede.
// Retorna a configuração do mapa (imagem ilustrada, GCPs, satélite) + as áreas
// (structures com showOnMap) enriquecidas com média de avaliações e ocupação ao vivo.
// Usa supabaseAdmin para não abrir sessão de auth no browser do hóspede.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { Structure, StructureBooking, StructureReview } from "@/types/aura";

function timeToMinutes(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const date = searchParams.get("date"); // YYYY-MM-DD (hoje, do cliente)
    const nowMinutesParam = searchParams.get("nowMinutes"); // minutos do dia, hora local do hóspede

    if (!propertyId) {
        return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Config do mapa (no JSON settings da propriedade)
    const { data: property, error: propErr } = await supabaseAdmin
        .from("properties")
        .select("settings")
        .eq("id", propertyId)
        .single();

    if (propErr) {
        return NextResponse.json({ error: propErr.message }, { status: 500 });
    }
    const mapConfig = property?.settings?.mapConfig ?? {};

    // Estruturas exibidas no mapa
    const { data: structuresRaw, error: structErr } = await supabaseAdmin
        .from("structures")
        .select("*")
        .eq("propertyId", propertyId)
        .eq("showOnMap", true);

    if (structErr) {
        return NextResponse.json({ error: structErr.message }, { status: 500 });
    }
    const structures = (structuresRaw || []) as Structure[];
    const structureIds = structures.map(s => s.id);

    // Agregados de avaliações (média + contagem) por estrutura
    const ratingMap = new Map<string, { sum: number; count: number }>();
    if (structureIds.length > 0) {
        const { data: reviews } = await supabaseAdmin
            .from("structure_reviews")
            .select("structureId, rating")
            .in("structureId", structureIds);
        for (const r of (reviews || []) as Pick<StructureReview, "structureId" | "rating">[]) {
            const agg = ratingMap.get(r.structureId) ?? { sum: 0, count: 0 };
            agg.sum += r.rating;
            agg.count += 1;
            ratingMap.set(r.structureId, agg);
        }
    }

    // Ocupação ao vivo: reservas aprovadas de hoje que contêm o horário atual
    const occupancyMap = new Map<string, number>();
    if (structureIds.length > 0 && date) {
        const nowMinutes = nowMinutesParam != null
            ? parseInt(nowMinutesParam)
            : (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();

        const { data: bookings } = await supabaseAdmin
            .from("structure_bookings")
            .select("structureId, startTime, endTime, status")
            .eq("propertyId", propertyId)
            .eq("date", date)
            .eq("status", "approved");

        for (const b of (bookings || []) as Pick<StructureBooking, "structureId" | "startTime" | "endTime" | "status">[]) {
            if (timeToMinutes(b.startTime) <= nowMinutes && nowMinutes < timeToMinutes(b.endTime)) {
                occupancyMap.set(b.structureId, (occupancyMap.get(b.structureId) ?? 0) + 1);
            }
        }
    }

    const areas = structures.map(s => {
        const agg = ratingMap.get(s.id);
        return {
            ...s,
            rating: agg ? Math.round((agg.sum / agg.count) * 10) / 10 : 0,
            reviewCount: agg?.count ?? 0,
            currentOccupancy: occupancyMap.get(s.id) ?? 0,
        };
    });

    return NextResponse.json({ mapConfig, areas });
}
