"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Property } from "@/types/aura";
import { MapArea, MapCabin, MapPoi } from "../map/types";
import { useGPS } from "../map/hooks/useGPS";

/* ============================================================
   Portal do Hóspede — dados do Mapa Interativo do Resort.
   Encapsula o fetch de /api/guest/resort-map (áreas showOnMap +
   cabanas + POIs + config) com polling de 30s de ocupação ao vivo,
   os derivados (categorias, âncoras, cabana do hóspede) e o GPS.
   Migrado de check-in/[code]/map/page.tsx para o Portal 2.0.
   ============================================================ */

type MapConfig = NonNullable<Property["settings"]["mapConfig"]>;

export interface ResortMapData {
    mapConfig: MapConfig;
    areas: MapArea[];
    cabins: MapCabin[];
    pois: MapPoi[];
    mapLoaded: boolean;
    categories: string[];
    ownCabin: MapCabin | null;
    hasIllustrated: boolean;
    hasRealMap: boolean;
    nothingConfigured: boolean;
    refetch: () => void;
    gps: ReturnType<typeof useGPS>;
}

export function useResortMap(propertyId?: string, stayId?: string): ResortMapData {
    const [mapConfig, setMapConfig] = useState<MapConfig>({});
    const [areas, setAreas] = useState<MapArea[]>([]);
    const [cabins, setCabins] = useState<MapCabin[]>([]);
    const [pois, setPois] = useState<MapPoi[]>([]);
    const [mapLoaded, setMapLoaded] = useState(false);
    const gps = useGPS();

    const fetchMap = useCallback(async () => {
        if (!propertyId) return;
        const today = new Date().toISOString().split("T")[0];
        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        try {
            const res = await fetch(
                `/api/guest/resort-map?propertyId=${propertyId}&stayId=${stayId ?? ""}&date=${today}&nowMinutes=${nowMinutes}`
            );
            const data = await res.json();
            setMapConfig(data.mapConfig ?? {});
            setAreas(Array.isArray(data.areas) ? data.areas : []);
            setCabins(Array.isArray(data.cabins) ? data.cabins : []);
            setPois(Array.isArray(data.pois) ? data.pois : []);
        } catch (e) {
            console.error(e);
        } finally {
            setMapLoaded(true);
        }
    }, [propertyId, stayId]);

    useEffect(() => {
        if (!propertyId) return;
        fetchMap();
        const iv = setInterval(fetchMap, 30000);
        return () => clearInterval(iv);
    }, [propertyId, stayId, fetchMap]);

    const categories = useMemo(
        () => Array.from(new Set(areas.map(a => a.category).filter(Boolean))) as string[],
        [areas]
    );

    // Âncoras (pixel + lat/lng) usadas pelo mapa satélite/ilustrado. Quando
    // existe ao menos uma, o mapa real tem onde se ancorar.
    const anchors = useMemo(() => {
        const list: { lat: number; lng: number; px: number; py: number }[] = [];
        for (const a of areas) {
            if (a.mapPin?.pixelX != null && a.mapPin?.pixelY != null && (a.mapPin.lat !== 0 || a.mapPin.lng !== 0))
                list.push({ lat: a.mapPin.lat, lng: a.mapPin.lng, px: a.mapPin.pixelX, py: a.mapPin.pixelY });
        }
        for (const c of cabins) {
            if (c.mapPin?.pixelX != null && c.mapPin?.pixelY != null && (c.mapPin.lat !== 0 || c.mapPin.lng !== 0))
                list.push({ lat: c.mapPin.lat, lng: c.mapPin.lng, px: c.mapPin.pixelX, py: c.mapPin.pixelY });
        }
        for (const g of (mapConfig.gcps ?? [])) {
            if (g.lat !== 0 || g.lng !== 0) list.push({ lat: g.lat, lng: g.lng, px: g.px, py: g.py });
        }
        return list;
    }, [areas, cabins, mapConfig.gcps]);

    const ownCabin = useMemo(() => cabins.find(c => c.isOwnCabin) ?? null, [cabins]);
    const hasIllustrated = !!mapConfig.illustratedImageUrl;
    // Mapa real (Leaflet + tiles grátis) precisa de onde centralizar.
    const hasRealMap = anchors.length > 0 || !!mapConfig.center || !!mapConfig.satelliteEnabled;
    const nothingConfigured = !hasIllustrated && !hasRealMap;

    return {
        mapConfig, areas, cabins, pois, mapLoaded,
        categories, ownCabin, hasIllustrated, hasRealMap, nothingConfigured,
        refetch: fetchMap, gps,
    };
}
