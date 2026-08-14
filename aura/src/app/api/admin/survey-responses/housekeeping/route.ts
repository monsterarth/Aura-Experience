// src/app/api/admin/survey-responses/housekeeping/route.ts
// Quem atendeu no balcão (check-in/check-out) e quem limpou/conferiu a cabana da
// estadia avaliada. Carregado sob demanda ao abrir a ficha — não pesa a listagem.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, scopedPropertyId } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { HousekeepingService } from "@/services/housekeeping-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const auth = await requireAuth(["super_admin", "admin", "manager", "reception", "marketing", "governance"]);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

    const params = new URL(req.url).searchParams;
    const stayId = params.get("stayId");
    const propertyId = scopedPropertyId(auth, params.get("propertyId"));
    if (!stayId || !propertyId) return NextResponse.json({ error: "Missing stayId" }, { status: 400 });

    try {
        const crew = await HousekeepingService.getStayCrew(propertyId, stayId);
        return NextResponse.json(crew);
    } catch (e) {
        console.error("Erro ao buscar equipe da estadia:", e);
        return NextResponse.json({ error: "Falha ao carregar a equipe." }, { status: 500 });
    }
}
