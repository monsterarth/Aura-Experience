// src/app/api/guest/survey/route.ts
// Guest-facing survey API — uses supabaseAdmin to bypass RLS.
// Guests are not Supabase-authenticated users, so anon client is blocked by RLS policies.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { SurveyTemplate } from "@/types/aura";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const stayId = searchParams.get("stayId");

    if (!stayId) {
        return NextResponse.json({ error: "Missing stayId" }, { status: 400 });
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // 1. Fetch stay
    const { data: stay, error: stayError } = await supabaseAdmin
        .from("stays")
        .select("*")
        .eq("id", stayId)
        .maybeSingle();

    if (stayError || !stay) {
        return NextResponse.json({ error: "Estadia não encontrada ou link expirado." }, { status: 404 });
    }

    const propertyId = stay.propertyId;

    // Fetch guest preferred language
    let preferredLanguage: 'pt' | 'en' | 'es' = 'pt';
    if (stay.guestId) {
        const { data: guest } = await supabaseAdmin
            .from("guests")
            .select("preferredLanguage")
            .eq("id", stay.guestId)
            .maybeSingle();
        if (guest?.preferredLanguage && ['pt', 'en', 'es'].includes(guest.preferredLanguage)) {
            preferredLanguage = guest.preferredLanguage;
        }
    }

    // 2. Check if already answered
    const { count } = await supabaseAdmin
        .from("survey_responses")
        .select("id", { count: "exact", head: true })
        .eq("propertyId", propertyId)
        .eq("stayId", stayId);

    const alreadyAnswered = (count ?? 0) > 0;

    // 3. Fetch active template
    const { data: template } = await supabaseAdmin
        .from("survey_templates")
        .select("*")
        .eq("propertyId", propertyId)
        .eq("isDefault", true)
        .maybeSingle();

    return NextResponse.json({ stay, alreadyAnswered, template: template ?? null, preferredLanguage });
}

export async function POST(request: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { stayId, guestId, templateId, answers: answersRecord, propertyId } = body;

    if (!stayId || !guestId || !templateId || !answersRecord || !propertyId) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Guard: check not already answered
    const { count } = await supabaseAdmin
        .from("survey_responses")
        .select("id", { count: "exact", head: true })
        .eq("propertyId", propertyId)
        .eq("stayId", stayId);

    if ((count ?? 0) > 0) {
        return NextResponse.json({ error: "Esta pesquisa já foi respondida." }, { status: 409 });
    }

    // Fetch template to calculate metrics
    const { data: templateData } = await supabaseAdmin
        .from("survey_templates")
        .select("*")
        .eq("id", templateId)
        .maybeSingle();

    if (!templateData) {
        return NextResponse.json({ error: "Template não encontrado." }, { status: 404 });
    }

    const template = templateData as SurveyTemplate;
    const answers = Object.entries(answersRecord).map(([questionId, value]) => ({ questionId, value }));

    // Calculate metrics
    let npsScore: number | undefined = undefined;
    let totalRating = 0;
    let ratingCount = 0;
    let isDetractor = false;
    const categoryRatings: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    answers.forEach(ans => {
        const question = template.questions.find(q => q.id === ans.questionId);
        if (!question) return;

        const value = Number(ans.value);
        if (question.type === "nps" && !isNaN(value)) {
            npsScore = value;
            if (value <= 6) isDetractor = true;
        }

        if (question.type === "rating" && !isNaN(value)) {
            totalRating += value;
            ratingCount += 1;
            if (value <= 2) isDetractor = true;

            const categoryKey = question.categoryName || "Geral";
            if (!categoryRatings[categoryKey]) { categoryRatings[categoryKey] = 0; categoryCounts[categoryKey] = 0; }
            categoryRatings[categoryKey] += value;
            categoryCounts[categoryKey] += 1;
        }
    });

    Object.keys(categoryRatings).forEach(cat => {
        categoryRatings[cat] = Number((categoryRatings[cat] / categoryCounts[cat]).toFixed(1));
    });
    const averageRating = ratingCount > 0 ? Number((totalRating / ratingCount).toFixed(1)) : undefined;

    const id = crypto.randomUUID();
    const { error: insertError } = await supabaseAdmin.from("survey_responses").insert({
        id, propertyId, stayId, guestId, templateId, answers,
        metrics: { npsScore, averageRating, categoryRatings, isDetractor }
    });

    if (insertError) {
        return NextResponse.json({ error: "Falha ao enviar sua avaliação. Tente novamente." }, { status: 500 });
    }

    await supabaseAdmin
        .from("stays")
        .update({ hasSurvey: true, npsScore: npsScore ?? null })
        .eq("id", stayId);

    return NextResponse.json({ success: true });
}
