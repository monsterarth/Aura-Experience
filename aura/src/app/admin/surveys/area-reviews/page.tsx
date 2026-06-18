"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Star, Check, EyeOff, MapPin, Globe, Lock } from "lucide-react";

interface AdminReview {
    id: string; structureId: string; structureName?: string; rating: number;
    comment?: string; guestName?: string; status?: string; createdAt?: string;
}

const STATUS_BADGE: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
    approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    hidden: "bg-muted text-muted-foreground border-border",
};
const STATUS_LABEL: Record<string, string> = { pending: "Pendente", approved: "Aprovada", hidden: "Oculta" };

export default function AreaReviewsModerationPage() {
    const router = useRouter();
    const { currentProperty: property } = useProperty();
    const [reviews, setReviews] = useState<AdminReview[]>([]);
    const [isPublic, setIsPublic] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!property?.id) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/area-reviews?propertyId=${property.id}`);
            const data = await res.json();
            setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
            setIsPublic(!!data?.public);
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    }, [property?.id]);

    useEffect(() => { load(); }, [load]);

    const moderate = async (id: string, status: string) => {
        setBusy(id);
        try {
            await fetch("/api/admin/area-reviews", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
            setReviews((rs) => rs.map((r) => r.id === id ? { ...r, status } : r));
        } finally { setBusy(null); }
    };

    const togglePublic = async () => {
        if (!property?.id) return;
        const next = !isPublic;
        setIsPublic(next);
        await fetch(`/api/admin/area-reviews?propertyId=${property.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ public: next }) });
    };

    const pending = reviews.filter((r) => (r.status || "pending") === "pending");
    const rest = reviews.filter((r) => (r.status || "pending") !== "pending");

    const Row = ({ r }: { r: AdminReview }) => (
        <div className="bg-background border rounded-xl p-4 flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm truncate">{r.structureName}</span>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_BADGE[r.status || "pending"]}`}>{STATUS_LABEL[r.status || "pending"]}</span>
            </div>
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-4 h-4 ${i <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />)}
            </div>
            {r.comment && <p className="text-sm text-foreground/90">{r.comment}</p>}
            <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground">{r.guestName ? `— ${r.guestName}` : ""} {r.createdAt ? `· ${new Date(r.createdAt).toLocaleDateString("pt-BR")}` : ""}</span>
                <div className="flex items-center gap-2">
                    {(r.status || "pending") !== "approved" && (
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-emerald-600" disabled={busy === r.id} onClick={() => moderate(r.id, "approved")}>
                            {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aprovar
                        </Button>
                    )}
                    {(r.status || "pending") !== "hidden" && (
                        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground" disabled={busy === r.id} onClick={() => moderate(r.id, "hidden")}>
                            <EyeOff className="w-3.5 h-3.5" /> Ocultar
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-muted/20 pb-20">
            <header className="flex items-center justify-between px-6 py-5 bg-background border-b sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/admin/surveys")}><ArrowLeft className="w-5 h-5" /></Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Star className="w-5 h-5 text-primary" />Avaliações de áreas</h1>
                        <p className="text-sm text-muted-foreground mt-1">Modere as avaliações que os hóspedes deixam nas áreas do mapa.</p>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
                {/* Visibilidade pública */}
                <div className="bg-background border rounded-xl p-5 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        {isPublic ? <Globe className="w-5 h-5 text-emerald-600 mt-0.5" /> : <Lock className="w-5 h-5 text-muted-foreground mt-0.5" />}
                        <div>
                            <h2 className="font-bold text-foreground">Exibir avaliações publicamente</h2>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {isPublic
                                    ? "Os hóspedes veem as avaliações APROVADAS (média/nota) no mapa. Novas avaliações ficam pendentes até você aprovar."
                                    : "Privado: as avaliações vão só para a equipe; nada aparece para outros hóspedes no mapa."}
                            </p>
                        </div>
                    </div>
                    <button onClick={togglePublic} className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${isPublic ? "bg-emerald-500" : "bg-muted-foreground/30"}`}>
                        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${isPublic ? "left-6" : "left-1"}`} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                ) : reviews.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground"><Star className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Nenhuma avaliação de área ainda.</p></div>
                ) : (
                    <>
                        {pending.length > 0 && (
                            <section className="space-y-3">
                                <h3 className="text-xs font-black uppercase tracking-widest text-foreground/60">Pendentes ({pending.length})</h3>
                                {pending.map((r) => <Row key={r.id} r={r} />)}
                            </section>
                        )}
                        {rest.length > 0 && (
                            <section className="space-y-3">
                                <h3 className="text-xs font-black uppercase tracking-widest text-foreground/60">Moderadas</h3>
                                {rest.map((r) => <Row key={r.id} r={r} />)}
                            </section>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
