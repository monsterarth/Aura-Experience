"use client";

import React from "react";
import { ChevronRight, CalendarClock, Bell, Lock, Wrench } from "lucide-react";
import { MapArea, MapLang } from "../types";
import { OpenBadge } from "./OpenBadge";
import { formatHours, isOpenNow } from "../utils/hours";
import { localizedName } from "../utils/localize";
import { isUnitInMaintenance } from "@/services/structure-service";

// Áreas que o hóspede pode agendar direto pelo portal.
const isBookable = (a: MapArea) =>
    a.visibility === "guest_auto_approve" || a.visibility === "guest_request";
// Áreas agendáveis apenas pela recepção (hóspede não agenda sozinho).
const isReceptionOnly = (a: MapArea) => a.visibility === "admin_only";
// Área de liberação diária ainda não liberada para hoje (bloqueada ao hóspede).
const isAwaitingRelease = (a: MapArea) =>
    !!a.requiresDailyRelease && a.releasedForDate !== new Date().toISOString().split("T")[0];
// Todas as unidades fora de operação — a área inteira não tem o que agendar.
const isFullyDown = (a: MapArea) =>
    !!a.units?.length && a.units.every(u => isUnitInMaintenance(a.unitStatus, u.id));

interface AreaRowProps {
    area: MapArea;
    lang: MapLang;
    openLabel: string;
    closedLabel: string;
    label24h: string;
    bookableLabel: string;
    receptionLabel: string;
    awaitingReleaseLabel: string;
    maintenanceLabel: string;
    onClick: (area: MapArea) => void;
}

// Fundo suave a partir da cor do pin (hex + alpha); fallback no tema.
function iconStyle(hex?: string): React.CSSProperties | undefined {
    if (!hex || !/^#([0-9a-f]{6})$/i.test(hex)) return undefined;
    return { background: `${hex}22` };
}

export function AreaRow({ area, lang, openLabel, closedLabel, label24h, bookableLabel, receptionLabel, awaitingReleaseLabel, maintenanceLabel, onClick }: AreaRowProps) {
    const down = isBookable(area) && isFullyDown(area);
    const awaiting = isBookable(area) && !down && isAwaitingRelease(area);
    const bookable = isBookable(area) && !awaiting && !down;
    const reception = isReceptionOnly(area);
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
                <span className="block font-bold text-[14.5px] truncate text-foreground">{localizedName(area, lang)}</span>
                <span className="flex items-center gap-1.5 mt-0.5 min-w-0">
                    {down ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full font-bold px-2 py-0.5 text-[11px] text-muted-foreground bg-secondary shrink-0">
                            <Wrench size={11} /> {maintenanceLabel}
                        </span>
                    ) : awaiting ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full font-bold px-2 py-0.5 text-[11px] text-muted-foreground bg-secondary shrink-0">
                            <Lock size={11} /> {awaitingReleaseLabel}
                        </span>
                    ) : bookable ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full font-bold px-2 py-0.5 text-[11px] text-primary bg-primary/10 shrink-0">
                            <CalendarClock size={11} /> {bookableLabel}
                        </span>
                    ) : reception ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full font-bold px-2 py-0.5 text-[11px] text-muted-foreground bg-secondary shrink-0">
                            <Bell size={11} /> {receptionLabel}
                        </span>
                    ) : (
                        <OpenBadge open={open} openLabel={openLabel} closedLabel={closedLabel} />
                    )}
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
