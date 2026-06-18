import type { SurveyTemplate } from "@/types/aura";

/* ============================================================
   Survey 2.0 — cálculo de métricas (puro, sem Supabase).
   Compartilhado entre a rota /api/guest/survey e o SurveyService.
   Para templates 'curated' deriva métricas COMPATÍVEIS com o
   dashboard atual (npsScore 0–10, averageRating, categoryRatings,
   isDetractor) + campos ricos; para 'builder' (legado) mantém o
   cálculo original baseado em questions[].
   ============================================================ */

export interface SurveyMetrics {
    npsScore?: number;
    averageRating?: number;
    categoryRatings: Record<string, number>;
    isDetractor: boolean;
    // ricos (apenas no curado)
    recommend?: "no" | "maybe" | "yes";
    overall?: number;
    highlights?: string[];
    commentShared?: boolean;
}

type Answer = { questionId: string; value: unknown };

export function computeSurveyMetrics(template: SurveyTemplate, answers: Answer[]): SurveyMetrics {
    if (template.version === "curated") {
        const val = (id: string) => answers.find(a => a.questionId === id)?.value;

        const overallRaw = Number(val("overall"));
        const overall = !isNaN(overallRaw) && overallRaw > 0 ? overallRaw : undefined;
        const recommend = (["no", "maybe", "yes"] as const).find(r => r === val("recommend"));
        const highlightsRaw = val("highlights");
        const highlights = Array.isArray(highlightsRaw) && highlightsRaw.length ? (highlightsRaw as string[]) : undefined;
        const commentShared = val("commentShared") === true ? true : undefined;

        const categoryRatings: Record<string, number> = {};
        let totalRating = 0, ratingCount = 0, isDetractor = false;

        if (overall !== undefined) { totalRating += overall; ratingCount++; if (overall <= 2) isDetractor = true; }

        for (const c of (template.config?.categories ?? [])) {
            const v = Number(val(`cat:${c.id}`));
            if (!isNaN(v) && v > 0) {
                categoryRatings[c.label] = v;     // chave = label PT (compat. com o dashboard)
                totalRating += v; ratingCount++;
                if (v <= 2) isDetractor = true;
            }
        }

        // recommend (3 opções) → npsScore mapeado p/ as faixas atuais (9–10 / 7–8 / 0–6)
        let npsScore: number | undefined;
        if (recommend === "yes") npsScore = 10;
        else if (recommend === "maybe") npsScore = 7;
        else if (recommend === "no") { npsScore = 3; isDetractor = true; }
        else if (overall !== undefined) npsScore = overall >= 4 ? 9 : overall === 3 ? 7 : 3;

        const averageRating = ratingCount > 0 ? Number((totalRating / ratingCount).toFixed(1)) : undefined;
        return { npsScore, averageRating, categoryRatings, isDetractor, recommend, overall, highlights, commentShared };
    }

    // Legado (builder) — idêntico ao cálculo histórico
    let npsScore: number | undefined;
    let totalRating = 0, ratingCount = 0, isDetractor = false;
    const categoryRatings: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    for (const ans of answers) {
        const question = template.questions?.find(q => q.id === ans.questionId);
        if (!question) continue;
        const value = Number(ans.value);
        if (question.type === "nps" && !isNaN(value)) {
            npsScore = value;
            if (value <= 6) isDetractor = true;
        }
        if (question.type === "rating" && !isNaN(value)) {
            totalRating += value; ratingCount++;
            if (value <= 2) isDetractor = true;
            const key = question.categoryName || "Geral";
            if (!categoryRatings[key]) { categoryRatings[key] = 0; categoryCounts[key] = 0; }
            categoryRatings[key] += value; categoryCounts[key] += 1;
        }
    }
    Object.keys(categoryRatings).forEach(cat => { categoryRatings[cat] = Number((categoryRatings[cat] / categoryCounts[cat]).toFixed(1)); });
    const averageRating = ratingCount > 0 ? Number((totalRating / ratingCount).toFixed(1)) : undefined;
    return { npsScore, averageRating, categoryRatings, isDetractor };
}
