"use client";

import React from "react";
import { MapArea } from "./types";

interface IllustratedMapProps {
    imageUrl: string;
    areas: MapArea[];
    userFraction?: { x: number; y: number } | null;  // posição normalizada do hóspede (GPS)
    youAreHereLabel?: string;
    onAreaClick: (area: MapArea) => void;
}

const DEFAULT_PIN_COLOR = "#9b6dff";

// Mapa ilustrado: imagem do resort com pins das áreas sobrepostos (posição
// normalizada 0..1) e o ponto "você está aqui" quando há GPS calibrado.
export function IllustratedMap({ imageUrl, areas, userFraction, youAreHereLabel, onAreaClick }: IllustratedMapProps) {
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

            {/* Você está aqui */}
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
        </div>
    );
}
