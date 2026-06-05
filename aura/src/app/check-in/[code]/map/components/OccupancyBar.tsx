"use client";

import React from "react";
import { Users } from "lucide-react";

interface OccupancyBarProps {
    current: number;
    capacity: number;
    label?: string;
}

export function OccupancyBar({ current, capacity, label }: OccupancyBarProps) {
    const ratio = capacity > 0 ? Math.min(1, current / capacity) : 0;
    const pct = Math.round(ratio * 100);
    // verde < 50% · âmbar < 85% · vermelho acima
    const color = ratio < 0.5 ? "#22c55e" : ratio < 0.85 ? "#f59e0b" : "#ef4444";

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-foreground">
                    <Users size={13} /> {label ?? "Ocupação"}
                </span>
                <span className="font-mono text-muted-foreground">
                    {capacity > 0 ? `${current}/${capacity}` : current}
                </span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: color }}
                />
            </div>
        </div>
    );
}
