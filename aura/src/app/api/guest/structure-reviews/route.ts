// src/app/api/guest/structure-reviews/route.ts
// Avaliações por área (estrutura) feitas pelo hóspede no Mapa do Resort.
// GET ?structureId=&propertyId=&stayId= → reviews visíveis (moderação/visibilidade).
// POST → cria/atualiza (1 por estadia/área) — valida posse via stayId+accessCode.
// Usa supabaseAdmin (hóspede não autenticado), validando dados server-side.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "@/services/audit-service";
import type { StructureReview } from "@/types/aura";

async function isPublic(propertyId: string | null): Promise<boolean> {
    if (!propertyId || !supabaseAdmin) return false;
    const { data } = await supabaseAdmin.from("properties").select("settings").eq("id", propertyId).maybeSingle();
    return data?.settings?.areaReviews?.public === true;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const structureId = searchParams.get("structureId");
    const propertyId = searchParams.get("propertyId");
    const stayId = searchParams.get("stayId");

    if (!structureId) {
        return NextResponse.json({ error: "Missing structureId" }, { status: 400 });
    }
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
        .from("structure_reviews")
        .select("*")
        .eq("structureId", structureId)
        .order("createdAt", { ascending: false })
        .limit(50);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const all = (data || []) as StructureReview[];
    const pub = await isPublic(propertyId);
    // Público: mostra aprovadas + a própria (mesmo pendente). Privado: só a própria.
    const reviews = pub
        ? all.filter(r => r.status === "approved" || (stayId && r.stayId === stayId))
        : all.filter(r => stayId && r.stayId === stayId);
    const own = stayId ? all.find(r => r.stayId === stayId) ?? null : null;

    return NextResponse.json({ reviews, public: pub, own });
}

export async function POST(request: NextRequest) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const { propertyId, structureId, stayId, accessCode, guestId, rating, comment } = body;

    if (!propertyId || !structureId || !stayId || !accessCode || !rating) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (rating < 1 || rating > 5) {
        return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
    }

    // Valida posse: o stay precisa existir com esse accessCode e propriedade.
    const { data: stay } = await supabaseAdmin
        .from("stays")
        .select("id, guestId")
        .eq("id", stayId)
        .eq("accessCode", accessCode)
        .eq("propertyId", propertyId)
        .single();

    if (!stay) {
        return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    // Nome de exibição = primeiro nome real do hóspede (privacidade), com fallback.
    let displayName: string | null = (typeof body.guestName === "string" && body.guestName) || null;
    const realGuestId = guestId ?? stay.guestId ?? null;
    if (realGuestId) {
        const { data: g } = await supabaseAdmin.from("guests").select("fullName").eq("id", realGuestId).maybeSingle();
        if (g?.fullName) displayName = g.fullName.split(" ")[0];
    }

    const now = new Date().toISOString();

    // Dedup: 1 avaliação por estadia/área — atualiza se já existir (volta p/ moderação).
    const { data: existing } = await supabaseAdmin
        .from("structure_reviews")
        .select("id")
        .eq("stayId", stayId)
        .eq("structureId", structureId)
        .maybeSingle();

    let row: StructureReview | null = null;
    if (existing) {
        const { data, error } = await supabaseAdmin
            .from("structure_reviews")
            .update({ rating, comment: comment ?? null, guestName: displayName, status: "pending", updatedAt: now })
            .eq("id", existing.id)
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        row = data as StructureReview;
    } else {
        const { data, error } = await supabaseAdmin
            .from("structure_reviews")
            .insert({
                id: crypto.randomUUID(), propertyId, structureId, stayId,
                guestId: realGuestId, guestName: displayName, rating,
                comment: comment ?? null, status: "pending", updatedAt: now,
            })
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        row = data as StructureReview;
    }

    // Alerta à equipe em nota baixa (service recovery).
    if (rating <= 2 && row) {
        try {
            await AuditService.log({
                propertyId,
                userId: stayId,
                userName: displayName || "Hóspede",
                action: "STRUCTURE_REVIEW_LOW",
                entity: "STRUCTURE_REVIEW",
                entityId: row.id,
                details: `Avaliação baixa (${rating}★) em uma área${comment ? `: "${comment}"` : "."}`,
            });
        } catch { /* não bloqueia a avaliação */ }
    }

    return NextResponse.json(row);
}
