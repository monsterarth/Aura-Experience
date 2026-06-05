"use client";

import React from "react";
import { MapLang } from "../types";

const ALL_LABEL: Record<MapLang, string> = { pt: "Todas", en: "All", es: "Todas" };

// Rótulos amigáveis para categorias conhecidas; cai no próprio valor se desconhecida.
const CATEGORY_LABELS: Record<string, Record<MapLang, string>> = {
    // Agendáveis
    lazer:       { pt: "Lazer",       en: "Leisure",    es: "Ocio" },
    leisure:     { pt: "Lazer",       en: "Leisure",    es: "Ocio" },
    "bem-estar": { pt: "Bem-estar",   en: "Wellness",   es: "Bienestar" },
    spa:         { pt: "Spa",         en: "Spa",        es: "Spa" },
    esporte:     { pt: "Esporte",     en: "Sport",      es: "Deporte" },
    sport:       { pt: "Esporte",     en: "Sport",      es: "Deporte" },
    service:     { pt: "Serviço",     en: "Service",    es: "Servicio" },
    // Informativos
    alimentacao: { pt: "Alimentação", en: "Food & Drinks", es: "Comida" },
    natureza:    { pt: "Natureza",    en: "Nature",     es: "Naturaleza" },
    comodidade:  { pt: "Comodidades", en: "Amenities",  es: "Comodidades" },
    acesso:      { pt: "Acesso",      en: "Access",     es: "Acceso" },
};

interface CategoryFilterProps {
    categories: string[];
    selected: string | null;     // null = todas
    onSelect: (c: string | null) => void;
    lang: MapLang;
}

export function CategoryFilter({ categories, selected, onSelect, lang }: CategoryFilterProps) {
    const label = (c: string) => CATEGORY_LABELS[c]?.[lang] ?? c;

    return (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <Chip active={selected === null} onClick={() => onSelect(null)}>{ALL_LABEL[lang]}</Chip>
            {categories.map(c => (
                <Chip key={c} active={selected === c} onClick={() => onSelect(c)}>{label(c)}</Chip>
            ))}
        </div>
    );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${active
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"}`}
        >
            {children}
        </button>
    );
}
