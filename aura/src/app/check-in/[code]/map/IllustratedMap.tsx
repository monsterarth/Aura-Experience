"use client";

import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, ImageOverlay, Marker, Tooltip, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { Loader2, LocateFixed, LocateOff } from "lucide-react";
import { MapArea, MapCabin } from "./types";
import { GpsStatus } from "./hooks/useGPS";

interface IllustratedMapProps {
    imageUrl: string;
    areas: MapArea[];
    cabins?: MapCabin[];
    userFraction?: { x: number; y: number } | null;
    youAreHereLabel?: string;
    onAreaClick: (area: MapArea) => void;
    selectedId?: string;
    // GPS opt-in
    gpsStatus?: GpsStatus;
    onRequestGPS?: () => void;
    locateLabel?: string;
    locatingLabel?: string;
    gpsDeniedLabel?: string;
}

const DEFAULT_PIN_COLOR = "#9b6dff";

// --- Ícones (divIcon, mesmo padrão do mapa satélite) -------------------------

function areaIcon(area: MapArea): L.DivIcon {
    const color = area.pinColor || DEFAULT_PIN_COLOR;
    return L.divIcon({
        className: "",
        html: `<div style="transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:15px">${area.pinIcon || "📍"}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
    });
}

function cabinIcon(cabin: MapCabin): L.DivIcon {
    const own = cabin.isOwnCabin;
    const bg = own ? "#f59e0b" : "#d97706";
    const html = own
        ? `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
            <div style="background:${bg};color:#fff;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35);outline:2px solid #fff;display:flex;gap:4px;align-items:center">🏠 <span>Sua cabana</span></div>
            <div style="width:2px;height:8px;background:${bg}"></div>
            <div style="width:8px;height:8px;border-radius:50%;background:${bg};border:2px solid #fff"></div>
          </div>`
        : `<div style="transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:${bg};border:2px solid rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;font-size:11px;opacity:0.55;box-shadow:0 1px 4px rgba(0,0,0,.3)">🏠</div>`;
    return L.divIcon({ className: "", html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

const userIcon = L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-50%)">
        <div style="position:absolute;inset:-8px;border-radius:50%;background:rgba(59,130,246,.3)" class="leaflet-user-ping"></div>
        <div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
});

// Enquadra a imagem inteira UMA vez ao montar (sem re-fit em cada render, senão
// o zoom do usuário seria revertido). Começa com um pouco mais de aproximação.
function FitImage({ bounds, zoomIn = 0.75 }: { bounds: L.LatLngBoundsLiteral; zoomIn?: number }) {
    const map = useMap();
    const done = React.useRef(false);
    useEffect(() => {
        if (done.current) return;
        done.current = true;
        map.fitBounds(bounds);
        map.setMaxBounds(L.latLngBounds(bounds).pad(0.25));
        // Aproxima um pouco além do "caber tudo" para não abrir tão distante.
        map.setZoom(map.getZoom() + zoomIn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}

// ------------------------------------------------------------------------------

export function IllustratedMap({
    imageUrl, areas, cabins = [], userFraction, youAreHereLabel, onAreaClick, selectedId,
    gpsStatus = "idle", onRequestGPS, locateLabel = "Me localizar",
    locatingLabel = "Localizando…", gpsDeniedLabel,
}: IllustratedMapProps) {
    // Dimensões naturais da imagem → define o sistema de coordenadas (CRS.Simple).
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        let alive = true;
        const img = new Image();
        img.onload = () => { if (alive) setDims({ w: img.naturalWidth, h: img.naturalHeight }); };
        img.src = imageUrl;
        return () => { alive = false; };
    }, [imageUrl]);

    const placed = useMemo(
        () => areas.filter(a => a.mapPin?.pixelX != null && a.mapPin?.pixelY != null),
        [areas],
    );
    const placedCabins = useMemo(
        () => cabins.filter(c => c.mapPin?.pixelX != null && c.mapPin?.pixelY != null),
        [cabins],
    );

    if (!dims) {
        return (
            <div className="h-[60vh] flex items-center justify-center bg-secondary rounded-3xl">
                <Loader2 className="animate-spin text-primary" />
            </div>
        );
    }

    const { w: W, h: H } = dims;
    const bounds: L.LatLngBoundsLiteral = [[0, 0], [H, W]];
    // Fração (x,y) com origem no canto superior-esquerdo → coord CRS.Simple (y p/ cima).
    const toLatLng = (fx: number, fy: number): [number, number] => [H * (1 - fy), W * fx];

    return (
        <div className="rounded-3xl overflow-hidden border border-border shadow-sm relative">
            <style>{`.leaflet-user-ping{animation:userping 1.8s ease-out infinite}@keyframes userping{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.4);opacity:0}}`}</style>
            <MapContainer
                crs={L.CRS.Simple}
                bounds={bounds}
                minZoom={-4}
                maxZoom={4}
                zoomSnap={0.25}
                zoomDelta={0.5}
                style={{ height: "60vh", width: "100%", background: "#e8e8e8" }}
                scrollWheelZoom
                attributionControl={false}
            >
                <ImageOverlay url={imageUrl} bounds={bounds} />
                <FitImage bounds={bounds} />

                {/* Áreas — clusterizam ao afastar, separam ao aproximar */}
                <MarkerClusterGroup
                    chunkedLoading
                    maxClusterRadius={50}
                    showCoverageOnHover={false}
                    iconCreateFunction={(cluster: { getChildCount: () => number }) => {
                        const count = cluster.getChildCount();
                        return L.divIcon({
                            className: "",
                            html: `<div style="transform:translate(-50%,-50%);min-width:36px;height:36px;border-radius:999px;background:#9b6dff;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;padding:0 8px">${count}</div>`,
                            iconSize: [0, 0],
                            iconAnchor: [0, 0],
                        });
                    }}
                >
                    {placed.map(area => (
                        <Marker
                            key={area.id}
                            position={toLatLng(area.mapPin!.pixelX!, area.mapPin!.pixelY!)}
                            icon={areaIcon(area)}
                            eventHandlers={{ click: () => onAreaClick(area) }}
                        >
                            <Tooltip direction="top" offset={[0, -16]}>{area.name}</Tooltip>
                        </Marker>
                    ))}
                </MarkerClusterGroup>

                {/* Cabanas */}
                {placedCabins.map(cabin => (
                    <Marker
                        key={cabin.id}
                        position={toLatLng(cabin.mapPin!.pixelX!, cabin.mapPin!.pixelY!)}
                        icon={cabinIcon(cabin)}
                    />
                ))}

                {/* Você está aqui */}
                {userFraction && (
                    <Marker position={toLatLng(userFraction.x, userFraction.y)} icon={userIcon}>
                        {youAreHereLabel && (
                            <Tooltip direction="bottom" offset={[0, 10]} permanent>{youAreHereLabel}</Tooltip>
                        )}
                    </Marker>
                )}
            </MapContainer>

            {/* Botão de GPS — sobreposto fora do MapContainer */}
            {onRequestGPS && (
                <div className="absolute bottom-4 right-4 z-[1000] flex flex-col items-end gap-2">
                    {gpsStatus === "denied" && gpsDeniedLabel && (
                        <div className="flex items-center gap-1.5 bg-black/70 text-white text-[10px] font-semibold px-3 py-1.5 rounded-full shadow max-w-[200px] text-right">
                            <LocateOff size={12} className="shrink-0" />
                            {gpsDeniedLabel}
                        </div>
                    )}
                    <button
                        onClick={onRequestGPS}
                        disabled={gpsStatus === "requesting" || (gpsStatus === "active" && !!userFraction)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-full font-bold text-xs shadow-lg transition-all
                            ${gpsStatus === "active" && userFraction
                                ? "bg-blue-500 text-white"
                                : gpsStatus === "active" && !userFraction
                                    ? "bg-amber-500 text-white"
                                    : gpsStatus === "denied"
                                        ? "bg-black/70 text-white/70"
                                        : "bg-white/90 text-gray-800 active:scale-95"}`}
                    >
                        {gpsStatus === "requesting" ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <LocateFixed size={14} />
                        )}
                        {gpsStatus === "requesting"
                            ? locatingLabel
                            : gpsStatus === "active" && userFraction
                                ? youAreHereLabel ?? locateLabel
                                : gpsStatus === "active" && !userFraction
                                    ? "GPS ativo"
                                    : locateLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
