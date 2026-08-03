// src/app/api/admin/survey-responses/route.ts
// GET: respostas da pesquisa + contexto da estadia (cabana, hóspede, check-in/out).
// DELETE de uma resposta de pesquisa — restrito a super_admin.
// Apaga a resposta e reseta o flag da estadia (hasSurvey/npsScore),
// liberando o hóspede a responder de novo (útil para testes).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { SurveyService } from "@/services/survey-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const auth = await requireAuth(["super_admin", "admin", "manager", "reception", "marketing"]);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

    const requested = new URL(req.url).searchParams.get("propertyId");
    const propertyId = requested || auth.staff.propertyId;
    if (!propertyId) return NextResponse.json({ responses: [] });

    try {
        const responses = await SurveyService.getResponsesWithStay(propertyId);
        return NextResponse.json({ responses });
    } catch (e) {
        console.error("Erro ao listar respostas de pesquisa:", e);
        return NextResponse.json({ error: "Falha ao carregar as avaliações." }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const auth = await requireAuth(["super_admin"]);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data: resp } = await supabaseAdmin.from("survey_responses").select("stayId").eq("id", id).maybeSingle();

    const { error } = await supabaseAdmin.from("survey_responses").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (resp?.stayId) {
        await supabaseAdmin.from("stays").update({ hasSurvey: false, npsScore: null }).eq("id", resp.stayId);
    }
    return NextResponse.json({ success: true });
}
