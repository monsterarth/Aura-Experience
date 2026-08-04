// Tarifário — contexto do orçamento para um intervalo de datas:
// disponibilidade real por categoria (cabanas × estadias) + eventos publicados.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const READ_ROLES = ["super_admin", "admin", "manager", "reception"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const url = new URL(req.url);
  const propertyId = url.searchParams.get("propertyId") || auth.staff.propertyId;
  const checkIn = url.searchParams.get("in") || "";
  const checkOut = url.searchParams.get("out") || "";

  if (!propertyId || !ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || checkIn >= checkOut) {
    return NextResponse.json({ error: "Datas inválidas" }, { status: 400 });
  }

  try {
    const context = await RateService.getQuoteContext(propertyId, checkIn, checkOut);
    return NextResponse.json(context);
  } catch (e) {
    console.error("Erro ao carregar contexto do orçamento:", e);
    return NextResponse.json({ error: "Falha ao carregar disponibilidade." }, { status: 500 });
  }
}
