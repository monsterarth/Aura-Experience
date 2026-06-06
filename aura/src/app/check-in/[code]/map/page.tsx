"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Map as MapIcon, Image as ImageIcon, MapPinned, Navigation } from "lucide-react";
import { toast } from "sonner";
import { StayService } from "@/services/stay-service";
import { PropertyService } from "@/services/property-service";
import { Stay, Property } from "@/types/aura";
import { MapArea, MapCabin, MapLang } from "./types";
import { IllustratedMap } from "./IllustratedMap";
import { AreaCard } from "./AreaCard";
import { CategoryFilter } from "./components/CategoryFilter";
import { GpsPermissionHelp } from "./components/GpsPermissionHelp";
import { useGPS } from "./hooks/useGPS";
import { gpsToFractionMagnetic } from "./utils/geoTransform";

// Leaflet só no cliente (usa window) → import dinâmico sem SSR.
const SatelliteMap = dynamic(() => import("./SatelliteMap").then(m => m.SatelliteMap), {
    ssr: false,
    loading: () => <div className="h-[60vh] flex items-center justify-center bg-secondary rounded-3xl"><Loader2 className="animate-spin text-primary" /></div>,
});

// --- Theme helper (mesmo padrão das outras páginas do portal) ---
function hexToHSL(hex: string): string {
    if (!hex) return "0 0% 0%";
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) hex = hex.split("").map(x => x + x).join("");
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
function getThemeStyles(p?: Property | null): React.CSSProperties {
    const c = p?.theme?.colors;
    if (!c) return {};
    return {
        "--primary": hexToHSL(c.primary), "--primary-foreground": hexToHSL(c.onPrimary),
        "--secondary": hexToHSL(c.secondary), "--secondary-foreground": hexToHSL(c.onSecondary),
        "--background": hexToHSL(c.background), "--card": hexToHSL(c.surface),
        "--card-foreground": hexToHSL(c.textMain), "--foreground": hexToHSL(c.textMain),
        "--muted": hexToHSL(c.secondary), "--muted-foreground": hexToHSL(c.textMuted),
        "--accent": hexToHSL(c.accent), "--border": hexToHSL(c.accent),
        "--radius": p?.theme?.shape?.radius || "0.5rem",
    } as React.CSSProperties;
}

const TXT: Record<MapLang, Record<string, string>> = {
    pt: { title: "Mapa do Resort", illustrated: "Ilustrado", realMap: "Mapa", street: "Ruas", satellite: "Satélite", empty: "O mapa ainda não foi configurado.", locate: "Me localizar", locating: "Localizando…", youAreHere: "Você está aqui", noImage: "Imagem do mapa indisponível.", gpsDenied: "Permissão de localização negada. Ative nas configurações do navegador.", showCabins: "Ver outras cabanas", hideCabins: "Ocultar outras cabanas" },
    en: { title: "Resort Map", illustrated: "Illustrated", realMap: "Map", street: "Streets", satellite: "Satellite", empty: "The map hasn't been set up yet.", locate: "Locate me", locating: "Locating…", youAreHere: "You are here", noImage: "Map image unavailable.", gpsDenied: "Location permission denied. Enable it in your browser settings.", showCabins: "Show other cabins", hideCabins: "Hide other cabins" },
    es: { title: "Mapa del Resort", illustrated: "Ilustrado", realMap: "Mapa", street: "Calles", satellite: "Satélite", empty: "El mapa aún no está configurado.", locate: "Ubicarme", locating: "Ubicando…", youAreHere: "Estás aquí", noImage: "Imagen del mapa no disponible.", gpsDenied: "Permiso de ubicación denegado. Actívalo en la configuración del navegador.", showCabins: "Ver otras cabañas", hideCabins: "Ocultar otras cabañas" },
};

function ResortMapView() {
    const { code } = useParams();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [stay, setStay] = useState<Stay | null>(null);
    const [property, setProperty] = useState<Property | null>(null);
    const [mapConfig, setMapConfig] = useState<NonNullable<Property["settings"]["mapConfig"]>>({});
    const [areas,   setAreas]   = useState<MapArea[]>([]);
    const [cabins,  setCabins]  = useState<MapCabin[]>([]);
    const [lang, setLang] = useState<MapLang>("pt");

    const [mode, setMode] = useState<"illustrated" | "satellite">("illustrated");
    const [category, setCategory] = useState<string | null>(null);
    const [selectedArea, setSelectedArea] = useState<MapArea | null>(null);
    const [showOtherCabins, setShowOtherCabins] = useState(false);

    const { pos, status: gpsStatus, request: requestGPS } = useGPS();
    const [showGpsHelp, setShowGpsHelp] = useState(false);
    const t = TXT[lang];

    // Abre o modal de instruções ao tocar em "Me localizar" quando já negado
    const handleRequestGPS = () => {
        if (gpsStatus === "denied") { setShowGpsHelp(true); return; }
        requestGPS();
    };

    // Carrega estadia + propriedade + idioma
    useEffect(() => {
        async function init() {
            try {
                if (!code) return;
                const stays = await StayService.getStaysByAccessCode(code as string);
                if (!stays || stays.length === 0) { setLoading(false); return; }
                const s = stays[0] as Stay;
                setStay(s);

                try {
                    const sd = await StayService.getStayWithGuestAndCabin(s.propertyId, s.id);
                    const pl = sd?.guest?.preferredLanguage;
                    if (pl) setLang(pl as MapLang);
                    else {
                        const bl = navigator.language.slice(0, 2);
                        if (bl === "es") setLang("es"); else if (bl === "en") setLang("en");
                    }
                } catch { /* ignore */ }

                const prop = await PropertyService.getPropertyById(s.propertyId);
                if (prop) setProperty(prop as Property);
            } catch (e) {
                console.error(e);
                toast.error("Erro ao carregar o mapa.");
            } finally {
                setLoading(false);
            }
        }
        init();
    }, [code]);

    // Busca áreas + config (com polling de ocupação a cada 30s)
    const fetchMap = async (propertyId: string, currentStayId?: string) => {
        const today = new Date().toISOString().split("T")[0];
        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        try {
            const sid = currentStayId ?? stay?.id ?? "";
            const res = await fetch(
                `/api/guest/resort-map?propertyId=${propertyId}&stayId=${sid}&date=${today}&nowMinutes=${nowMinutes}`
            );
            const data = await res.json();
            setMapConfig(data.mapConfig ?? {});
            setAreas(Array.isArray(data.areas) ? data.areas : []);
            setCabins(Array.isArray(data.cabins) ? data.cabins : []);
            setSelectedArea(prev => prev ? (data.areas?.find((a: MapArea) => a.id === prev.id) ?? prev) : null);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (!property) return;
        fetchMap(property.id, stay?.id);
        const iv = setInterval(() => fetchMap(property.id, stay?.id), 30000);
        return () => clearInterval(iv);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [property?.id, stay?.id]);

    // Default de modo: ilustrado quando configurado; senão o mapa real
    useEffect(() => {
        if (!mapConfig.illustratedImageUrl) setMode("satellite");
    }, [mapConfig.illustratedImageUrl]);

    const categories = useMemo(
        () => Array.from(new Set(areas.map(a => a.category).filter(Boolean))),
        [areas]
    );
    const visibleAreas = useMemo(
        () => category ? areas.filter(a => a.category === category) : areas,
        [areas, category]
    );

    // GCPs derivados automaticamente dos pins das estruturas que têm
    // lat/lng preenchidos + posição pixel. São equivalentes a GCPs manuais
    // e evitam a necessidade de configurar calibração separada no admin.
    // Âncoras para o "magnetismo": todos os pontos com pixel + lat/lng (estruturas,
    // cabanas e GCPs manuais). Quanto mais âncoras, melhor a cobertura.
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

    // Posição do hóspede no mapa ilustrado via magnetismo (IDW pelos pins próximos)
    const userFraction = useMemo(() => {
        if (!pos) return null;
        if (pos.accuracy > 200) return null;
        const f = gpsToFractionMagnetic(pos.lat, pos.lng, anchors);
        if (!f || f.x < 0 || f.x > 1 || f.y < 0 || f.y > 1) return null;
        return f;
    }, [pos, anchors]);

    if (loading || !property) {
        return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>;
    }

    const themeStyles = getThemeStyles(property);
    const hasIllustrated = !!mapConfig.illustratedImageUrl;
    // Mapa real (Leaflet + tiles grátis) não precisa de config — disponível sempre
    // que houver onde centralizar (pins, centro definido ou satélite ligado).
    const hasRealMap = anchors.length > 0 || !!mapConfig.center || !!mapConfig.satelliteEnabled;
    const nothingConfigured = !hasIllustrated && !hasRealMap;

    return (
        <div className="min-h-[100dvh] bg-background text-foreground flex flex-col" style={themeStyles}>
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border p-4 flex items-center gap-3">
                <button onClick={() => router.push(`/check-in/${code}`)} className="p-2 hover:bg-secondary rounded-full transition-colors">
                    <ArrowLeft size={22} />
                </button>
                <h1 className="text-lg font-black uppercase tracking-tighter flex-1">{t.title}</h1>
                {/* Toggle de modo — só faz sentido quando há ilustrado E mapa real */}
                {hasIllustrated && hasRealMap && (
                    <div className="flex bg-secondary rounded-full p-0.5">
                        <button onClick={() => setMode("illustrated")} className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${mode === "illustrated" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}>
                            <ImageIcon size={13} /> {t.illustrated}
                        </button>
                        <button onClick={() => setMode("satellite")} className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${mode === "satellite" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}>
                            <MapIcon size={13} /> {t.realMap}
                        </button>
                    </div>
                )}
            </header>

            <main className="flex-1 p-4 space-y-4 w-full max-w-2xl mx-auto">
                {nothingConfigured ? (
                    <div className="flex flex-col items-center justify-center text-center py-24">
                        <MapPinned size={48} className="text-muted-foreground opacity-40 mb-4" />
                        <p className="text-muted-foreground">{t.empty}</p>
                    </div>
                ) : (
                    <>
                        {/* Filtro de categorias + toggle de outras cabanas */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {categories.length > 1 && (
                                <CategoryFilter categories={categories} selected={category} onSelect={setCategory} lang={lang} />
                            )}
                            {cabins.some(c => !c.isOwnCabin) && (
                                <button
                                    onClick={() => setShowOtherCabins(v => !v)}
                                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border flex items-center gap-1.5 ${showOtherCabins ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40" : "bg-card text-muted-foreground border-border"}`}
                                >
                                    🏠 {showOtherCabins ? t.hideCabins : t.showCabins}
                                </button>
                            )}
                        </div>

                        {/* Mapa */}
                        {(mode === "satellite" && hasRealMap) || !hasIllustrated ? (
                            <SatelliteMap
                                areas={visibleAreas}
                                cabins={showOtherCabins ? cabins : cabins.filter(c => c.isOwnCabin)}
                                center={mapConfig.center}
                                defaultZoom={mapConfig.defaultZoom}
                                userPos={pos}
                                youAreHereLabel={t.youAreHere}
                                onAreaClick={setSelectedArea}
                                gpsStatus={gpsStatus}
                                onRequestGPS={handleRequestGPS}
                                locateLabel={t.locate}
                                locatingLabel={t.locating}
                                gpsDeniedLabel={t.gpsDenied}
                                initialLayer="street"
                                streetLabel={t.street}
                                satelliteLabel={t.satellite}
                            />
                        ) : hasIllustrated ? (
                            <IllustratedMap
                                imageUrl={mapConfig.illustratedImageUrl!}
                                areas={visibleAreas}
                                cabins={showOtherCabins ? cabins : cabins.filter(c => c.isOwnCabin)}
                                userFraction={userFraction}
                                youAreHereLabel={t.youAreHere}
                                onAreaClick={setSelectedArea}
                                gpsStatus={gpsStatus}
                                onRequestGPS={handleRequestGPS}
                                locateLabel={t.locate}
                                locatingLabel={t.locating}
                                gpsDeniedLabel={t.gpsDenied}
                            />
                        ) : (
                            <div className="h-[50vh] flex items-center justify-center text-muted-foreground text-sm">{t.noImage}</div>
                        )}

                        {/* Lista rápida de áreas (atalho) */}
                        <div className="grid grid-cols-2 gap-3">
                            {visibleAreas.map(a => (
                                <button
                                    key={a.id}
                                    onClick={() => setSelectedArea(a)}
                                    className="bg-card border border-border rounded-2xl p-3 text-left hover:border-primary/50 transition-all flex items-center gap-2"
                                >
                                    <span className="text-xl shrink-0">{a.pinIcon || "📍"}</span>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm truncate">{a.name}</p>
                                        {a.reviewCount > 0 && (
                                            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                <Navigation size={10} /> {a.rating} ★ · {a.currentOccupancy}/{a.capacity}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </main>

            {/* Modal de ajuda GPS */}
            {showGpsHelp && (
                <GpsPermissionHelp lang={lang} onClose={() => setShowGpsHelp(false)} />
            )}

            {/* Bottom sheet da área */}
            {selectedArea && stay && (
                <AreaCard
                    area={selectedArea}
                    stay={stay}
                    property={property}
                    lang={lang}
                    onClose={() => setSelectedArea(null)}
                    onBooked={() => property && fetchMap(property.id)}
                    onReviewed={() => property && fetchMap(property.id)}
                />
            )}
        </div>
    );
}

export default function GuestResortMapPage() {
    return (
        <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center bg-background"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>}>
            <ResortMapView />
        </Suspense>
    );
}
