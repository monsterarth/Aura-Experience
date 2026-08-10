// Marketing — descontos manuais e promoções automáticas do tarifário.
// Rota PRÓPRIA (não a /tarifario/settings) de propósito: o papel `marketing`
// ganha exatamente estes dois blocos, sem herdar templates/taxas, e a
// whitelist aqui garante que nada além de {discounts, promos} passa.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";
import { AuditService } from "@/services/audit-service";
import { RateDiscount, RatePromo } from "@/types/aura";

export const dynamic = "force-dynamic";

const ROLES = ["super_admin", "admin", "manager", "marketing"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const url = new URL(req.url);
  const propertyId = url.searchParams.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  const { settings } = await RateService.getRateData(propertyId);
  return NextResponse.json({ discounts: settings.discounts, promos: settings.promos });
}

/** Valida e normaliza — item malformado é descartado, não persiste lixo. */
function cleanDiscounts(raw: unknown): RateDiscount[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is RateDiscount => !!d && typeof d === "object")
    .map((d) => ({
      id: String(d.id || crypto.randomUUID()),
      name: String(d.name || "").trim(),
      pct: Number(d.pct),
    }))
    .filter((d) => d.name && Number.isFinite(d.pct));
}

function cleanPromos(raw: unknown): RatePromo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is RatePromo => !!p && typeof p === "object")
    .map((p) => ({
      id: String(p.id || crypto.randomUUID()),
      name: String(p.name || "").trim(),
      pct: Number(p.pct),
      startDate: String(p.startDate || ""),
      endDate: String(p.endDate || ""),
      minNights: Math.max(1, parseInt(String(p.minNights), 10) || 1),
      dayType: (["all", "fds", "week"].includes(String(p.dayType)) ? p.dayType : "all") as RatePromo["dayType"],
    }))
    .filter((p) =>
      p.name && Number.isFinite(p.pct) &&
      ISO_DATE.test(p.startDate) && ISO_DATE.test(p.endDate) && p.startDate <= p.endDate
    );
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  const settings = body?.settings ?? {};
  const clean: { discounts?: RateDiscount[]; promos?: RatePromo[] } = {};
  if ("discounts" in settings) clean.discounts = cleanDiscounts(settings.discounts);
  if ("promos" in settings) clean.promos = cleanPromos(settings.promos);
  if (Object.keys(clean).length === 0) {
    return NextResponse.json({ error: "Nada para salvar" }, { status: 400 });
  }

  try {
    await RateService.saveSettings(propertyId, clean);
    await AuditService.log({
      propertyId, userId: auth.staff.id, userName: auth.staff.fullName,
      action: "UPDATE", entity: "RATE_SETTINGS", entityId: propertyId,
      details: `Marketing atualizou ${[
        clean.discounts ? `descontos (${clean.discounts.length})` : null,
        clean.promos ? `promoções (${clean.promos.length})` : null,
      ].filter(Boolean).join(" e ")}.`,
    });
    return NextResponse.json({ success: true, ...clean });
  } catch (e) {
    console.error("Erro ao salvar descontos/promoções:", e);
    return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  }
}
