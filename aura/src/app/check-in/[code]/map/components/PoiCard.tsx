"use client";

import React from "react";
import Image from "next/image";
import { X, Navigation, ExternalLink, Instagram } from "lucide-react";
import { MapPoi, MapLang } from "../types";
import { categoryLabel } from "./CategoryFilter";

const T: Record<MapLang, Record<string, string>> = {
    pt: { directions: "Como chegar", openLink: "Ver no site", instagram: "Ver no Instagram", noDesc: "Sem descrição." },
    en: { directions: "Get directions", openLink: "Visit website", instagram: "View on Instagram", noDesc: "No description." },
    es: { directions: "Cómo llegar", openLink: "Ver sitio web", instagram: "Ver en Instagram", noDesc: "Sin descripción." },
};

// Aceita "@usuario", "usuario" ou URL completa → sempre devolve uma URL do perfil.
function instagramUrl(raw: string): string {
    const v = raw.trim();
    if (/^https?:\/\//i.test(v)) return v;
    return `https://instagram.com/${v.replace(/^@/, "")}`;
}

interface PoiCardProps {
    poi: MapPoi;
    lang: MapLang;
    onClose: () => void;
}

function localizedName(poi: MapPoi, lang: MapLang): string {
    if (lang === "en" && poi.name_en) return poi.name_en;
    if (lang === "es" && poi.name_es) return poi.name_es;
    return poi.name;
}

function localizedDescription(poi: MapPoi, lang: MapLang): string | undefined {
    if (lang === "en" && (poi as any).description_en) return (poi as any).description_en;
    if (lang === "es" && (poi as any).description_es) return (poi as any).description_es;
    return poi.description;
}

export function PoiCard({ poi, lang, onClose }: PoiCardProps) {
    const t = T[lang];

    const hasDirections =
        poi.mapPin?.lat != null && poi.mapPin.lat !== 0 &&
        poi.mapPin?.lng != null && poi.mapPin.lng !== 0;

    const openDirections = () => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${poi.mapPin!.lat},${poi.mapPin!.lng}`;
        window.open(url, "_blank");
    };

    const openLink = () => {
        if (poi.externalLink) window.open(poi.externalLink, "_blank");
    };

    const openInstagram = () => {
        if (poi.instagram) window.open(instagramUrl(poi.instagram), "_blank");
    };

    const desc = localizedDescription(poi, lang);

    return (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50 animate-in fade-in" onClick={onClose} />

            <div className="relative w-full max-w-lg bg-background rounded-t-3xl shadow-2xl max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-300">
                {/* Handle + close */}
                <div className="flex items-center justify-between p-4 pb-2">
                    <div className="w-10 h-1 rounded-full bg-border mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
                    <h2 className="text-lg font-black truncate pr-2">
                        {poi.pinIcon && <span className="mr-1">{poi.pinIcon}</span>}
                        {localizedName(poi, lang)}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* Category badge */}
                <div className="px-4 pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-secondary text-muted-foreground px-2.5 py-1 rounded-full">
                        {categoryLabel(poi.category, lang)}
                    </span>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-4">
                    {/* Fotos */}
                    {poi.photos && poi.photos.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                            {poi.photos.map((p, i) => (
                                <div key={i} className="relative w-40 h-28 rounded-2xl overflow-hidden shrink-0 bg-secondary">
                                    <Image src={p} alt="" fill sizes="160px" className="object-cover" />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Descrição */}
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {desc || t.noDesc}
                    </p>

                    {/* Ações */}
                    <div className="space-y-2 pb-2">
                        {hasDirections && (
                            <button
                                onClick={openDirections}
                                className="w-full py-3.5 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                            >
                                <Navigation size={18} /> {t.directions}
                            </button>
                        )}
                        {poi.externalLink && (
                            <button
                                onClick={openLink}
                                className="w-full py-3 bg-secondary text-foreground rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-secondary/80 transition-colors active:scale-95"
                            >
                                <ExternalLink size={16} /> {t.openLink}
                            </button>
                        )}
                        {poi.instagram && (
                            <button
                                onClick={openInstagram}
                                className="w-full py-3 bg-secondary text-foreground rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-secondary/80 transition-colors active:scale-95"
                            >
                                <Instagram size={16} /> {t.instagram}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
