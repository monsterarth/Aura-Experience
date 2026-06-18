// src/app/api/admin/area-reviews/route.ts
// Moderação das avaliações de área (structure_reviews) pelo staff.
// GET: lista por propriedade (+ nome da estrutura). PATCH: muda status.
// PUT: liga/desliga a visibilidade pública (properties.settings.areaReviews.public).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ADMIN_TIER = ["super_admin", "admin", "manager"] as const;

export async function GET(req: NextRequest) {
    const auth = await requireAuth([...ADMIN_TIER]);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

    const requested = new URL(req.url).searchParams.get("propertyId");
    const propertyId = requested || auth.staff.propertyId;
    if (!propertyId) return NextResponse.json({ reviews: [], public: false });

    const [reviewsRes, propRes, structRes] = await Promise.all([
        supabaseAdmin.from("structure_reviews").select("*").eq("propertyId", propertyId).order("createdAt", { ascending: false }).limit(300),
        supabaseAdmin.from("properties").select("settings").eq("id", propertyId).maybeSingle(),
        supabaseAdmin.from("structures").select("id, name").eq("propertyId", propertyId),
    ]);

    const nameMap: Record<string, string> = {};
    for (const s of (structRes.data || []) as { id: string; name: string }[]) nameMap[s.id] = s.name;
    const reviews = (reviewsRes.data || []).map((r: Record<string, unknown>) => ({ ...r, structureName: nameMap[r.structureId as string] || (r.structureId as string) }));

    return NextResponse.json({ reviews, public: propRes.data?.settings?.areaReviews?.public === true });
}

export async function PATCH(req: NextRequest) {
    const auth = await requireAuth([...ADMIN_TIER]);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

    const { id, status } = await req.json().catch(() => ({}));
    if (!id || !["pending", "approved", "hidden"].includes(status)) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    const { error } = await supabaseAdmin
        .from("structure_reviews")
        .update({ status, updatedAt: new Date().toISOString() })
        .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
    const auth = await requireAuth([...ADMIN_TIER]);
    if (isAuthError(auth)) return auth;
    if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

    const requested = new URL(req.url).searchParams.get("propertyId");
    const propertyId = requested || auth.staff.propertyId;
    if (!propertyId) return NextResponse.json({ error: "No property" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const { data: prop } = await supabaseAdmin.from("properties").select("settings").eq("id", propertyId).maybeSingle();
    const settings = { ...(prop?.settings || {}), areaReviews: { ...(prop?.settings?.areaReviews || {}), public: !!body.public } };
    const { error } = await supabaseAdmin.from("properties").update({ settings }).eq("id", propertyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
