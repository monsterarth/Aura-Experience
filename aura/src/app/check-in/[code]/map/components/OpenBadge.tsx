"use client";

import React from "react";

interface OpenBadgeProps {
    open: boolean | null;          // null = sem horário → não renderiza
    openLabel: string;
    closedLabel: string;
    size?: "sm" | "md";
}

// Badge de status de funcionamento. Verde (aberto) / terracota (fechado).
// São cores de status (semânticas), independentes do tema da pousada.
export function OpenBadge({ open, openLabel, closedLabel, size = "sm" }: OpenBadgeProps) {
    if (open == null) return null;
    const cls = open
        ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/12"
        : "text-orange-700 dark:text-orange-400 bg-orange-500/12";
    const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full font-bold ${pad} ${cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${open ? "bg-emerald-600" : "bg-orange-600"}`} />
            {open ? openLabel : closedLabel}
        </span>
    );
}
