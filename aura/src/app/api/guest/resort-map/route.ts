// src/app/api/guest/resort-map/route.ts
// Leitura server-side do Mapa Interativo do Resort para o portal do hóspede.
// Retorna a configuração do mapa (imagem ilustrada, GCPs, satélite) + as áreas
// (structures com showOnMap) enriquecidas com média de avaliações e ocupação ao vivo.
// Usa supabaseAdmin para não abrir sessão de auth no browser do hóspede.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { Structure, StructureBooking, StructureReview, MapPoi } from "@/types/aura";

// Dados mínimos de cabana expostos ao hóspede (sem dados sensíveis de outros hóspedes)
interface CabinMapData {
    id: string;
    number: string;
    name: string;
    mapPin: { lat: number; lng: number; pixelX?: number; pixelY?: number } | null;
    isOwnCabin: boolean;
}

function timeToMinutes(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const propertyId    = searchParams.get("propertyId");
    const stayId        = searchParams.get("stayId");        // para identificar cabana própria
    const date          = searchParams.get("date");
    const nowMinutesParam = searchParams.get("nowMinutes");

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
    // Avaliações de área só são expostas (média/contagem) quando a propriedade habilita o público.
    const reviewsPublic = property?.settings?.areaReviews?.public === true;

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
    if (reviewsPublic && structureIds.length > 0) {
        const { data: reviews } = await supabaseAdmin
            .from("structure_reviews")
            .select("structureId, rating")
            .eq("status", "approved")
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

    // Cabanas com pins — busca todas da propriedade (apenas campos necessários)
    const { data: cabinsRaw } = await supabaseAdmin
        .from("cabins")
        .select("id, number, name, mapPin, currentStayId")
        .eq("propertyId", propertyId);

    // Descobre qual cabana pertence ao stay atual (para destacar a do hóspede)
    let ownCabinId: string | null = null;
    if (stayId) {
        const { data: stayRow } = await supabaseAdmin
            .from("stays")
            .select("cabinId")
            .eq("id", stayId)
            .single();
        ownCabinId = stayRow?.cabinId ?? null;
    }

    const cabins: CabinMapData[] = (cabinsRaw ?? [])
        .filter((c: any) => c.mapPin != null)   // só inclui as que foram posicionadas no mapa
        .map((c: any) => ({
            id:         c.id,
            number:     c.number,
            name:       c.name,
            mapPin:     c.mapPin,
            isOwnCabin: c.id === ownCabinId,
        }));

    // Pontos de interesse (MapPoi) — marcadores leves sem fluxo de agendamento
    const { data: poisRaw } = await supabaseAdmin
        .from("map_pois")
        .select("*")
        .eq("propertyId", propertyId)
        .eq("showOnMap", true);
    const pois: MapPoi[] = (poisRaw ?? []) as MapPoi[];

    return NextResponse.json({ mapConfig, areas, cabins, pois });
}
