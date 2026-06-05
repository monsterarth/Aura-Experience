"use client";

import React from "react";
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
    // GPS opt-in
    gpsStatus?: GpsStatus;
    onRequestGPS?: () => void;
    locateLabel?: string;
    locatingLabel?: string;
    gpsDeniedLabel?: string;
    // userFraction é passado de volta para colorir o botão corretamente
    // (já está como prop acima via userFraction — reutilizamos)
}

const DEFAULT_PIN_COLOR = "#9b6dff";

export function IllustratedMap({
    imageUrl, areas, cabins = [], userFraction, youAreHereLabel, onAreaClick,
    gpsStatus = "idle", onRequestGPS, locateLabel = "Me localizar",
    locatingLabel = "Localizando…", gpsDeniedLabel,
}: IllustratedMapProps) {
    const placed = areas.filter(a => a.mapPin?.pixelX != null && a.mapPin?.pixelY != null);
    const placedCabins = cabins.filter(c => c.mapPin?.pixelX != null && c.mapPin?.pixelY != null);

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
                            // Cabana do hóspede — destaque total
                            <>
                                <div className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white shadow-lg whitespace-nowrap flex items-center gap-1 ring-2 ring-white"
                                    style={{ background: "#f59e0b" }}>
                                    🏠 <span>Sua cabana</span>
                                </div>
                                <div className="w-0.5 h-3" style={{ background: "#f59e0b" }} />
                                <div className="w-3 h-3 rounded-full ring-2 ring-white shadow" style={{ background: "#f59e0b" }} />
                            </>
                        ) : (
                            // Outras cabanas — discretas: só um ícone pequeno sem rótulo
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
                        disabled={gpsStatus === "requesting" || (gpsStatus === "active" && !!userFraction)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-full font-bold text-xs shadow-lg transition-all
                            ${gpsStatus === "active" && userFraction
                                ? "bg-blue-500 text-white"
                                : gpsStatus === "active" && !userFraction
                                    ? "bg-amber-500 text-white"   // GPS ok mas sem calibração suficiente
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
                                    ? "GPS ativo"   // sinaliza que GPS funciona mas mapa não tem calibração
                                    : locateLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
