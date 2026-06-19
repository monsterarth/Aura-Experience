"use client";

import React from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { Loader2, ArrowLeft, Map as MapIcon, Image as ImageIcon } from "lucide-react";
import { Icon, Chip, Tag } from "./ui";
import { usePortal } from "./context";
import { EventService } from "@/services/event-service";
import type { Event } from "@/types/aura";
import { formatEventDate, isToday, eventTitle, eventPrice } from "./eventHelpers";
import { useResortMap } from "./useResortMap";
import { getThemeStyles } from "../map/utils/theme";
import { MapArea, MapLang, MapPoi } from "../map/types";
import { AreaCard } from "../map/AreaCard";
import { PoiCard } from "../map/components/PoiCard";
import { CategoryFilter } from "../map/components/CategoryFilter";
import { AreaListSection } from "../map/components/AreaListSection";
import { StayHeroCard } from "../map/components/StayHeroCard";
import { GpsPermissionHelp } from "../map/components/GpsPermissionHelp";

/* ============================================================
   Portal do Hóspede — TELA EXPLORAR
   Mapa interativo real (migrado de /map) + diretório de Áreas
   (structures showOnMap, com agendamento/avaliação no sheet) e POIs.
   Sub-aba Eventos (lista real + sheet de detalhe via SheetHost).
   ============================================================ */

// Leaflet/ilustrado só no cliente (usam window) → import dinâmico sem SSR.
const SatelliteMap = dynamic(() => import("../map/SatelliteMap").then(m => m.SatelliteMap), {
    ssr: false,
    loading: () => <div className="h-full flex items-center justify-center bg-secondary"><Loader2 className="animate-spin text-primary" /></div>,
});
const IllustratedMap = dynamic(() => import("../map/IllustratedMap").then(m => m.IllustratedMap), {
    ssr: false,
    loading: () => <div className="h-full flex items-center justify-center bg-secondary"><Loader2 className="animate-spin text-primary" /></div>,
});

// Rótulos das chips/listas no estilo do portal (inline styles).
const EXP = {
    pt: { areas: "Áreas", eventos: "Eventos", today: "Hoje", noEvents: "Nenhum evento por enquanto", noEventsSub: "Novidades chegam em breve." },
    en: { areas: "Areas", eventos: "Events", today: "Today", noEvents: "No events right now", noEventsSub: "New events coming soon." },
    es: { areas: "Áreas", eventos: "Eventos", today: "Hoy", noEvents: "Sin eventos por ahora", noEventsSub: "Novedades próximamente." },
};

// Rótulos consumidos pelos componentes do mapa (Tailwind, tema shadcn).
const MAP_TXT: Record<MapLang, Record<string, string>> = {
    pt: { illustrated: "Ilustrado", realMap: "Mapa", street: "Ruas", satellite: "Satélite", locate: "Me localizar", locating: "Localizando…", youAreHere: "Você está aqui", noImage: "Imagem do mapa indisponível.", gpsDenied: "Permissão de localização negada. Ative nas configurações do navegador.", showCabins: "Ver outras cabanas", hideCabins: "Ocultar outras cabanas", tapToOpen: "Toque para abrir o mapa", expand: "Ampliar", yourStay: "Sua estadia", yourCabin: "Sua Cabana", howToGet: "Como chegar", openNow: "Aberto agora", closed: "Fechado", h24: "24h", others: "Outros", noAreas: "Nenhum local nesta categoria.", bookable: "Disponível para agendar", reception: "Agende na recepção", awaitingRelease: "Aguardando liberação" },
    en: { illustrated: "Illustrated", realMap: "Map", street: "Streets", satellite: "Satellite", locate: "Locate me", locating: "Locating…", youAreHere: "You are here", noImage: "Map image unavailable.", gpsDenied: "Location permission denied. Enable it in your browser settings.", showCabins: "Show other cabins", hideCabins: "Hide other cabins", tapToOpen: "Tap to open the map", expand: "Expand", yourStay: "Your stay", yourCabin: "Your Cabin", howToGet: "Get directions", openNow: "Open now", closed: "Closed", h24: "24h", others: "Others", noAreas: "No places in this category.", bookable: "Available to book", reception: "Book at reception", awaitingRelease: "Awaiting release" },
    es: { illustrated: "Ilustrado", realMap: "Mapa", street: "Calles", satellite: "Satélite", locate: "Ubicarme", locating: "Ubicando…", youAreHere: "Estás aquí", noImage: "Imagen del mapa no disponible.", gpsDenied: "Permiso de ubicación denegado. Actívalo en la configuración del navegador.", showCabins: "Ver otras cabañas", hideCabins: "Ocultar otras cabañas", tapToOpen: "Toca para abrir el mapa", expand: "Ampliar", yourStay: "Tu estadía", yourCabin: "Tu Cabaña", howToGet: "Cómo llegar", openNow: "Abierto ahora", closed: "Cerrado", h24: "24h", others: "Otros", noAreas: "Ningún lugar en esta categoría.", bookable: "Disponible para reservar", reception: "Reserva en recepción", awaitingRelease: "Esperando liberación" },
};

function EventRow({ ev, lang, todayLabel, onOpen }: { ev: Event; lang: MapLang; todayLabel: string; onOpen: () => void }) {
    const tone = ev.type === "external" ? "plum" : "brand";
    const when = `${formatEventDate(ev.startDate, ev.endDate, lang)}${ev.startTime ? ` · ${ev.startTime}` : ""}`;
    return (
        <button onClick={onOpen} style={{ width: "100%", border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 18, padding: 13, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 13, boxShadow: "var(--sh-xs)" }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: `var(--${tone === "plum" ? "plum" : "brand"}-soft, #E8DCE6)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                {ev.imageUrl ? <img src={ev.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon n="ticket" s={22} c={tone === "plum" ? "var(--plum)" : "var(--brand)"} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: tone === "plum" ? "var(--plum)" : "var(--brand)", letterSpacing: ".04em", textTransform: "uppercase" }}>{when}</span>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{eventTitle(ev, lang)}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                    {ev.location ? <><Icon n="pin" s={12} c="var(--muted)" />{ev.location}</> : eventPrice(ev, lang)}
                </div>
            </div>
            {isToday(ev.startDate) ? <Tag tone="green">{todayLabel}</Tag> : <Icon n="chevright" s={18} c="var(--faint)" />}
        </button>
    );
}

export function ExploreScreen() {
    const { stay, property, lang, t, openSheet, mapFocus, setMapFocus } = usePortal();
    const L = EXP[lang] || EXP.pt;
    const M = MAP_TXT[lang] || MAP_TXT.pt;
    const mlang = lang as MapLang;

    const [sub, setSub] = React.useState<"areas" | "eventos">("areas");

    // ---- Eventos (real) ----
    const [events, setEvents] = React.useState<Event[]>([]);
    const [loadingEvents, setLoadingEvents] = React.useState(true);

    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const today = new Date().toISOString().split("T")[0];
                const evs = await EventService.getPublishedEvents(stay.propertyId, today);
                if (alive) setEvents(evs);
            } catch { /* silently ignore */ }
            finally { if (alive) setLoadingEvents(false); }
        })();
        return () => { alive = false; };
    }, [stay.propertyId]);

    // ---- Mapa interativo (migrado de /map) ----
    const {
        mapConfig, areas, cabins, pois, mapLoaded, categories, ownCabin,
        hasIllustrated, hasRealMap, nothingConfigured, anchors, refetch, gps,
    } = useResortMap(stay.propertyId, stay.id);

    const [mode, setMode] = React.useState<"illustrated" | "satellite">("illustrated");
    const [category, setCategory] = React.useState<string | null>(null);
    const [selectedArea, setSelectedArea] = React.useState<MapArea | null>(null);
    const [selectedPoi, setSelectedPoi] = React.useState<MapPoi | null>(null);
    const [showOtherCabins, setShowOtherCabins] = React.useState(false);
    const [mapOpen, setMapOpen] = React.useState(false);
    const [routeTo, setRouteTo] = React.useState<{ lat: number; lng: number } | null>(null);
    const [showGpsHelp, setShowGpsHelp] = React.useState(false);

    // Default de modo: ilustrado quando configurado; senão o mapa real.
    React.useEffect(() => { if (!mapConfig.illustratedImageUrl) setMode("satellite"); }, [mapConfig.illustratedImageUrl]);

    // Re-sincroniza a área aberta após cada refetch (ocupação ao vivo).
    React.useEffect(() => {
        setSelectedArea(prev => prev ? (areas.find(a => a.id === prev.id) ?? prev) : null);
    }, [areas]);

    const visibleAreas = React.useMemo(
        () => category ? areas.filter(a => a.category === category) : areas,
        [areas, category]
    );
    const showSatellite = (mode === "satellite" && hasRealMap) || !hasIllustrated;
    const cabinsForMap = showOtherCabins ? cabins : cabins.filter(c => c.isOwnCabin);
    const dirCategories = category ? [category] : categories;
    const noCatAreas = visibleAreas.filter(a => !a.category);

    const handleRequestGPS = () => {
        if (gps.status === "denied") { setShowGpsHelp(true); return; }
        gps.request();
    };

    // Abre o mapa em tela cheia; "Como chegar" força satélite + rota até a cabana.
    const openFullMap = (withGps = false) => {
        if (withGps && hasRealMap) {
            setMode("satellite");
            const cab = ownCabin?.mapPin;
            setRouteTo(cab && (cab.lat !== 0 || cab.lng !== 0) ? { lat: cab.lat, lng: cab.lng } : null);
        } else {
            setRouteTo(null);
        }
        setMapOpen(true);
        if (withGps) handleRequestGPS();
    };
    const closeFullMap = () => { setMapOpen(false); setRouteTo(null); };

    // "Como chegar ao café" — alvo de foco vindo de outra tela (aba Pedidos).
    React.useEffect(() => {
        if (!mapFocus || !mapLoaded) return;
        if (hasRealMap) { setMode("satellite"); setRouteTo({ lat: mapFocus.lat, lng: mapFocus.lng }); }
        else setRouteTo(null);
        setMapOpen(true);
        handleRequestGPS();
        setMapFocus(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapFocus, mapLoaded, hasRealMap]);

    const renderFullMap = () =>
        showSatellite ? (
            <SatelliteMap
                areas={visibleAreas}
                cabins={cabinsForMap}
                pois={pois}
                onPoiClick={setSelectedPoi}
                center={mapConfig.center}
                defaultZoom={mapConfig.defaultZoom}
                userPos={gps.pos}
                youAreHereLabel={M.youAreHere}
                onAreaClick={setSelectedArea}
                gpsStatus={gps.status}
                onRequestGPS={handleRequestGPS}
                locateLabel={M.locate}
                locatingLabel={M.locating}
                gpsDeniedLabel={M.gpsDenied}
                initialLayer="satellite"
                streetLabel={M.street}
                satelliteLabel={M.satellite}
                fullscreen
                lang={mlang}
                routeTo={routeTo}
            />
        ) : hasIllustrated ? (
            <IllustratedMap
                imageUrl={mapConfig.illustratedImageUrl!}
                areas={visibleAreas}
                cabins={cabinsForMap}
                pois={pois}
                anchors={anchors}
                onPoiClick={setSelectedPoi}
                onAreaClick={setSelectedArea}
                selectedId={selectedArea?.id}
                fullscreen
                lang={mlang}
            />
        ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">{M.noImage}</div>
        );

    const areaListLabels = {
        lang: mlang,
        openLabel: M.openNow,
        closedLabel: M.closed,
        label24h: M.h24,
        bookableLabel: M.bookable,
        receptionLabel: M.reception,
        awaitingReleaseLabel: M.awaitingRelease,
        onAreaClick: setSelectedArea,
    };

    const overlaysOpen = mapOpen || showGpsHelp || !!selectedArea || !!selectedPoi;

    return (
        <div style={{ padding: "8px 18px 28px", display: "flex", flexDirection: "column", gap: 22 }}>
            <div>
                <h1 style={{ margin: "4px 2px 3px", fontSize: 27, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)" }}>{t.exploreTitle}</h1>
                <p style={{ margin: "0 2px 16px", fontSize: 13.5, color: "var(--muted)" }}>{t.exploreLead}</p>

                {/* Prévia do mapa real (toque → tela cheia) */}
                {!mapLoaded ? (
                    <div style={{ height: 158, borderRadius: 22, background: "var(--surface-alt)", display: "grid", placeItems: "center" }}>
                        <Loader2 className="animate-spin" style={{ color: "var(--brand)" }} />
                    </div>
                ) : !nothingConfigured ? (
                    <button
                        onClick={() => openFullMap(false)}
                        style={{ position: "relative", display: "block", width: "100%", height: 158, borderRadius: 22, overflow: "hidden", border: "1px solid var(--line)", boxShadow: "var(--sh-sm)", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                    >
                        {hasIllustrated ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mapConfig.illustratedImageUrl!} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} draggable={false} />
                        ) : (
                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#BFD0A8 0%,#A9C28E 40%,#8FAE72 100%)" }}>
                                <div style={{ position: "absolute", right: "8%", bottom: "10%", width: "40%", height: "42%", borderRadius: "46% 54% 60% 40%", background: "linear-gradient(160deg,#7FB0C9,#5E94B0)", opacity: .9 }} />
                            </div>
                        )}
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(40,30,15,.5), transparent 55%)" }} />
                        <span style={{ position: "absolute", left: 14, bottom: 13, color: "#fff", fontSize: 13, fontWeight: 800 }}>{M.tapToOpen}</span>
                        <span style={{ position: "absolute", right: 12, bottom: 11, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.92)", color: "var(--brand-deep)", borderRadius: 999, padding: "8px 13px", fontSize: 12.5, fontWeight: 700 }}>
                            <Icon n="map" s={15} c="var(--brand)" /> {M.expand}
                        </span>
                    </button>
                ) : null}
            </div>

            {/* Chips Áreas / Eventos */}
            <div style={{ display: "flex", gap: 8 }}>
                <Chip icon="calendar" active={sub === "areas"} onClick={() => setSub("areas")}>{L.areas}</Chip>
                <Chip icon="ticket" active={sub === "eventos"} onClick={() => setSub("eventos")}>{L.eventos}</Chip>
            </div>

            {/* Áreas — diretório alimentado pelos dados do mapa (showOnMap) */}
            {sub === "areas" && (
                <div style={getThemeStyles(property)} className="flex flex-col gap-4">
                    {ownCabin && (
                        <StayHeroCard
                            cabin={ownCabin}
                            sectionLabel={M.yourStay}
                            cabinLabel={M.yourCabin}
                            routeLabel={M.howToGet}
                            onRoute={() => openFullMap(true)}
                        />
                    )}

                    {(categories.length > 1 || cabins.some(c => !c.isOwnCabin)) && (
                        <div className="space-y-2">
                            {categories.length > 1 && (
                                <CategoryFilter categories={categories} selected={category} onSelect={setCategory} lang={mlang} />
                            )}
                            {cabins.some(c => !c.isOwnCabin) && (
                                <button
                                    onClick={() => setShowOtherCabins(v => !v)}
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border inline-flex items-center gap-1.5 ${showOtherCabins ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40" : "bg-card text-muted-foreground border-border"}`}
                                >
                                    🏠 {showOtherCabins ? M.hideCabins : M.showCabins}
                                </button>
                            )}
                        </div>
                    )}

                    {!mapLoaded ? (
                        <div className="text-center py-8"><Loader2 className="animate-spin text-primary mx-auto" /></div>
                    ) : visibleAreas.length === 0 ? (
                        <p className="text-center text-sm text-muted-foreground py-8">{M.noAreas}</p>
                    ) : (
                        <div className="space-y-5">
                            {dirCategories.map(cat => (
                                <AreaListSection key={cat} category={cat} areas={visibleAreas.filter(a => a.category === cat)} {...areaListLabels} />
                            ))}
                            {noCatAreas.length > 0 && (
                                <AreaListSection category={M.others} areas={noCatAreas} {...areaListLabels} />
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Eventos */}
            {sub === "eventos" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                    {loadingEvents ? (
                        <div style={{ textAlign: "center", padding: 30 }}><Icon n="refresh" s={26} c="var(--faint)" /></div>
                    ) : events.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "40px 20px" }}>
                            <div style={{ width: 72, height: 72, borderRadius: 22, background: "var(--surface-alt)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Icon n="ticket" s={34} c="var(--faint)" /></div>
                            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{L.noEvents}</h3>
                            <p style={{ margin: "6px auto 0", fontSize: 13, color: "var(--muted)", maxWidth: 240 }}>{L.noEventsSub}</p>
                        </div>
                    ) : (
                        events.map((ev) => <EventRow key={ev.id} ev={ev} lang={mlang} todayLabel={L.today} onOpen={() => openSheet("event", ev)} />)
                    )}
                </div>
            )}

            {/* Mapa em tela cheia + sheets — portados para o body para escapar do
                container de 448px (max-width/overflow/animação) do PortalShell. */}
            {overlaysOpen && typeof document !== "undefined" && createPortal(
                <div style={getThemeStyles(property)}>
                    {mapOpen && !nothingConfigured && (
                        <div className="fixed inset-0 z-50 bg-background">
                            <div className="absolute inset-0">{renderFullMap()}</div>
                            <div className="absolute top-4 inset-x-4 z-[1100] flex items-center justify-between gap-2 pointer-events-none">
                                <button
                                    onClick={closeFullMap}
                                    className="pointer-events-auto w-10 h-10 rounded-full bg-card border border-border shadow-lg grid place-items-center active:scale-95 transition-transform"
                                    aria-label="Voltar"
                                >
                                    <ArrowLeft size={20} />
                                </button>
                                {hasIllustrated && hasRealMap && (
                                    <div className="pointer-events-auto flex bg-card/95 backdrop-blur border border-border rounded-full p-0.5 shadow-lg">
                                        <button onClick={() => setMode("illustrated")} className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${mode === "illustrated" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}>
                                            <ImageIcon size={13} /> {M.illustrated}
                                        </button>
                                        <button onClick={() => setMode("satellite")} className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${mode === "satellite" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}>
                                            <MapIcon size={13} /> {M.realMap}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {showGpsHelp && <GpsPermissionHelp lang={mlang} onClose={() => setShowGpsHelp(false)} />}

                    {selectedArea && property && (
                        <AreaCard
                            area={selectedArea}
                            stay={stay}
                            property={property}
                            lang={mlang}
                            onClose={() => setSelectedArea(null)}
                            onBooked={refetch}
                            onReviewed={refetch}
                        />
                    )}

                    {selectedPoi && (
                        <PoiCard poi={selectedPoi} lang={mlang} onClose={() => setSelectedPoi(null)} />
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
