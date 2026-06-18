// src/app/api/admin/survey-responses/route.ts
// DELETE de uma resposta de pesquisa — restrito a super_admin.
// Apaga a resposta e reseta o flag da estadia (hasSurvey/npsScore),
// liberando o hóspede a responder de novo (útil para testes).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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
