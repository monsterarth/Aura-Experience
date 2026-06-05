"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Stay, Property, StructureReview } from "@/types/aura";
import { MapArea, MapLang } from "./types";
import { StarRating } from "./components/StarRating";

const T: Record<MapLang, Record<string, string>> = {
    pt: {
        yourRating: "Sua avaliação", comment: "Comentário (opcional)", placeholder: "Conte como foi sua experiência…",
        send: "Enviar avaliação", sending: "Enviando…", thanks: "Obrigado pela sua avaliação!",
        noReviews: "Seja o primeiro a avaliar esta área.", selectStars: "Toque nas estrelas para avaliar.",
        error: "Erro ao enviar. Tente novamente.",
    },
    en: {
        yourRating: "Your rating", comment: "Comment (optional)", placeholder: "Tell us about your experience…",
        send: "Submit review", sending: "Sending…", thanks: "Thanks for your review!",
        noReviews: "Be the first to review this area.", selectStars: "Tap the stars to rate.",
        error: "Failed to submit. Please try again.",
    },
    es: {
        yourRating: "Tu reseña", comment: "Comentario (opcional)", placeholder: "Cuéntanos tu experiencia…",
        send: "Enviar reseña", sending: "Enviando…", thanks: "¡Gracias por tu reseña!",
        noReviews: "Sé el primero en reseñar esta área.", selectStars: "Toca las estrellas para calificar.",
        error: "Error al enviar. Inténtalo de nuevo.",
    },
};

interface ReviewPanelProps {
    area: MapArea;
    stay: Stay;
    property: Property;
    lang: MapLang;
    onReviewed?: () => void;
}

export function ReviewPanel({ area, stay, property, lang, onReviewed }: ReviewPanelProps) {
    const t = T[lang];
    const [reviews, setReviews] = useState<StructureReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/guest/structure-reviews?structureId=${area.id}`);
            const data = await res.json();
            setReviews(Array.isArray(data) ? data : []);
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [area.id]);

    const submit = async () => {
        if (rating < 1) return;
        setSaving(true);
        try {
            const res = await fetch("/api/guest/structure-reviews", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    propertyId: property.id,
                    structureId: area.id,
                    stayId: stay.id,
                    accessCode: stay.accessCode,
                    guestId: stay.guestId,
                    guestName: "Hóspede",
                    rating,
                    comment: comment.trim() || undefined,
                }),
            });
            if (!res.ok) throw new Error();
            toast.success(t.thanks);
            setRating(0);
            setComment("");
            await load();
            onReviewed?.();
        } catch {
            toast.error(t.error);
        } finally {
            setSaving(false);
        }
    };

    const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString(lang === "pt" ? "pt-BR" : lang) : "";

    return (
        <div className="space-y-5">
            {/* Formulário */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.yourRating}</p>
                <StarRating value={rating} onChange={setRating} size={28} />
                {rating === 0 && <p className="text-xs text-muted-foreground">{t.selectStars}</p>}
                <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder={t.placeholder}
                    className="w-full bg-background border border-border rounded-xl p-3 text-sm outline-none focus:border-primary/50 resize-none h-20"
                />
                <button
                    onClick={submit}
                    disabled={rating < 1 || saving}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                    {saving ? t.sending : t.send}
                </button>
            </div>

            {/* Lista */}
            {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" /></div>
            ) : reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t.noReviews}</p>
            ) : (
                <div className="space-y-3">
                    {reviews.map(r => (
                        <div key={r.id} className="border-b border-border pb-3 last:border-0">
                            <div className="flex items-center justify-between">
                                <StarRating value={r.rating} size={14} />
                                <span className="text-[10px] text-muted-foreground">{fmtDate(r.createdAt as any)}</span>
                            </div>
                            {r.comment && <p className="text-sm text-foreground/90 mt-1.5">{r.comment}</p>}
                            {r.guestName && <p className="text-[11px] text-muted-foreground mt-1">— {r.guestName}</p>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
