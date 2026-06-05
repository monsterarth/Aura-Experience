"use client";

import React from "react";
import { Loader2, LocateFixed, LocateOff } from "lucide-react";
import { MapArea } from "./types";
import { GpsStatus } from "./hooks/useGPS";

interface IllustratedMapProps {
    imageUrl: string;
    areas: MapArea[];
    userFraction?: { x: number; y: number } | null;
    youAreHereLabel?: string;
    onAreaClick: (area: MapArea) => void;
    // GPS opt-in
    gpsStatus?: GpsStatus;
    onRequestGPS?: () => void;
    locateLabel?: string;
    locatingLabel?: string;
    gpsDeniedLabel?: string;
}

const DEFAULT_PIN_COLOR = "#9b6dff";

export function IllustratedMap({
    imageUrl, areas, userFraction, youAreHereLabel, onAreaClick,
    gpsStatus = "idle", onRequestGPS, locateLabel = "Me localizar",
    locatingLabel = "Localizando…", gpsDeniedLabel,
}: IllustratedMapProps) {
    const placed = areas.filter(a => a.mapPin?.pixelX != null && a.mapPin?.pixelY != null);

    return (
        <div className="relative w-full rounded-3xl overflow-hidden border border-border bg-secondary shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Mapa do resort" className="w-full block select-none" draggable={false} />

            {/* Pins das áreas */}
            {placed.map(area => {
                const color = area.pinColor || DEFAULT_PIN_COLOR;
                return (
                    <button
                        key={area.id}
                        onClick={() => onAreaClick(area)}
                        className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center group focus:outline-none"
                        style={{ left: `${(area.mapPin!.pixelX ?? 0) * 100}%`, top: `${(area.mapPin!.pixelY ?? 0) * 100}%` }}
                    >
                        <div
                            className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white shadow-lg whitespace-nowrap flex items-center gap-1 transition-transform group-hover:scale-105 group-active:scale-95"
                            style={{ background: color }}
                        >
                            <span>{area.pinIcon || "📍"}</span>
                            <span className="max-w-[90px] truncate">{area.name}</span>
                        </div>
                        <div className="w-0.5 h-2.5" style={{ background: color }} />
                        <div className="w-2 h-2 rounded-full ring-2 ring-white shadow" style={{ background: color }} />
                    </button>
                );
            })}

            {/* Ponto "você está aqui" */}
            {userFraction && (
                <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${userFraction.x * 100}%`, top: `${userFraction.y * 100}%` }}
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

            {/* Botão de GPS — canto inferior direito, sobreposto ao mapa */}
            {onRequestGPS && (
                <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
                    {/* Mensagem de permissão negada */}
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
                                    : "bg-white/90 text-gray-800 active:scale-95"}`}
                    >
                        {gpsStatus === "requesting" ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <LocateFixed size={14} className={gpsStatus === "active" ? "text-white" : ""} />
                        )}
                        {gpsStatus === "requesting"
                            ? locatingLabel
                            : gpsStatus === "active"
                                ? youAreHereLabel ?? locateLabel
                                : locateLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
