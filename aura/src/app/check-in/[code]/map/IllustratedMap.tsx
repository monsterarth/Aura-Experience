"use client";

import React, { useMemo, useRef, useState } from "react";
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

// --- Clustering ---------------------------------------------------------------
// Agrupa pins próximos em um único "cluster" de forma greedy.
// threshold: distância normalizada (0..1) para considerar dois pontos no mesmo grupo.
type PinCluster = {
    id: string;          // id do primeiro pin (âncora)
    cx: number;          // centro X do cluster (0..1)
    cy: number;          // centro Y
    areas: MapArea[];    // pins contidos
};

function buildClusters(areas: MapArea[], threshold = 0.085): PinCluster[] {
    const placed = areas.filter(a => a.mapPin?.pixelX != null && a.mapPin?.pixelY != null);
    const assigned = new Set<string>();
    const clusters: PinCluster[] = [];

    for (const anchor of placed) {
        if (assigned.has(anchor.id)) continue;
        const ax = anchor.mapPin!.pixelX!;
        const ay = anchor.mapPin!.pixelY!;

        const group: MapArea[] = [anchor];
        for (const other of placed) {
            if (other.id === anchor.id || assigned.has(other.id)) continue;
            const dist = Math.hypot(other.mapPin!.pixelX! - ax, other.mapPin!.pixelY! - ay);
            if (dist < threshold) group.push(other);
        }

        for (const a of group) assigned.add(a.id);

        const cx = group.reduce((s, a) => s + a.mapPin!.pixelX!, 0) / group.length;
        const cy = group.reduce((s, a) => s + a.mapPin!.pixelY!, 0) / group.length;
        clusters.push({ id: anchor.id, cx, cy, areas: group });
    }
    return clusters;
}

// ------------------------------------------------------------------------------

export function IllustratedMap({
    imageUrl, areas, cabins = [], userFraction, youAreHereLabel, onAreaClick, selectedId,
    gpsStatus = "idle", onRequestGPS, locateLabel = "Me localizar",
    locatingLabel = "Localizando…", gpsDeniedLabel,
}: IllustratedMapProps) {
    const placedCabins = cabins.filter(c => c.mapPin?.pixelX != null && c.mapPin?.pixelY != null);

    // Cluster expandido no momento (null = nenhum)
    const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Grupos de pins
    const clusters = useMemo(() => buildClusters(areas), [areas]);

    // Fechar o popover se o selectedId mudou externamente
    React.useEffect(() => {
        if (selectedId) setExpandedCluster(null);
    }, [selectedId]);

    function handleClusterClick(cluster: PinCluster) {
        if (cluster.areas.length === 1) {
            onAreaClick(cluster.areas[0]);
        } else {
            setExpandedCluster(prev => prev === cluster.id ? null : cluster.id);
        }
    }

    // Fechar popover ao clicar fora
    React.useEffect(() => {
        if (!expandedCluster) return;
        const handler = (e: MouseEvent) => {
            const el = wrapRef.current;
            if (el && !el.contains(e.target as Node)) setExpandedCluster(null);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [expandedCluster]);

    return (
        <div ref={wrapRef} className="relative w-full rounded-3xl overflow-hidden border border-border bg-secondary shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Mapa do resort" className="w-full block select-none" draggable={false} />

            {/* Clusters de áreas */}
            {clusters.map(cluster => {
                const isMulti = cluster.areas.length > 1;
                const isOpen = expandedCluster === cluster.id;
                // Para cluster único, verifica seleção
                const isSingleSelected = !isMulti && cluster.areas[0].id === selectedId;
                const color = cluster.areas[0].pinColor || DEFAULT_PIN_COLOR;
                const left = `${cluster.cx * 100}%`;
                const top  = `${cluster.cy * 100}%`;

                return (
                    <div key={cluster.id}
                        className="absolute"
                        style={{ left, top, zIndex: isOpen ? 40 : isSingleSelected ? 30 : isMulti ? 25 : 15 }}
                    >
                        {/* Pin / Cluster bubble */}
                        <button
                            onClick={() => handleClusterClick(cluster)}
                            className="absolute -translate-x-1/2 -translate-y-1/2 group focus:outline-none"
                        >
                            {isMulti ? (
                                // Cluster: círculo maior com contador + primeiro emoji
                                <div className={`
                                    flex items-center gap-1 pl-2 pr-2.5 h-8 rounded-full
                                    ring-2 ring-white shadow-lg text-white font-bold text-xs
                                    transition-transform group-hover:scale-105 group-active:scale-95
                                    ${isOpen ? "ring-4 ring-white/80 scale-105" : ""}
                                `} style={{ background: color }}>
                                    <span className="text-sm leading-none">{cluster.areas[0].pinIcon || "📍"}</span>
                                    <span>{cluster.areas.length}</span>
                                </div>
                            ) : (
                                // Pin individual
                                <div
                                    className={`w-7 h-7 rounded-full ring-2 ring-white shadow-lg grid place-items-center text-[13px] transition-transform group-hover:scale-110 group-active:scale-95 ${isSingleSelected ? "scale-125 ring-4" : ""}`}
                                    style={{ background: color }}
                                >
                                    {cluster.areas[0].pinIcon || "📍"}
                                </div>
                            )}
                        </button>

                        {/* Popover do cluster expandido */}
                        {isMulti && isOpen && (
                            <div
                                className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-border overflow-hidden min-w-[160px] max-w-[220px]"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide border-b border-border">
                                    {cluster.areas.length} locais
                                </div>
                                <ul className="py-1">
                                    {cluster.areas.map(a => (
                                        <li key={a.id}>
                                            <button
                                                onClick={() => { setExpandedCluster(null); onAreaClick(a); }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-secondary active:bg-secondary/70 transition-colors text-left"
                                            >
                                                <span
                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] shrink-0"
                                                    style={{ background: a.pinColor || DEFAULT_PIN_COLOR }}
                                                >
                                                    {a.pinIcon || "📍"}
                                                </span>
                                                <span className="text-xs font-semibold text-foreground truncate">{a.name}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Rótulo do pin individual (quando não é cluster) */}
                        {!isMulti && (
                            <span
                                className="absolute left-1/2 -translate-x-1/2 top-[22px] translate-y-1/2 whitespace-nowrap text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md shadow max-w-[100px] truncate pointer-events-none"
                                style={{ background: color }}
                            >
                                {cluster.areas[0].name}
                            </span>
                        )}
                    </div>
                );
            })}

            {/* Pins das cabanas */}
            {placedCabins.map(cabin => {
                const own = cabin.isOwnCabin;
                return (
                    <div
                        key={cabin.id}
                        className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center pointer-events-none"
                        style={{
                            left: `${(cabin.mapPin!.pixelX ?? 0) * 100}%`,
                            top:  `${(cabin.mapPin!.pixelY ?? 0) * 100}%`,
                            zIndex: own ? 10 : 5,
                        }}
                    >
                        {own ? (
                            <>
                                <div className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white shadow-lg whitespace-nowrap flex items-center gap-1 ring-2 ring-white"
                                    style={{ background: "#f59e0b" }}>
                                    🏠 <span>Sua cabana</span>
                                </div>
                                <div className="w-0.5 h-3" style={{ background: "#f59e0b" }} />
                                <div className="w-3 h-3 rounded-full ring-2 ring-white shadow" style={{ background: "#f59e0b" }} />
                            </>
                        ) : (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] opacity-50 ring-1 ring-white/60 shadow-sm"
                                style={{ background: "#d97706" }}>
                                🏠
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Ponto "você está aqui" */}
            {userFraction && (
                <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${userFraction.x * 100}%`, top: `${userFraction.y * 100}%`, zIndex: 50 }}
                >
                    <span className="absolute inset-0 -m-3 rounded-full bg-blue-500/30 animate-ping" />
                    <div className="relative w-4 h-4 rounded-full bg-blue-500 ring-2 ring-white shadow-lg" />
                    {youAreHereLabel && (
                        <span className="absolute top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-blue-600 bg-white/90 px-1.5 py-0.5 rounded shadow">
                            {youAreHereLabel}
                        </span>
                    )}
                </div>
            )}

            {/* Botão de GPS */}
            {onRequestGPS && (
                <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2" style={{ zIndex: 60 }}>
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
