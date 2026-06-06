"use client";

import React from "react";
import { MapArea, MapLang } from "../types";
import { categoryLabel } from "./CategoryFilter";
import { AreaRow } from "./AreaRow";

interface AreaListSectionProps {
    category: string;
    areas: MapArea[];
    lang: MapLang;
    openLabel: string;
    closedLabel: string;
    label24h: string;
    onAreaClick: (area: MapArea) => void;
}

// Cor representativa da seção: usa o pinColor mais comum entre os itens.
function sectionColor(areas: MapArea[]): string | undefined {
    const c = areas.find(a => a.pinColor)?.pinColor;
    return c && /^#([0-9a-f]{6})$/i.test(c) ? c : undefined;
}

export function AreaListSection({ category, areas, lang, openLabel, closedLabel, label24h, onAreaClick }: AreaListSectionProps) {
    if (!areas.length) return null;
    const color = sectionColor(areas);

    return (
        <section className="space-y-2">
            {/* Cabeçalho da seção */}
            <div className="flex items-center gap-2 px-1">
                <span
                    className={`w-6 h-6 rounded-lg grid place-items-center ${color ? "" : "bg-secondary"}`}
                    style={color ? { background: `${color}22` } : undefined}
                >
                    <span className="w-2 h-2 rounded-full" style={{ background: color ?? "hsl(var(--primary))" }} />
                </span>
                <h2 className="font-black text-base text-foreground">{categoryLabel(category, lang)}</h2>
                <span className="text-xs text-muted-foreground">{areas.length}</span>
            </div>

            {/* Lista */}
            <div className="bg-card border border-border rounded-3xl p-1.5 flex flex-col">
                {areas.map((a, i) => (
                    <React.Fragment key={a.id}>
                        {i > 0 && <span className="h-px bg-border/60 mx-3" />}
                        <AreaRow
                            area={a}
                            lang={lang}
                            openLabel={openLabel}
                            closedLabel={closedLabel}
                            label24h={label24h}
                            onClick={onAreaClick}
                        />
                    </React.Fragment>
                ))}
            </div>
        </section>
    );
}
