"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { MapArea, MapLang } from "../types";
import { OpenBadge } from "./OpenBadge";
import { formatHours, isOpenNow } from "../utils/hours";

interface AreaRowProps {
    area: MapArea;
    lang: MapLang;
    openLabel: string;
    closedLabel: string;
    label24h: string;
    onClick: (area: MapArea) => void;
}

// Fundo suave a partir da cor do pin (hex + alpha); fallback no tema.
function iconStyle(hex?: string): React.CSSProperties | undefined {
    if (!hex || !/^#([0-9a-f]{6})$/i.test(hex)) return undefined;
    return { background: `${hex}22` };
}

export function AreaRow({ area, openLabel, closedLabel, label24h, onClick }: AreaRowProps) {
    const open = isOpenNow(area.operatingHours);
    const hours = formatHours(area.operatingHours, label24h);
    const style = iconStyle(area.pinColor);

    return (
        <button
            onClick={() => onClick(area)}
            className="w-full flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-secondary active:bg-secondary/70 transition-colors"
        >
            {/* Ícone */}
            <span
                className={`shrink-0 w-[42px] h-[42px] rounded-xl grid place-items-center text-xl ${style ? "" : "bg-secondary"}`}
                style={style}
            >
                {area.pinIcon || "📍"}
            </span>

            {/* Centro */}
            <span className="flex-1 min-w-0">
                <span className="block font-bold text-[14.5px] truncate text-foreground">{area.name}</span>
                <span className="flex items-center gap-1.5 mt-0.5 min-w-0">
                    <OpenBadge open={open} openLabel={openLabel} closedLabel={closedLabel} />
                    {hours && (
                        <span className="text-[11.5px] text-muted-foreground truncate">· {hours}</span>
                    )}
                    {area.reviewCount > 0 && (
                        <span className="text-[11.5px] text-muted-foreground shrink-0">· {area.rating} ★</span>
                    )}
                </span>
            </span>

            {/* Chevron */}
            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
        </button>
    );
}
