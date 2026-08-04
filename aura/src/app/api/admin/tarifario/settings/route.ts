// Tarifário — config comercial (taxa pet, flutuações, descontos, promoções,
// links por categoria e templates de WhatsApp).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["super_admin", "admin", "manager", "reception"] as const;

export async function PUT(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  if (!propertyId || !body?.settings) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    await RateService.saveSettings(propertyId, body.settings);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Erro ao salvar config do tarifário:", e);
    return NextResponse.json({ error: "Falha ao salvar as configurações." }, { status: 500 });
  }
}
