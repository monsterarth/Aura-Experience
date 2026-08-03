// src/lib/survey-view.ts
// Leitura das avaliações (pesquisa curada + áreas do mapa) para as telas de admin.
// Puro: extratores tolerantes a respostas antigas + paleta compartilhada.
// Usado por /admin/surveys/responses (painel) e /admin/surveys/avaliacoes (explorador).
import type { SurveyResponse, SurveyResponseWithStay, SurveyTemplate } from "@/types/aura";

export type Recommend = "yes" | "maybe" | "no";
export type Polarity = "positive" | "improve" | "unknown";

// Avaliação de área (structure_reviews) como a API /api/admin/area-reviews devolve.
export interface AreaReview {
    id: string; structureId: string; structureName?: string; rating: number;
    comment?: string; guestName?: string; status?: string; createdAt?: string;
}

export const FACES = ["", "😞", "😕", "🙂", "😃", "🤩"];

export const RECO: Record<Recommend, { label: string; emoji: string; text: string; bar: string; soft: string }> = {
    yes: { label: "Com certeza", emoji: "💚", text: "text-emerald-600", bar: "bg-emerald-500", soft: "bg-emerald-100 text-emerald-700" },
    maybe: { label: "Talvez", emoji: "😐", text: "text-yellow-600", bar: "bg-yellow-400", soft: "bg-yellow-100 text-yellow-700" },
    no: { label: "Não", emoji: "🙁", text: "text-rose-600", bar: "bg-rose-500", soft: "bg-rose-100 text-rose-700" },
};

export const AREA_STATUS: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendente", cls: "bg-yellow-100 text-yellow-700" },
    approved: { label: "Aprovada", cls: "bg-emerald-100 text-emerald-700" },
    hidden: { label: "Oculta", cls: "bg-muted text-muted-foreground" },
};

// Estilo por polaridade do destaque — elogio nunca pode parecer crítica (e vice-versa).
export const HL_STYLE = {
    positive: { title: "Elogios", full: "O que mais gostou", text: "text-emerald-600", bar: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-600" },
    improve: { title: "A melhorar", full: "O que podemos melhorar", text: "text-rose-600", bar: "bg-rose-500", chip: "bg-rose-500/10 text-rose-600" },
    unknown: { title: "Outros", full: "Outros destaques", text: "text-muted-foreground", bar: "bg-muted-foreground/40", chip: "bg-muted text-foreground/80" },
} as const;

// --- gravidade da avaliação ---
// Detrator é só quem reprova de fato: disse que NÃO recomendaria, ou marcou carinha
// abaixo do neutro (1–2). Nota baixa em algum item com recomendação positiva vira
// "atenção" (laranja): chamar de detrator quem recomendaria "com certeza" é falso e
// endurece a leitura de quem cuida do hóspede.
export type Severity = "detractor" | "attention" | "ok";

export const SEVERITY: Record<Severity, { label: string; chip: string; card: string; accent: string; text: string }> = {
    detractor: { label: "Detrator", chip: "bg-rose-100 text-rose-700", card: "border-rose-500/40 bg-rose-500/5", accent: "border-l-rose-500", text: "text-rose-600" },
    attention: { label: "Atenção", chip: "bg-orange-100 text-orange-700", card: "border-orange-500/40 bg-orange-500/5", accent: "border-l-orange-500", text: "text-orange-600" },
    ok: { label: "", chip: "", card: "border-border", accent: "", text: "" },
};

export const severityOf = (r: SurveyResponse): Severity => {
    const rec = recommendOf(r);
    const ov = overallOf(r);
    if (rec === "no" || (ov > 0 && ov <= 2)) return "detractor";
    const avg = r.metrics?.averageRating;
    const weak = !!r.metrics?.isDetractor || (typeof avg === "number" && avg > 0 && avg <= 3);
    return weak ? "attention" : "ok";
};

// Avaliação de área não tem recomendação: a própria nota é o sinal.
export const severityOfRating = (n: number): Severity => (n > 0 && n <= 2 ? "detractor" : n === 3 ? "attention" : "ok");

// "Detrator" só faz sentido para o hóspede; numa área a leitura é a nota.
export const severityLabel = (sev: Severity, kind: "survey" | "area" = "survey"): string =>
    sev === "ok" ? "" : kind === "area" ? (sev === "detractor" ? "Nota baixa" : "Atenção") : SEVERITY[sev].label;

// Destaque é rótulo: o que passou do limite (respostas antigas) some no meio do card.
export const shortHighlight = (label: string, max = 48) =>
    label.length > max ? `${label.slice(0, max - 1).trimEnd()}…` : label;

export const scoreColor = (a: number) => (a >= 4.5 ? "text-emerald-600" : a >= 3.5 ? "text-yellow-600" : "text-rose-600");
export const barColor = (a: number) => (a >= 4.5 ? "bg-emerald-500" : a >= 3.5 ? "bg-yellow-400" : "bg-rose-500");

// --- extratores tolerantes (curado + fallback legado) ---
export const recommendOf = (r: SurveyResponse): Recommend | undefined => {
    const m = r.metrics || ({} as SurveyResponse["metrics"]);
    if (m.recommend) return m.recommend;
    if (typeof m.npsScore === "number") return m.npsScore >= 9 ? "yes" : m.npsScore >= 7 ? "maybe" : "no";
    return undefined;
};

export const overallOf = (r: SurveyResponse): number =>
    r.metrics?.overall ?? (Number(r.answers?.find(a => a.questionId === "overall")?.value) || 0);

export const commentOf = (r: SurveyResponse): string => {
    const c = r.answers?.find(a => a.questionId === "comment")?.value;
    if (typeof c === "string" && c.trim()) return c.trim();
    const legacy = r.answers?.find(a => a.questionId !== "recommend" && typeof a.value === "string" && a.value.trim().length > 3)?.value;
    return typeof legacy === "string" ? legacy.trim() : "";
};

export interface SplitHighlights { positive: string[]; improve: string[]; unknown: string[]; all: string[] }

export const normLabel = (s: string) => s.trim().toLowerCase();

// Destaques têm polaridade: os chips vêm de dois grupos ("o que mais gostou" x "o que
// podemos melhorar"). Respostas antigas gravaram só a união, então reclassificamos pelo
// label usando os templates da propriedade; texto livre ("Outro") fica sem polaridade.
export const splitHighlights = (r: SurveyResponse, polarity: Map<string, Polarity>): SplitHighlights => {
    const m = r.metrics || ({} as SurveyResponse["metrics"]);
    const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
    const ans = (id: string) => r.answers?.find(a => a.questionId === id)?.value;
    const positive = arr(m.highlightsPositive ?? ans("highlightsPositive"));
    const improve = arr(m.highlightsImprove ?? ans("highlightsImprove"));
    const all = arr(m.highlights ?? ans("highlights"));

    // Resposta nova: a polaridade já veio gravada.
    if (positive.length || improve.length) {
        const known = new Set([...positive, ...improve]);
        return { positive, improve, unknown: all.filter(h => !known.has(h)), all: all.length ? all : [...positive, ...improve] };
    }
    // Resposta antiga (união): reclassifica pelo template.
    const out: SplitHighlights = { positive: [], improve: [], unknown: [], all };
    all.forEach(h => out[polarity.get(normLabel(h)) ?? "unknown"].push(h));
    return out;
};

// Mapa label → polaridade a partir de TODOS os templates da propriedade (cobre respostas
// antigas). "improve" por último: se um label existir nos dois grupos, vale o negativo.
export const buildPolarityMap = (templates: SurveyTemplate[]): Map<string, Polarity> => {
    const map = new Map<string, Polarity>();
    const feed = (chips: { label: string; label_en?: string; label_es?: string }[] | undefined, p: Polarity) =>
        (chips ?? []).forEach(c => [c?.label, c?.label_en, c?.label_es].forEach(l => { if (l) map.set(normLabel(l), p); }));
    templates.forEach(t => feed(t.config?.highlights?.positive, "positive"));
    templates.forEach(t => feed(t.config?.highlights?.improve, "improve"));
    return map;
};

// Data que ordena a pesquisa: o check-out é o que o gestor procura ("quem saiu ontem").
// Cai para o envio quando a estadia não veio junto (resposta órfã / estadia apagada).
export const sortDateOf = (r: SurveyResponseWithStay): number => {
    const raw = r.checkOut || r.createdAt;
    const t = raw ? new Date(raw as string).getTime() : 0;
    return isNaN(t) ? 0 : t;
};

export const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");
