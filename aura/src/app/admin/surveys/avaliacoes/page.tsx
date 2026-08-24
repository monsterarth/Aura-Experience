// src/app/admin/surveys/avaliacoes/page.tsx
// Explorador de avaliações: pesquisas de check-out + avaliações de área numa lista só,
// com filtros, ordenação, moderação de área e exportação CSV.
// O painel (/admin/surveys/responses) resume; aqui se trabalha os dados linha a linha.
"use client";

import { PageShell, PageHeader, SkeletonList, useConfirm, Dialog } from "@/components/aura";
import { toast } from "sonner";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { SurveyResponseWithStay, SurveyTemplate } from "@/types/aura";
import { SurveyService } from "@/services/survey-service";
import { Button } from "@/components/ui/button";
import { StayCrewPanel } from "@/components/admin/StayCrewPanel";
import {
    AreaReview, Polarity, Recommend, Severity, FACES, RECO, AREA_STATUS, HL_STYLE, SEVERITY,
    recommendOf, overallOf, splitHighlights, commentOf, buildPolarityMap, sortDateOf, fmtDate,
    severityOf, severityOfRating, severityLabel, shortHighlight,
} from "@/lib/survey-view";
import {
    ArrowLeft, Star, Loader2, Search, Download, X, Trash2, Home, MapPin, ThumbsUp,
    Wrench, Tag, Check, EyeOff, Filter, RotateCcw, Inbox,
} from "lucide-react";

type Kind = "survey" | "area";

interface Row {
    id: string;
    kind: Kind;
    date: number;            // check-out (pesquisa) ou data da avaliação (área)
    dateLabel: string;
    origin: string;          // cabana ou área avaliada
    guestName?: string;
    rating: number;          // média da pesquisa ou nota da área (0 = sem nota)
    recommend?: Recommend;
    overall: number;
    severity: Severity;      // detrator (reprova) · atenção (nota baixa mas recomenda) · ok
    comment: string;
    chips: { label: string; p: Polarity }[];
    status?: string;         // só área
    survey?: SurveyResponseWithStay;
    area?: AreaReview;
    haystack: string;        // texto normalizado para a busca livre
}

const HL_GROUPS = [
    { p: "positive", icon: <ThumbsUp className="w-3.5 h-3.5" /> },
    { p: "improve", icon: <Wrench className="w-3.5 h-3.5" /> },
    { p: "unknown", icon: <Tag className="w-3.5 h-3.5" /> },
] as const;

const RATING_FILTERS: Record<string, { label: string; test: (n: number) => boolean }> = {
    all: { label: "Todas as notas", test: () => true },
    "5": { label: "Só nota 5", test: n => n >= 4.75 },
    "4+": { label: "4 ou mais", test: n => n >= 4 },
    "3-": { label: "3 ou menos", test: n => n > 0 && n <= 3 },
    "2-": { label: "Crítico (≤ 2)", test: n => n > 0 && n <= 2 },
};

const SORTS: Record<string, { label: string; cmp: (a: Row, b: Row) => number }> = {
    date_desc: { label: "Mais recente primeiro", cmp: (a, b) => b.date - a.date },
    date_asc: { label: "Mais antiga primeiro", cmp: (a, b) => a.date - b.date },
    rating_asc: { label: "Pior nota primeiro", cmp: (a, b) => (a.rating || 99) - (b.rating || 99) },
    rating_desc: { label: "Melhor nota primeiro", cmp: (a, b) => b.rating - a.rating },
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const KIND_LABEL: Record<Kind, string> = { survey: "Pesquisa", area: "Área" };

// dd/MM/yyyy → yyyy-MM-dd dos <input type="date"> comparado em ms locais
const dayStart = (v: string) => { const d = new Date(`${v}T00:00:00`); return isNaN(d.getTime()) ? null : d.getTime(); };
const dayEnd = (v: string) => { const d = new Date(`${v}T23:59:59.999`); return isNaN(d.getTime()) ? null : d.getTime(); };

function ReviewsExplorer() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { currentProperty: property } = useProperty();
  const confirm = useConfirm();
    const { isSuperAdmin } = useAuth();

    const [responses, setResponses] = useState<SurveyResponseWithStay[]>([]);
    const [areaReviews, setAreaReviews] = useState<AreaReview[]>([]);
    const [polarity, setPolarity] = useState<Map<string, Polarity>>(new Map());
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [selected, setSelected] = useState<Row | null>(null);

    // filtros
    const [q, setQ] = useState("");
    const [kind, setKind] = useState<"all" | Kind>("all");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [origin, setOrigin] = useState("all");
    const [ratingF, setRatingF] = useState("all");
    const [recoF, setRecoF] = useState<"all" | Recommend>("all");
    const [statusF, setStatusF] = useState("all");
    const [signalF, setSignalF] = useState<"all" | Severity | "alert">("all");
    const [onlyComments, setOnlyComments] = useState(false);
    const [sort, setSort] = useState("date_desc");

    const load = useCallback(async () => {
        if (!property?.id) return;
        setLoading(true);
        try {
            const [respRes, areaRes, templates] = await Promise.all([
                fetch(`/api/admin/survey-responses?propertyId=${property.id}`).then(r => (r.ok ? r.json() : { responses: [] })).catch(() => ({ responses: [] })),
                fetch(`/api/admin/area-reviews?propertyId=${property.id}`).then(r => (r.ok ? r.json() : { reviews: [] })).catch(() => ({ reviews: [] })),
                SurveyService.getTemplates(property.id).catch(() => [] as SurveyTemplate[]),
            ]);
            setResponses(Array.isArray(respRes?.responses) ? respRes.responses : []);
            setAreaReviews(Array.isArray(areaRes?.reviews) ? areaRes.reviews : []);
            setPolarity(buildPolarityMap(templates));
        } catch (e) {
            console.error("Erro ao carregar avaliações:", e);
        } finally {
            setLoading(false);
        }
    }, [property?.id]);

    useEffect(() => { load(); }, [load]);

    // ---- linhas unificadas ----
    const rows = useMemo<Row[]>(() => {
        const out: Row[] = [];

        responses.forEach(r => {
            const hl = splitHighlights(r, polarity);
            const chips: { label: string; p: Polarity }[] = [
                ...hl.positive.map(h => ({ label: h, p: "positive" as Polarity })),
                ...hl.improve.map(h => ({ label: h, p: "improve" as Polarity })),
                ...hl.unknown.map(h => ({ label: h, p: "unknown" as Polarity })),
            ];
            const comment = commentOf(r);
            const origin = r.cabinName || "Cabana não informada";
            out.push({
                id: `s-${r.id}`, kind: "survey",
                date: sortDateOf(r),
                dateLabel: r.checkOut ? fmtDate(r.checkOut as string) : fmtDate(r.createdAt as string),
                origin, guestName: r.guestName,
                rating: r.metrics?.averageRating ?? 0,
                recommend: recommendOf(r), overall: overallOf(r),
                severity: severityOf(r),
                comment, chips, survey: r,
                haystack: norm([origin, r.guestName || "", comment, chips.map(c => c.label).join(" ")].join(" ")),
            });
        });

        areaReviews.forEach(a => {
            const origin = a.structureName || "Área";
            out.push({
                id: `a-${a.id}`, kind: "area",
                date: a.createdAt ? new Date(a.createdAt).getTime() : 0,
                dateLabel: fmtDate(a.createdAt),
                origin, guestName: a.guestName,
                rating: a.rating || 0, overall: 0,
                severity: severityOfRating(a.rating || 0),
                comment: a.comment || "", chips: [],
                status: a.status || "pending", area: a,
                haystack: norm([origin, a.guestName || "", a.comment || ""].join(" ")),
            });
        });

        return out;
    }, [responses, areaReviews, polarity]);

    // opções de origem (cabanas e áreas realmente presentes nos dados)
    const originOptions = useMemo(() => {
        const cabins = new Set<string>(), areas = new Set<string>();
        rows.forEach(r => (r.kind === "survey" ? cabins : areas).add(r.origin));
        const sorted = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
        return { cabins: sorted(cabins), areas: sorted(areas) };
    }, [rows]);

    const filtered = useMemo(() => {
        const term = norm(q.trim());
        const min = from ? dayStart(from) : null;
        const max = to ? dayEnd(to) : null;
        const ratingTest = (RATING_FILTERS[ratingF] || RATING_FILTERS.all).test;

        const list = rows.filter(r => {
            if (kind !== "all" && r.kind !== kind) return false;
            if (origin !== "all" && r.origin !== origin) return false;
            if (min !== null && (!r.date || r.date < min)) return false;
            if (max !== null && (!r.date || r.date > max)) return false;
            if (ratingF !== "all" && !ratingTest(r.rating)) return false;
            if (recoF !== "all" && r.recommend !== recoF) return false;
            if (statusF !== "all" && (r.kind !== "area" || (r.status || "pending") !== statusF)) return false;
            if (signalF === "alert" ? r.severity === "ok" : signalF !== "all" && r.severity !== signalF) return false;
            if (onlyComments && !r.comment) return false;
            if (term && !r.haystack.includes(term)) return false;
            return true;
        });
        return list.sort((SORTS[sort] || SORTS.date_desc).cmp);
    }, [rows, q, kind, origin, from, to, ratingF, recoF, statusF, signalF, onlyComments, sort]);

    // Link direto de uma estadia (`?stay=`): a nota no card de "últimas saídas"
    // em /admin/stays abre a resposta desta pessoa, não a lista inteira.
    const deepLinkStay = searchParams.get("stay");
    const deepLinkDone = useRef<string | null>(null);
    useEffect(() => {
        if (!deepLinkStay || deepLinkDone.current === deepLinkStay) return;
        const match = rows.find(r => r.survey?.stayId === deepLinkStay);
        if (!match) return;
        deepLinkDone.current = deepLinkStay;
        setSelected(match);
    }, [deepLinkStay, rows]);

    // resumo do recorte filtrado — os números acompanham o filtro, não o total
    const summary = useMemo(() => {
        const rated = filtered.filter(r => r.rating > 0);
        const withReco = filtered.filter(r => r.recommend);
        return {
            total: filtered.length,
            avg: rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0,
            ratedN: rated.length,
            recommendRate: withReco.length ? Math.round((withReco.filter(r => r.recommend === "yes").length / withReco.length) * 100) : null,
            detractors: filtered.filter(r => r.severity === "detractor").length,
            attention: filtered.filter(r => r.severity === "attention").length,
            comments: filtered.filter(r => r.comment).length,
        };
    }, [filtered]);

    const activeFilters =
        (q ? 1 : 0) + (kind !== "all" ? 1 : 0) + (origin !== "all" ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0) +
        (ratingF !== "all" ? 1 : 0) + (recoF !== "all" ? 1 : 0) + (statusF !== "all" ? 1 : 0) +
        (signalF !== "all" ? 1 : 0) + (onlyComments ? 1 : 0);

    const resetFilters = () => {
        setQ(""); setKind("all"); setFrom(""); setTo(""); setOrigin("all");
        setRatingF("all"); setRecoF("all"); setStatusF("all");
        setSignalF("all"); setOnlyComments(false);
    };

    const moderate = async (row: Row, status: string) => {
        if (!row.area) return;
        setBusyId(row.id);
        try {
            const res = await fetch("/api/admin/area-reviews", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: row.area.id, status }),
            });
            if (!res.ok) throw new Error();
            setAreaReviews(rs => rs.map(a => (a.id === row.area!.id ? { ...a, status } : a)));
            setSelected(s => (s && s.id === row.id ? { ...s, status } : s));
        } catch {
            toast.error("Falha ao moderar a avaliação.");
        } finally {
            setBusyId(null);
        }
    };

    const removeSurvey = async (row: Row) => {
        if (!row.survey) return;
        if (!(await confirm({ title: "Excluir esta avaliação?", description: "Isso libera a estadia para responder de novo.", confirmLabel: "Confirmar", tone: "danger" }))) return;
        setBusyId(row.id);
        try {
            const res = await fetch(`/api/admin/survey-responses?id=${row.survey.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            setResponses(rs => rs.filter(r => r.id !== row.survey!.id));
            setSelected(s => (s && s.id === row.id ? null : s));
        } catch {
            toast.error("Falha ao excluir a avaliação.");
        } finally {
            setBusyId(null);
        }
    };

    // CSV do recorte filtrado (";" + BOM para abrir direto no Excel pt-BR)
    const exportCsv = () => {
        const head = ["Tipo", "Origem", "Hóspede", "Data", "Nota", "Impressão", "Recomenda", "Sinal", "Elogios", "A melhorar", "Comentário", "Status"];
        const cell = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = filtered.map(r => [
            KIND_LABEL[r.kind], r.origin, r.guestName || "", r.dateLabel,
            r.rating ? r.rating.toFixed(1).replace(".", ",") : "",
            r.overall || "", r.recommend ? RECO[r.recommend].label : "", severityLabel(r.severity, r.kind),
            r.chips.filter(c => c.p === "positive").map(c => c.label).join(" | "),
            r.chips.filter(c => c.p === "improve").map(c => c.label).join(" | "),
            r.comment.replace(/\s+/g, " "),
            r.kind === "area" ? (AREA_STATUS[r.status || "pending"]?.label ?? "") : "",
        ].map(cell).join(";"));

        const csv = "﻿" + [head.map(cell).join(";"), ...lines].join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `avaliacoes-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const Stars = ({ n, size = "w-3.5 h-3.5" }: { n: number; size?: string }) => (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(s => <Star key={s} className={`${size} ${s <= Math.round(n) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/25"}`} />)}
        </div>
    );

    return (
        <PageShell>
            <PageHeader
              icon={Star}
              title="Todas as avaliações"
              subtitle="Pesquisas de check-out e avaliações de área — filtre, ordene e exporte."
              back={{ onClick: () => router.push("/admin/surveys/responses") }}
              actions={(<><Button variant="outline" className="gap-2 shadow-sm" onClick={exportCsv} disabled={!filtered.length}>
                    <Download className="w-4 h-4" /> Exportar CSV ({filtered.length})
                </Button></>)}
            />

            <div className="space-y-5">
                {/* Filtros */}
                <section className="bg-background border rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Filter className="w-4 h-4 text-primary" /> Filtros
                            {activeFilters > 0 && <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{activeFilters} ativo(s)</span>}
                        </h2>
                        {activeFilters > 0 && (
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={resetFilters}>
                                <RotateCcw className="w-3.5 h-3.5" /> Limpar
                            </Button>
                        )}
                    </div>

                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            className="field-input pl-9"
                            placeholder="Buscar em comentários, destaques, cabana, área ou hóspede…"
                            value={q} onChange={e => setQ(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        <div>
                            <label className="field-label">Tipo</label>
                            <select className="field-input" value={kind} onChange={e => setKind(e.target.value as "all" | Kind)}>
                                <option value="all">Pesquisas + áreas</option>
                                <option value="survey">Só pesquisas</option>
                                <option value="area">Só áreas</option>
                            </select>
                        </div>
                        <div>
                            <label className="field-label">Origem</label>
                            <select className="field-input" value={origin} onChange={e => setOrigin(e.target.value)}>
                                <option value="all">Todas</option>
                                {originOptions.cabins.length > 0 && (
                                    <optgroup label="Cabanas">
                                        {originOptions.cabins.map(c => <option key={`c-${c}`} value={c}>{c}</option>)}
                                    </optgroup>
                                )}
                                {originOptions.areas.length > 0 && (
                                    <optgroup label="Áreas">
                                        {originOptions.areas.map(a => <option key={`a-${a}`} value={a}>{a}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                        <div>
                            <label className="field-label">De (saída / avaliação)</label>
                            <input type="date" className="field-input" value={from} onChange={e => setFrom(e.target.value)} />
                        </div>
                        <div>
                            <label className="field-label">Até</label>
                            <input type="date" className="field-input" value={to} onChange={e => setTo(e.target.value)} />
                        </div>
                        <div>
                            <label className="field-label">Nota</label>
                            <select className="field-input" value={ratingF} onChange={e => setRatingF(e.target.value)}>
                                {Object.entries(RATING_FILTERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="field-label">Recomendação</label>
                            <select className="field-input" value={recoF} onChange={e => setRecoF(e.target.value as "all" | Recommend)}>
                                <option value="all">Qualquer</option>
                                <option value="yes">Com certeza</option>
                                <option value="maybe">Talvez</option>
                                <option value="no">Não recomendaria</option>
                            </select>
                        </div>
                        <div>
                            <label className="field-label">Moderação (áreas)</label>
                            <select className="field-input" value={statusF} onChange={e => setStatusF(e.target.value)}>
                                <option value="all">Qualquer</option>
                                <option value="pending">Pendente</option>
                                <option value="approved">Aprovada</option>
                                <option value="hidden">Oculta</option>
                            </select>
                        </div>
                        <div>
                            <label className="field-label">Sinal</label>
                            <select className="field-input" value={signalF} onChange={e => setSignalF(e.target.value as "all" | Severity | "alert")}>
                                <option value="all">Qualquer</option>
                                <option value="alert">Detrator ou atenção</option>
                                <option value="detractor">Só detratores</option>
                                <option value="attention">Só atenção</option>
                                <option value="ok">Sem alerta</option>
                            </select>
                        </div>
                        <div>
                            <label className="field-label">Ordenar por</label>
                            <select className="field-input" value={sort} onChange={e => setSort(e.target.value)}>
                                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            onClick={() => setOnlyComments(v => !v)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${onlyComments ? "bg-primary/10 text-primary border-primary/40" : "border-border text-muted-foreground hover:bg-muted"}`}
                        >Só com comentário</button>
                    </div>
                </section>

                {/* Resumo do recorte */}
                <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                        { label: "Avaliações", value: String(summary.total), hint: `${rows.length} no total` },
                        { label: "Nota média", value: summary.avg ? summary.avg.toFixed(1) : "—", hint: `${summary.ratedN} com nota` },
                        { label: "Recomendariam", value: summary.recommendRate === null ? "—" : `${summary.recommendRate}%`, hint: "entre as pesquisas" },
                        { label: "Detratores", value: String(summary.detractors), hint: `não recomenda ou carinha ≤ 2 · ${summary.attention} em atenção` },
                        { label: "Com comentário", value: String(summary.comments), hint: "texto livre" },
                    ].map(k => (
                        <div key={k.label} className="bg-background border rounded-xl p-4 shadow-sm">
                            <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
                            <p className="text-2xl font-black tracking-tighter text-foreground mt-1">{k.value}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">{k.hint}</p>
                        </div>
                    ))}
                </section>

                {/* Lista */}
                {loading ? (
                    <SkeletonList rows={4} avatar={false} />
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-background border border-dashed rounded-2xl text-center">
                        <Inbox className="w-10 h-10 text-muted-foreground/40 mb-3" />
                        <p className="font-bold text-foreground">Nenhuma avaliação neste recorte</p>
                        <p className="text-sm text-muted-foreground mt-1">{rows.length ? "Ajuste ou limpe os filtros." : "Assim que os hóspedes responderem, elas aparecem aqui."}</p>
                    </div>
                ) : (
                    <div className="bg-background border rounded-2xl shadow-sm divide-y overflow-hidden">
                        {filtered.map(r => (
                            <div key={r.id} className={`p-4 flex flex-col md:flex-row md:items-center gap-3 hover:bg-muted/40 transition-colors ${r.severity !== "ok" ? `border-l-4 ${SEVERITY[r.severity].accent}` : ""}`}>
                                {/* identificação */}
                                <div className="md:w-64 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${r.kind === "survey" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{KIND_LABEL[r.kind]}</span>
                                        {r.severity !== "ok" && <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${SEVERITY[r.severity].chip}`}>{severityLabel(r.severity, r.kind)}</span>}
                                        {r.kind === "area" && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${AREA_STATUS[r.status || "pending"].cls}`}>{AREA_STATUS[r.status || "pending"].label}</span>}
                                    </div>
                                    <p className="text-sm font-bold text-foreground mt-1.5 flex items-center gap-1.5 truncate">
                                        {r.kind === "survey" ? <Home className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                                        {r.origin}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {r.kind === "survey" ? "Saída" : "Avaliada"} {r.dateLabel || "—"}{r.guestName ? ` · ${r.guestName}` : ""}
                                    </p>
                                </div>

                                {/* notas */}
                                <div className="md:w-44 flex items-center gap-2 shrink-0">
                                    {r.rating > 0 ? (
                                        <>
                                            <Stars n={r.rating} />
                                            <span className="text-sm font-bold text-foreground">{r.rating.toFixed(1)}</span>
                                        </>
                                    ) : <span className="text-xs text-muted-foreground">Sem nota</span>}
                                    {r.overall > 0 && <span className="text-lg leading-none">{FACES[r.overall]}</span>}
                                </div>

                                {/* recomendação */}
                                <div className="md:w-28 shrink-0">
                                    {r.recommend && <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${RECO[r.recommend].soft}`}>{RECO[r.recommend].label}</span>}
                                </div>

                                {/* conteúdo */}
                                <div className="flex-1 min-w-0">
                                    {r.chips.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-1">
                                            {r.chips.slice(0, 4).map((c, i) => (
                                                <span key={i} title={c.label} className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${HL_STYLE[c.p].chip}`}>
                                                    {c.p === "improve" ? "▾ " : c.p === "positive" ? "▴ " : ""}{shortHighlight(c.label, 40)}
                                                </span>
                                            ))}
                                            {r.chips.length > 4 && <span className="text-[10px] text-muted-foreground self-center">+{r.chips.length - 4}</span>}
                                        </div>
                                    )}
                                    <p className={`text-sm line-clamp-2 ${r.comment ? "text-foreground/85 italic" : "text-muted-foreground/60"}`}>
                                        {r.comment || "Sem comentário."}
                                    </p>
                                </div>

                                {/* ações */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {r.kind === "area" && (r.status || "pending") !== "approved" && (
                                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-emerald-600" disabled={busyId === r.id} onClick={() => moderate(r, "approved")}>
                                            {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aprovar
                                        </Button>
                                    )}
                                    {r.kind === "area" && (r.status || "pending") !== "hidden" && (
                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" title="Ocultar" disabled={busyId === r.id} onClick={() => moderate(r, "hidden")}>
                                            <EyeOff className="w-3.5 h-3.5" />
                                        </Button>
                                    )}
                                    <Button size="sm" variant="secondary" className="h-8 text-xs font-bold" onClick={() => setSelected(r)}>Abrir</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Ficha */}
            {selected && (
                <Dialog open onClose={() => setSelected(null)} presentation="auto" size="lg" title={<>{selected.origin}</>} subtitle={<>{KIND_LABEL[selected.kind]} · {selected.kind === "survey" ? "saída" : "avaliada"} {selected.dateLabel || "—"}
                                    {selected.guestName ? ` · ${selected.guestName}` : ""}{selected.survey?.checkIn && selected.survey?.checkOut && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Estadia {fmtDate(selected.survey.checkIn as string)} → {fmtDate(selected.survey.checkOut as string)}
                                    </p>
                                )}</>}>
                    <div className="space-y-6">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-muted/50 rounded-xl p-4 text-center">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Impressão</p>
                                    <span className="text-3xl">{selected.overall > 0 ? FACES[selected.overall] : "—"}</span>
                                </div>
                                <div className="bg-muted/50 rounded-xl p-4 text-center">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Recomenda</p>
                                    <span className={`text-sm font-black ${selected.recommend ? RECO[selected.recommend].text : "text-muted-foreground"}`}>{selected.recommend ? RECO[selected.recommend].label : "—"}</span>
                                </div>
                                <div className="bg-muted/50 rounded-xl p-4 text-center">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Nota</p>
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="text-2xl font-black text-foreground">{selected.rating ? selected.rating.toFixed(1) : "—"}</span>
                                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                    </div>
                                </div>
                            </div>

                            {selected.survey?.metrics?.categoryRatings && Object.keys(selected.survey.metrics.categoryRatings).length > 0 && (
                                <div>
                                    <h3 className="text-sm font-bold border-b pb-2 mb-3">Por categoria</h3>
                                    <div className="space-y-2">
                                        {Object.entries(selected.survey.metrics.categoryRatings).map(([name, score]) => (
                                            <div key={name} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2">
                                                <span className="text-sm text-foreground">{name}</span>
                                                <Stars n={Number(score)} size="w-4 h-4" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selected.chips.length > 0 && (
                                <div className="space-y-4">
                                    {HL_GROUPS.map(g => {
                                        const list = selected.chips.filter(c => c.p === g.p), st = HL_STYLE[g.p];
                                        if (!list.length) return null;
                                        return (
                                            <div key={g.p}>
                                                <h3 className={`text-sm font-bold border-b pb-2 mb-3 flex items-center gap-2 ${st.text}`}>{g.icon} {st.full}</h3>
                                                <div className="flex flex-wrap gap-2">
                                                    {list.map((c, i) => <span key={i} className={`text-xs rounded-full px-3 py-1 font-medium ${st.chip}`}>{c.label}</span>)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {selected.comment && (
                                <div>
                                    <h3 className="text-sm font-bold border-b pb-2 mb-3">Comentário</h3>
                                    <p className="text-sm text-muted-foreground italic bg-muted/30 p-4 rounded-lg leading-relaxed whitespace-pre-wrap">{selected.comment}</p>
                                </div>
                            )}

                            {selected.kind === "survey" && <StayCrewPanel stayId={selected.survey?.stayId} propertyId={property?.id} />}
                        </div>

                        <div className="p-4 bg-muted/30 border-t flex justify-between items-center gap-3">
                            <span className="text-xs text-muted-foreground truncate">
                                {selected.survey?.createdAt ? `Enviada em ${new Date(selected.survey.createdAt as string).toLocaleString("pt-BR")}` : selected.area?.createdAt ? `Enviada em ${new Date(selected.area.createdAt).toLocaleString("pt-BR")}` : ""}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                                {selected.kind === "area" && (selected.status || "pending") !== "approved" && (
                                    <Button variant="outline" className="h-9 gap-2 text-emerald-600" disabled={busyId === selected.id} onClick={() => moderate(selected, "approved")}>
                                        <Check className="w-4 h-4" /> Aprovar
                                    </Button>
                                )}
                                {selected.kind === "area" && (selected.status || "pending") !== "hidden" && (
                                    <Button variant="ghost" className="h-9 gap-2 text-muted-foreground" disabled={busyId === selected.id} onClick={() => moderate(selected, "hidden")}>
                                        <EyeOff className="w-4 h-4" /> Ocultar
                                    </Button>
                                )}
                                {selected.kind === "survey" && isSuperAdmin && (
                                    <Button variant="ghost" className="h-9 gap-2 text-rose-500 hover:bg-rose-500/10" disabled={busyId === selected.id} onClick={() => removeSurvey(selected)}>
                                        {busyId === selected.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Excluir
                                    </Button>
                                )}
                                <Button onClick={() => setSelected(null)} className="h-9 px-6">Fechar</Button>
                            </div>
                        </div>
                </Dialog>
            )}
        </PageShell>
    );
}

export default function AllReviewsPage() {
    return (
        <RoleGuard allowedRoles={["super_admin", "admin", "manager", "reception", "marketing"]}>
            <ReviewsExplorer />
        </RoleGuard>
    );
}
