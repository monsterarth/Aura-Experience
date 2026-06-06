"use client";

import React from "react";
import { Home, Route } from "lucide-react";
import { MapCabin } from "../types";

interface StayHeroCardProps {
    cabin: MapCabin;
    sectionLabel: string;       // "Sua estadia"
    cabinLabel: string;         // "Sua Cabana"
    routeLabel: string;         // "Como chegar"
    onRoute: () => void;
}

// Bloco de destaque da cabana do hóspede (âmbar), com ação "Como chegar".
export function StayHeroCard({ cabin, sectionLabel, cabinLabel, routeLabel, onRoute }: StayHeroCardProps) {
    const title = cabin.number ? `${cabinLabel} · ${cabin.number}` : cabinLabel;

    return (
        <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1">{sectionLabel}</p>
            <div className="bg-amber-500/15 rounded-3xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-2xl bg-white grid place-items-center shadow-sm shrink-0">
                        <Home size={22} className="text-amber-600" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-black text-base text-foreground truncate">{title}</p>
                        {cabin.name && cabin.name !== cabin.number && (
                            <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 truncate">{cabin.name}</p>
                        )}
                    </div>
                </div>
                <button
                    onClick={onRoute}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold text-sm py-3 rounded-2xl active:scale-[0.98] transition-transform"
                >
                    <Route size={16} /> {routeLabel}
                </button>
            </div>
        </div>
    );
}
