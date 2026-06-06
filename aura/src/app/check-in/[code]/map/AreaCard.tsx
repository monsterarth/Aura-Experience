"use client";

import React, { useState } from "react";
import Image from "next/image";
import { X, Clock, Info, Calendar, Star } from "lucide-react";
import { Stay, Property } from "@/types/aura";
import { MapArea, MapLang } from "./types";
import { StarRating } from "./components/StarRating";
import { OccupancyBar } from "./components/OccupancyBar";
import { BookingPanel } from "./BookingPanel";
import { ReviewPanel } from "./ReviewPanel";
import { localizedName, localizedDescription } from "./utils/localize";

const T: Record<MapLang, Record<string, string>> = {
    pt: { info: "Info", book: "Agendar", review: "Avaliar", hours: "Horário", capacity: "Capacidade", amenities: "Comodidades", people: "pessoas", reviews: "avaliações", noDesc: "Sem descrição." },
    en: { info: "Info", book: "Book", review: "Reviews", hours: "Hours", capacity: "Capacity", amenities: "Amenities", people: "people", reviews: "reviews", noDesc: "No description." },
    es: { info: "Info", book: "Reservar", review: "Reseñas", hours: "Horario", capacity: "Capacidad", amenities: "Comodidades", people: "personas", reviews: "reseñas", noDesc: "Sin descripción." },
};

type Tab = "info" | "book" | "review";

interface AreaCardProps {
    area: MapArea;
    stay: Stay;
    property: Property;
    lang: MapLang;
    onClose: () => void;
    onBooked?: () => void;
    onReviewed?: () => void;
}

const bookable = (a: MapArea) => a.visibility === "guest_auto_approve" || a.visibility === "guest_request";

export function AreaCard({ area, stay, property, lang, onClose, onBooked, onReviewed }: AreaCardProps) {
    const t = T[lang];
    const [tab, setTab] = useState<Tab>("info");

    const tabs: { id: Tab; label: string; icon: React.ElementType; show: boolean }[] = [
        { id: "info", label: t.info, icon: Info, show: true },
        { id: "book", label: t.book, icon: Calendar, show: bookable(area) },
        { id: "review", label: t.review, icon: Star, show: true },
    ];

    return (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50 animate-in fade-in" onClick={onClose} />

            <div className="relative w-full max-w-lg bg-background rounded-t-3xl shadow-2xl max-h-[88dvh] flex flex-col animate-in slide-in-from-bottom duration-300">
                {/* Handle + close */}
                <div className="flex items-center justify-between p-4 pb-2">
                    <div className="w-10 h-1 rounded-full bg-border mx-auto absolute left-1/2 -translate-x-1/2 top-2" />
                    <h2 className="text-lg font-black truncate pr-2">{area.pinIcon} {localizedName(area, lang)}</h2>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary shrink-0"><X size={20} /></button>
                </div>

                {/* Rating resumo */}
                {area.reviewCount > 0 && (
                    <div className="flex items-center gap-2 px-4 pb-2">
                        <StarRating value={area.rating} size={15} />
                        <span className="text-xs text-muted-foreground">{area.rating} · {area.reviewCount} {t.reviews}</span>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 px-4 border-b border-border">
                    {tabs.filter(tb => tb.show).map(tb => (
                        <button
                            key={tb.id}
                            onClick={() => setTab(tb.id)}
                            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold border-b-2 transition-all ${tab === tb.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                        >
                            <tb.icon size={15} /> {tb.label}
                        </button>
                    ))}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 overflow-y-auto p-4">
                    {tab === "info" && (
                        <div className="space-y-4">
                            {area.photos && area.photos.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
                                    {area.photos.map((p, i) => (
                                        <div key={i} className="relative w-40 h-28 rounded-2xl overflow-hidden shrink-0 bg-secondary">
                                            <Image src={p} alt="" fill sizes="160px" className="object-cover" />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <p className="text-sm text-muted-foreground leading-relaxed">{localizedDescription(area, lang) || t.noDesc}</p>

                            <div className="grid grid-cols-2 gap-3">
                                {area.operatingHours?.openTime && (
                                    <div className="bg-card border border-border rounded-2xl p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Clock size={11} /> {t.hours}</p>
                                        {area.operatingHours.openTime === "00:00" && (area.operatingHours.closeTime === "23:59" || area.operatingHours.closeTime === "00:00")
                                            ? <p className="font-bold text-sm mt-1">24h</p>
                                            : <p className="font-bold text-sm mt-1">{area.operatingHours.openTime} – {area.operatingHours.closeTime}</p>
                                        }
                                    </div>
                                )}
                                {area.capacity > 0 && (
                                    <div className="bg-card border border-border rounded-2xl p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.capacity}</p>
                                        <p className="font-bold text-sm mt-1">{area.capacity} {t.people}</p>
                                    </div>
                                )}
                            </div>

                            {area.capacity > 0 && (
                                <OccupancyBar current={area.currentOccupancy} capacity={area.capacity} />
                            )}

                            {area.amenities && area.amenities.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{t.amenities}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {area.amenities.map((a, i) => (
                                            <span key={i} className="text-xs bg-secondary px-2.5 py-1 rounded-full font-medium">{a}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {bookable(area) && (
                                <button
                                    onClick={() => setTab("book")}
                                    className="w-full py-3.5 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                                >
                                    <Calendar size={18} /> {t.book}
                                </button>
                            )}
                        </div>
                    )}

                    {tab === "book" && (
                        <BookingPanel area={area} stay={stay} property={property} lang={lang} onBooked={onBooked} />
                    )}

                    {tab === "review" && (
                        <ReviewPanel area={area} stay={stay} property={property} lang={lang} onReviewed={onReviewed} />
                    )}
                </div>
            </div>
        </div>
    );
}
