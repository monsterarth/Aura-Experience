// src/app/admin/surveys/responses/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { SurveyResponse } from "@/types/aura";
import { SurveyService } from "@/services/survey-service";
import { Button } from "@/components/ui/button";
import {
    Star, TrendingUp, MessageSquare, Loader2, Inbox, Bot, Search, Sparkles,
    X, Trash2, Tag, ThumbsUp, Heart,
} from "lucide-react";

type Recommend = "yes" | "maybe" | "no";

const FACES = ["", "😞", "😕", "🙂", "😃", "🤩"];
const RECO: Record<Recommend, { label: string; emoji: string; text: string; bar: string; soft: string }> = {
    yes: { label: "Com certeza", emoji: "💚", text: "text-emerald-600", bar: "bg-emerald-500", soft: "bg-emerald-100 text-emerald-700" },
    maybe: { label: "Talvez", emoji: "😐", text: "text-yellow-600", bar: "bg-yellow-400", soft: "bg-yellow-100 text-yellow-700" },
    no: { label: "Não", emoji: "🙁", text: "text-rose-600", bar: "bg-rose-500", soft: "bg-rose-100 text-rose-700" },
};

// --- extratores tolerantes (curado + fallback legado) ---
const recommendOf = (r: SurveyResponse): Recommend | undefined => {
    const m = r.metrics || ({} as SurveyResponse["metrics"]);
    if (m.recommend) return m.recommend;
    if (typeof m.npsScore === "number") return m.npsScore >= 9 ? "yes" : m.npsScore >= 7 ? "maybe" : "no";
    return undefined;
};
const overallOf = (r: SurveyResponse): number =>
    r.metrics?.overall ?? (Number(r.answers?.find(a => a.questionId === "overall")?.value) || 0);
const highlightsOf = (r: SurveyResponse): string[] => {
    const h = r.metrics?.highlights ?? r.answers?.find(a => a.questionId === "highlights")?.value;
    return Array.isArray(h) ? (h as string[]) : [];
};
const commentOf = (r: SurveyResponse): string => {
    const c = r.answers?.find(a => a.questionId === "comment")?.value;
    if (typeof c === "string" && c.trim()) return c.trim();
    const legacy = r.answers?.find(a => a.questionId !== "recommend" && typeof a.value === "string" && a.value.trim().length > 3)?.value;
    return typeof legacy === "string" ? legacy.trim() : "";
};

export default function SurveysDashboardPage() {
    const { currentProperty: property } = useProperty();
    const { isSuperAdmin } = useAuth();

    const [responses, setResponses] = useState<SurveyResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<SurveyResponse | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Aura AI (análise sob demanda)
    const [askStartDate, setAskStartDate] = useState("");
    const [askEndDate, setAskEndDate] = useState("");
    const [askPrompt, setAskPrompt] = useState("");
    const [askAnswer, setAskAnswer] = useState<string | null>(null);
    const [askLoading, setAskLoading] = useState(false);

    useEffect(() => {
        (async () => {
            if (!property?.id) return;
            setLoading(true);
            try {
                setResponses(await SurveyService.getResponses(property.id));
            } catch (e) {
                console.error("Erro ao buscar respostas:", e);
            } finally {
                setLoading(false);
            }
        })();
    }, [property?.id]);

    const handleDelete = async (id: string) => {
        if (!confirm("Excluir esta avaliação? Isso libera a estadia para responder de novo.")) return;
        setDeletingId(id);
        try {
            const res = await fetch(`/api/admin/survey-responses?id=${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            setResponses(prev => prev.filter(r => r.id !== id));
            setSelected(prev => (prev?.id === id ? null : prev));
        } catch {
            alert("Falha ao excluir a avaliação.");
        } finally {
            setDeletingId(null);
        }
    };

    const d = useMemo(() => {
        if (!responses.length) return null;
        let yes = 0, maybe = 0, no = 0, recTotal = 0;
        let sumOverall = 0, nOverall = 0, sumRating = 0, nRating = 0, detractors = 0;
        const catAgg: Record<string, { sum: number; count: number }> = {};
        const hlAgg: Record<string, number> = {};

        responses.forEach(r => {
            const rec = recommendOf(r);
            if (rec) { recTotal++; if (rec === "yes") yes++; else if (rec === "maybe") maybe++; else no++; }
            const ov = overallOf(r);
            if (ov > 0) { sumOverall += ov; nOverall++; }
            if (typeof r.metrics?.averageRating === "number") { sumRating += r.metrics.averageRating; nRating++; }
            if (r.metrics?.isDetractor) detractors++;
            if (r.metrics?.categoryRatings) Object.entries(r.metrics.categoryRatings).forEach(([k, v]) => {
                if (!catAgg[k]) catAgg[k] = { sum: 0, count: 0 };
                catAgg[k].sum += v as number; catAgg[k].count++;
            });
            highlightsOf(r).forEach(h => { hlAgg[h] = (hlAgg[h] || 0) + 1; });
        });

        const pct = (n: number) => (recTotal ? Math.round((n / recTotal) * 100) : 0);
        return {
            total: responses.length,
            yes, maybe, no, recTotal,
            yesPerc: pct(yes), maybePerc: pct(maybe), noPerc: pct(no),
            recommendRate: pct(yes),
            avgOverall: nOverall ? sumOverall / nOverall : 0,
            avgRating: nRating ? sumRating / nRating : 0,
            detractors,
            categories: Object.entries(catAgg).map(([name, x]) => ({ name, avg: x.sum / x.count })).sort((a, b) => b.avg - a.avg),
            highlights: Object.entries(hlAgg).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
        };
    }, [responses]);

    const handleAskAI = async () => {
        if (!askStartDate || !askEndDate || !askPrompt.trim()) { alert("Preencha as datas e a pergunta."); return; }
        setAskLoading(true); setAskAnswer(null);
        const start = new Date(askStartDate); start.setHours(0, 0, 0, 0);
        const end = new Date(askEndDate); end.setHours(23, 59, 59, 999);
        const comments = responses
            .filter(r => { const dt = r.createdAt ? new Date(r.createdAt) : new Date(); return dt >= start && dt <= end; })
            .map(commentOf).filter(Boolean);
        try {
            const res = await fetch("/api/ai/ask-reviews", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: askPrompt, comments }),
            });
            const data = await res.json();
            setAskAnswer(data.error ? "Ocorreu um erro ao processar com a IA." : data.answer);
        } catch {
            setAskAnswer("Falha de conexão com os servidores da IA.");
        } finally {
            setAskLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col h-full items-center justify-center bg-muted/20">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground text-sm font-medium animate-pulse">Sincronizando avaliações…</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-muted/20 pb-20 overflow-y-auto custom-scrollbar">
            <header className="px-6 py-6 bg-background border-b sticky top-0 z-10 shadow-sm">
                <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-primary" /> Dashboard de Avaliações
                </h1>
                <p className="text-sm text-muted-foreground mt-1">Satisfação, recomendação e feedback dos hóspedes</p>
            </header>

            <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
                {!d ? (
                    <div className="flex flex-col items-center justify-center h-96 bg-background border border-dashed rounded-2xl shadow-sm text-center p-6">
                        <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4"><Inbox className="w-8 h-8" /></div>
                        <h2 className="text-xl font-bold text-foreground mb-2">Aguardando avaliações</h2>
                        <p className="text-muted-foreground max-w-md">Assim que os hóspedes responderem, o painel será preenchido.</p>
                    </div>
                ) : (
                    <>
                        {/* KPIs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4">
                            <div className="bg-background rounded-xl p-5 border shadow-sm flex flex-col relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10"><ThumbsUp className="w-16 h-16" /></div>
                                <h3 className="text-sm font-medium text-muted-foreground mb-1">Recomendariam</h3>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-4xl font-black tracking-tighter text-emerald-600">{d.recommendRate}%</span>
                                </div>
                                <div className="mt-4 text-xs text-muted-foreground">{d.yes} de {d.recTotal} responderam “Com certeza”</div>
                            </div>

                            <div className="bg-background rounded-xl p-5 border shadow-sm flex flex-col">
                                <h3 className="text-sm font-medium text-muted-foreground mb-1">Satisfação geral</h3>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-4xl font-black tracking-tighter text-foreground">{d.avgRating.toFixed(1)}</span>
                                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 mb-1" />
                                </div>
                                <div className="mt-4 text-xs text-muted-foreground">Média de estrelas (geral + categorias)</div>
                            </div>

                            <div className="bg-background rounded-xl p-5 border shadow-sm flex flex-col">
                                <h3 className="text-sm font-medium text-muted-foreground mb-1">Impressão geral</h3>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-4xl">{FACES[Math.round(d.avgOverall)] || "—"}</span>
                                    <span className="text-2xl font-black text-foreground">{d.avgOverall ? d.avgOverall.toFixed(1) : "—"}</span>
                                </div>
                                <div className="mt-4 text-xs text-muted-foreground">Primeira pergunta (faces 1–5)</div>
                            </div>

                            <div className="bg-background rounded-xl p-5 border shadow-sm flex flex-col">
                                <h3 className="text-sm font-medium text-muted-foreground mb-1">Respostas</h3>
                                <div className="flex items-baseline gap-2 mt-2">
                                    <span className="text-4xl font-black tracking-tighter text-foreground">{d.total}</span>
                                </div>
                                <div className="mt-4 text-xs font-medium">
                                    <span className={d.detractors ? "text-rose-600" : "text-muted-foreground"}>{d.detractors} detrator(es)</span>
                                </div>
                            </div>
                        </div>

                        {/* Termômetro de recomendação */}
                        <div className="bg-background rounded-xl p-5 border shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /> Recomendaria a propriedade?</h3>
                                <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{d.recTotal} respostas</span>
                            </div>
                            <div className="h-4 w-full flex rounded-full overflow-hidden bg-muted">
                                <div style={{ width: `${d.yesPerc}%` }} className="bg-emerald-500 h-full transition-all duration-700" />
                                <div style={{ width: `${d.maybePerc}%` }} className="bg-yellow-400 h-full transition-all duration-700" />
                                <div style={{ width: `${d.noPerc}%` }} className="bg-rose-500 h-full transition-all duration-700" />
                            </div>
                            <div className="flex justify-between mt-4 text-sm">
                                <span className="font-medium">{RECO.yes.emoji} {d.yesPerc}% Com certeza</span>
                                <span className="font-medium text-muted-foreground">{RECO.maybe.emoji} {d.maybePerc}% Talvez</span>
                                <span className="font-medium">{RECO.no.emoji} {d.noPerc}% Não</span>
                            </div>
                        </div>

                        {/* Categorias + Destaques */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {d.categories.length > 0 && (
                                <div className="bg-background rounded-xl p-5 border shadow-sm">
                                    <h3 className="text-base font-bold text-foreground mb-5 border-b pb-3">Desempenho por categoria</h3>
                                    <div className="space-y-4">
                                        {d.categories.map(cat => (
                                            <div key={cat.name} className="flex flex-col gap-1.5">
                                                <div className="flex justify-between items-center text-sm font-medium">
                                                    <span className="truncate pr-2 text-muted-foreground">{cat.name}</span>
                                                    <span className="flex items-center gap-1 font-bold text-foreground">{cat.avg.toFixed(1)} <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 -mt-0.5" /></span>
                                                </div>
                                                <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                                                    <div style={{ width: `${(cat.avg / 5) * 100}%` }} className={`h-full transition-all duration-700 ${cat.avg >= 4.5 ? "bg-emerald-500" : cat.avg >= 3.5 ? "bg-yellow-400" : "bg-rose-500"}`} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {d.highlights.length > 0 && (
                                <div className="bg-background rounded-xl p-5 border shadow-sm">
                                    <h3 className="text-base font-bold text-foreground mb-5 border-b pb-3 flex items-center gap-2"><Tag className="w-4 h-4 text-primary" /> Destaques mais citados</h3>
                                    <div className="space-y-3">
                                        {d.highlights.slice(0, 10).map(h => (
                                            <div key={h.label} className="flex items-center gap-3">
                                                <span className="text-sm text-foreground truncate flex-1">{h.label}</span>
                                                <div className="h-2 w-28 bg-muted rounded-full overflow-hidden">
                                                    <div style={{ width: `${(h.count / d.highlights[0].count) * 100}%` }} className="h-full bg-primary transition-all duration-700" />
                                                </div>
                                                <span className="text-xs font-bold text-muted-foreground w-6 text-right">{h.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Aura AI */}
                        <div className="bg-background rounded-2xl p-6 border shadow-sm">
                            <div className="flex items-center gap-2 mb-6"><Bot className="w-5 h-5 text-primary" /><h2 className="text-lg font-bold text-foreground">Aura AI: pergunte aos dados</h2></div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Data inicial</label>
                                    <input type="date" value={askStartDate} onChange={e => setAskStartDate(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">Data final</label>
                                    <input type="date" value={askEndDate} onChange={e => setAskEndDate(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                                </div>
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label className="text-xs font-medium text-muted-foreground">Sua pergunta</label>
                                    <div className="flex gap-2">
                                        <input type="text" placeholder="Ex: houve reclamações de barulho ou Wi-Fi?" value={askPrompt} onChange={e => setAskPrompt(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAskAI()} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                                        <Button onClick={handleAskAI} disabled={askLoading || !askPrompt} className="gap-2">{askLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Pesquisar</Button>
                                    </div>
                                </div>
                            </div>
                            {askAnswer && (
                                <div className="mt-4 bg-primary/5 border border-primary/20 rounded-xl p-5 flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5"><Sparkles className="w-4 h-4 text-primary" /></div>
                                    <div><h4 className="text-sm font-bold text-foreground mb-1">Análise da Aura AI</h4><p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{askAnswer}</p></div>
                                </div>
                            )}
                        </div>

                        {/* Mural */}
                        <div className="mt-8">
                            <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4"><MessageSquare className="w-5 h-5 text-muted-foreground" /> Mural de avaliações</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {responses.map(r => {
                                    const det = r.metrics?.isDetractor;
                                    const rec = recommendOf(r);
                                    const ov = overallOf(r);
                                    const hls = highlightsOf(r);
                                    const comment = commentOf(r);
                                    return (
                                        <div key={r.id} className={`bg-background rounded-xl border flex flex-col shadow-sm transition-all hover:shadow-md ${det ? "border-rose-500/40 bg-rose-500/5" : "border-border"}`}>
                                            <div className="p-5 pb-3 border-b border-white/5 flex justify-between items-start">
                                                <div>
                                                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                                                        Reserva {r.stayId.slice(0, 6).toUpperCase()}
                                                        {det && <span className="bg-rose-100 text-rose-700 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">Detrator</span>}
                                                    </h4>
                                                    <p className="text-xs text-muted-foreground mt-0.5">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : ""}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {ov > 0 && <span className="text-2xl" title={`Impressão geral: ${ov}/5`}>{FACES[ov]}</span>}
                                                    {rec && <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${RECO[rec].soft}`}>{RECO[rec].label}</span>}
                                                </div>
                                            </div>
                                            <div className="p-5 flex-1 flex flex-col gap-3">
                                                {hls.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {hls.slice(0, 6).map((h, i) => <span key={i} className="text-[11px] bg-muted text-foreground/80 rounded-full px-2 py-0.5">{h}</span>)}
                                                    </div>
                                                )}
                                                {comment ? (
                                                    <p className="text-sm text-foreground/90 italic leading-relaxed line-clamp-4 bg-muted/40 p-3 rounded-lg">{comment}</p>
                                                ) : hls.length === 0 ? (
                                                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-4 italic">Sem comentário.</div>
                                                ) : null}
                                            </div>
                                            <div className="p-4 pt-0 mt-auto flex items-center gap-2">
                                                <Button variant={det ? "destructive" : "secondary"} className="flex-1 h-9 text-xs font-bold" onClick={() => setSelected(r)}>Abrir avaliação</Button>
                                                {isSuperAdmin && (
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-rose-500 hover:bg-rose-500/10" disabled={deletingId === r.id} onClick={() => handleDelete(r.id)} title="Excluir (super admin)">
                                                        {deletingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </main>

            {/* Modal */}
            {selected && (() => {
                const rec = recommendOf(selected);
                const ov = overallOf(selected);
                const hls = highlightsOf(selected);
                const comment = commentOf(selected);
                const cats = selected.metrics?.categoryRatings ? Object.entries(selected.metrics.categoryRatings) : [];
                return (
                    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-background rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border overflow-hidden">
                            <div className="flex justify-between items-center p-6 bg-muted/30 border-b">
                                <div>
                                    <h2 className="text-lg font-black text-foreground">Ficha de avaliação</h2>
                                    <p className="text-sm text-muted-foreground">Reserva: {selected.stayId}</p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setSelected(null)} className="rounded-full hover:bg-muted"><X className="w-5 h-5" /></Button>
                            </div>

                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-muted/50 rounded-xl p-4 text-center">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Impressão</p>
                                        <span className="text-3xl">{ov > 0 ? FACES[ov] : "—"}</span>
                                    </div>
                                    <div className="bg-muted/50 rounded-xl p-4 text-center">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Recomenda</p>
                                        <span className={`text-sm font-black ${rec ? RECO[rec].text : "text-muted-foreground"}`}>{rec ? RECO[rec].label : "—"}</span>
                                    </div>
                                    <div className="bg-muted/50 rounded-xl p-4 text-center">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Média</p>
                                        <div className="flex items-center justify-center gap-1"><span className="text-2xl font-black text-foreground">{selected.metrics?.averageRating?.toFixed(1) ?? "—"}</span><Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /></div>
                                    </div>
                                </div>

                                {cats.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-bold border-b pb-2 mb-3">Por categoria</h3>
                                        <div className="space-y-2">
                                            {cats.map(([name, score]) => (
                                                <div key={name} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2">
                                                    <span className="text-sm text-foreground">{name}</span>
                                                    <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(s => <Star key={s} className={`w-4 h-4 ${s <= Number(score) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`} />)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {hls.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-bold border-b pb-2 mb-3">Destaques</h3>
                                        <div className="flex flex-wrap gap-2">{hls.map((h, i) => <span key={i} className="text-xs bg-primary/10 text-primary rounded-full px-3 py-1 font-medium">{h}</span>)}</div>
                                    </div>
                                )}

                                {comment && (
                                    <div>
                                        <h3 className="text-sm font-bold border-b pb-2 mb-3">Comentário</h3>
                                        <p className="text-sm text-muted-foreground italic bg-muted/30 p-4 rounded-lg leading-relaxed">{comment}</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 bg-muted/30 border-t flex justify-between items-center gap-3">
                                <span className="text-xs text-muted-foreground truncate">Enviada em {selected.createdAt ? new Date(selected.createdAt).toLocaleString("pt-BR") : ""}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    {isSuperAdmin && (
                                        <Button variant="ghost" className="h-9 gap-2 text-rose-500 hover:bg-rose-500/10" disabled={deletingId === selected.id} onClick={() => handleDelete(selected.id)}>
                                            {deletingId === selected.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Excluir
                                        </Button>
                                    )}
                                    <Button onClick={() => setSelected(null)} className="h-9 px-6">Fechar</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
