"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Send, Clock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Stay, Property, StructureReview } from "@/types/aura";
import { MapArea, MapLang } from "./types";
import { StarRating } from "./components/StarRating";

const T: Record<MapLang, Record<string, string>> = {
    pt: {
        yourRating: "Sua avaliação", comment: "Comentário (opcional)", placeholder: "Conte como foi sua experiência…",
        send: "Enviar avaliação", update: "Atualizar avaliação", sending: "Enviando…", thanks: "Obrigado pela sua avaliação!",
        noReviews: "Seja o primeiro a avaliar esta área.", selectStars: "Toque nas estrelas para avaliar.",
        error: "Erro ao enviar. Tente novamente.", pending: "Em análise pela equipe",
        privateNote: "Sua avaliação vai direto para a equipe.",
    },
    en: {
        yourRating: "Your rating", comment: "Comment (optional)", placeholder: "Tell us about your experience…",
        send: "Submit review", update: "Update review", sending: "Sending…", thanks: "Thanks for your review!",
        noReviews: "Be the first to review this area.", selectStars: "Tap the stars to rate.",
        error: "Failed to submit. Please try again.", pending: "Under team review",
        privateNote: "Your review goes straight to the team.",
    },
    es: {
        yourRating: "Tu reseña", comment: "Comentario (opcional)", placeholder: "Cuéntanos tu experiencia…",
        send: "Enviar reseña", update: "Actualizar reseña", sending: "Enviando…", thanks: "¡Gracias por tu reseña!",
        noReviews: "Sé el primero en reseñar esta área.", selectStars: "Toca las estrellas para calificar.",
        error: "Error al enviar. Inténtalo de nuevo.", pending: "En revisión por el equipo",
        privateNote: "Tu reseña va directo al equipo.",
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
    const [own, setOwn] = useState<StructureReview | null>(null);
    const [isPublic, setIsPublic] = useState(false);
    const [loading, setLoading] = useState(true);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/guest/structure-reviews?structureId=${area.id}&propertyId=${property.id}&stayId=${stay.id}`);
            const data = await res.json();
            setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
            setIsPublic(!!data?.public);
            if (data?.own) { setOwn(data.own); setRating(data.own.rating); setComment(data.own.comment || ""); }
            else setOwn(null);
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
                    rating,
                    comment: comment.trim() || undefined,
                }),
            });
            if (!res.ok) throw new Error();
            toast.success(t.thanks);
            await load();
            onReviewed?.();
        } catch {
            toast.error(t.error);
        } finally {
            setSaving(false);
        }
    };

    const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString(lang === "pt" ? "pt-BR" : lang) : "";
    const others = reviews.filter(r => r.id !== own?.id);
    const ownPending = isPublic && own?.status === "pending";

    return (
        <div className="space-y-5">
            {/* Formulário (cria ou edita a própria avaliação) */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.yourRating}</p>
                    {ownPending && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-yellow-600 bg-yellow-500/10 rounded-full px-2 py-0.5"><Clock size={11} />{t.pending}</span>
                    )}
                </div>
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
                    {saving ? t.sending : own ? t.update : t.send}
                </button>
                {!isPublic && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><ShieldCheck size={13} />{t.privateNote}</p>
                )}
            </div>

            {/* Lista pública (só quando a propriedade habilita avaliações públicas) */}
            {isPublic && (
                loading ? (
                    <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" /></div>
                ) : others.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t.noReviews}</p>
                ) : (
                    <div className="space-y-3">
                        {others.map(r => (
                            <div key={r.id} className="border-b border-border pb-3 last:border-0">
                                <div className="flex items-center justify-between">
                                    <StarRating value={r.rating} size={14} />
                                    <span className="text-[10px] text-muted-foreground">{fmtDate(r.createdAt as unknown as string)}</span>
                                </div>
                                {r.comment && <p className="text-sm text-foreground/90 mt-1.5">{r.comment}</p>}
                                {r.guestName && <p className="text-[11px] text-muted-foreground mt-1">— {r.guestName}</p>}
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
}
