"use client";

import React, { useMemo } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, LocateFixed, LocateOff } from "lucide-react";
import { MapArea, MapCabin } from "./types";
import { GpsPosition, GpsStatus } from "./hooks/useGPS";

const DEFAULT_PIN_COLOR = "#9b6dff";

// Ícone para cabanas
function cabinIcon(cabin: MapCabin): L.DivIcon {
    const own = cabin.isOwnCabin;
    const bg  = own ? "#f59e0b" : "#d97706";
    const html = own
        ? `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
            <div style="background:${bg};color:#fff;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35);outline:2px solid #fff;display:flex;gap:4px;align-items:center">
                🏠 <span>Sua cabana</span>
            </div>
            <div style="width:2px;height:8px;background:${bg}"></div>
            <div style="width:8px;height:8px;border-radius:50%;background:${bg};border:2px solid #fff"></div>
          </div>`
        : `<div style="transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:${bg};border:2px solid rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;font-size:11px;opacity:0.55;box-shadow:0 1px 4px rgba(0,0,0,.3)">🏠</div>`;
    return L.divIcon({ className: "", html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

// Ícone customizado (HTML) para cada área — sem depender dos assets default do Leaflet.
function areaIcon(area: MapArea): L.DivIcon {
    const color = area.pinColor || DEFAULT_PIN_COLOR;
    return L.divIcon({
        className: "",
        html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center">
            <div style="background:${color};color:#fff;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;gap:4px;align-items:center">
                <span>${area.pinIcon || "📍"}</span><span>${area.name}</span>
            </div>
            <div style="width:2px;height:8px;background:${color}"></div>
            <div style="width:8px;height:8px;border-radius:50%;background:${color};border:2px solid #fff"></div>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
    });
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

// Recentraliza o mapa quando o GPS chega pela primeira vez.
function Recenter({ userPos }: { userPos: GpsPosition | null }) {
    const map = useMap();
    const done = React.useRef(false);
    React.useEffect(() => {
        if (userPos && !done.current) {
            done.current = true;
            map.setView([userPos.lat, userPos.lng], map.getZoom());
        }
    }, [userPos, map]);
    return null;
}

interface SatelliteMapProps {
    areas: MapArea[];
    cabins?: MapCabin[];
    center?: { lat: number; lng: number };
    defaultZoom?: number;
    userPos: GpsPosition | null;
    youAreHereLabel?: string;
    onAreaClick: (area: MapArea) => void;
    gpsStatus?: GpsStatus;
    onRequestGPS?: () => void;
    locateLabel?: string;
    locatingLabel?: string;
    gpsDeniedLabel?: string;
}

export function SatelliteMap({ areas, cabins = [], center, defaultZoom, userPos, youAreHereLabel, onAreaClick, gpsStatus = "idle", onRequestGPS, locateLabel = "Me localizar", locatingLabel = "Localizando…", gpsDeniedLabel }: SatelliteMapProps) {
    const placed = areas.filter(a => a.mapPin?.lat != null && a.mapPin?.lng != null && (a.mapPin.lat !== 0 || a.mapPin.lng !== 0));
    const placedCabins = cabins.filter(c => c.mapPin && (c.mapPin.lat !== 0 || c.mapPin.lng !== 0));

    const mapCenter = useMemo<[number, number]>(() => {
        if (center && (center.lat !== 0 || center.lng !== 0)) return [center.lat, center.lng];
        if (userPos) return [userPos.lat, userPos.lng];
        if (placed.length > 0) {
            const lat = placed.reduce((s, a) => s + a.mapPin!.lat, 0) / placed.length;
            const lng = placed.reduce((s, a) => s + a.mapPin!.lng, 0) / placed.length;
            return [lat, lng];
        }
        return [0, 0];
    }, [center, userPos, placed]);

    const zoom = defaultZoom ?? (placed.length > 0 || userPos ? 16 : 2);

    return (
        <div className="rounded-3xl overflow-hidden border border-border shadow-sm relative">
            <style>{`.leaflet-user-ping{animation:userping 1.8s ease-out infinite}@keyframes userping{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.4);opacity:0}}`}</style>
            <MapContainer center={mapCenter} zoom={zoom} style={{ height: "60vh", width: "100%" }} scrollWheelZoom>
                {/* Satélite gratuito (Esri World Imagery) — sem chave de API */}
                <TileLayer
                    attribution='Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                />
                {/* Rótulos de ruas por cima (OpenStreetMap), translúcido */}
                <Recenter userPos={userPos} />

                {placed.map(area => (
                    <Marker
                        key={area.id}
                        position={[area.mapPin!.lat, area.mapPin!.lng]}
                        icon={areaIcon(area)}
                        eventHandlers={{ click: () => onAreaClick(area) }}
                    />
                ))}

                {placedCabins.map(cabin => (
                    <Marker
                        key={cabin.id}
                        position={[cabin.mapPin!.lat, cabin.mapPin!.lng]}
                        icon={cabinIcon(cabin)}
                    />
                ))}

                {userPos && (
                    <>
                        <Marker position={[userPos.lat, userPos.lng]} icon={userIcon} />
                        {userPos.accuracy > 0 && (
                            <CircleMarker
                                center={[userPos.lat, userPos.lng]}
                                radius={Math.min(40, userPos.accuracy / 2)}
                                pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.1, weight: 1 }}
                            />
                        )}
                    </>
                )}
            </MapContainer>

            {/* Botão de GPS — sobreposto fora do MapContainer para evitar conflito com eventos Leaflet */}
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
                        disabled={gpsStatus === "requesting" || gpsStatus === "active"}
                        className={`flex items-center gap-2 px-3 py-2 rounded-full font-bold text-xs shadow-lg transition-all
                            ${gpsStatus === "active"
                                ? "bg-blue-500 text-white"
                                : gpsStatus === "denied"
                                    ? "bg-black/70 text-white/70"
                                    : "bg-white text-gray-800 active:scale-95"}`}
                    >
                        {gpsStatus === "requesting"
                            ? <Loader2 size={14} className="animate-spin" />
                            : <LocateFixed size={14} />}
                        {gpsStatus === "requesting"
                            ? locatingLabel
                            : gpsStatus === "active"
                                ? (youAreHereLabel ?? locateLabel)
                                : locateLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
