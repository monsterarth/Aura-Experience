// src/app/api/admin/guarita/route.ts
//
// Lado administrativo do módulo Guarita: tarifa do dia, relatório do período
// (o número que substitui a reserva-fantasma no HMAX), histórico de turnos e
// gestão do cadastro de placas.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, scopedPropertyId } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { GuaritaService, todayBrt } from "@/services/guarita-service";
import { UserRole, VehicleStatus } from "@/types/aura";

export const dynamic = "force-dynamic";

const READ_ROLES: UserRole[] = ["super_admin", "admin", "manager", "reception"];
const WRITE_ROLES: UserRole[] = ["super_admin", "admin", "manager", "reception"];

export async function GET(request: NextRequest) {
  const auth = await requireAuth(READ_ROLES);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const propertyId = scopedPropertyId(auth, searchParams.get("propertyId"));
  if (!propertyId) return NextResponse.json({ error: "propertyId é obrigatório." }, { status: 400 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const today = todayBrt();
  const from = searchParams.get("from") || today.slice(0, 8) + "01";
  const to = searchParams.get("to") || today;

  try {
    const [rate, presets, report, shifts, vehicles] = await Promise.all([
      GuaritaService.getRate(propertyId, today),
      GuaritaService.getRatePresets(propertyId),
      GuaritaService.getReport(propertyId, from, to),
      GuaritaService.listShifts(propertyId, 20),
      supabaseAdmin
        .from("vehicles")
        .select("*")
        .eq("propertyId", propertyId)
        .neq("status", "normal")
        .order("updatedAt", { ascending: false })
        .limit(50)
        .then(r => r.data ?? []),
    ]);

    return NextResponse.json({ today, rate, presets, report, shifts, flaggedVehicles: vehicles });
  } catch (e) {
    console.error("[admin/guarita GET]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(WRITE_ROLES);
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => ({} as any));
  const propertyId = scopedPropertyId(auth, body?.propertyId);
  if (!propertyId) return NextResponse.json({ error: "propertyId é obrigatório." }, { status: 400 });

  const actor = { id: auth.staff.id, name: auth.staff.fullName || "Recepção" };

  try {
    if (body.action === "set_rate") {
      const rate = await GuaritaService.setRate(
        propertyId,
        body.date || todayBrt(),
        { amount: body.amount, closed: body.closed },
        actor,
      );
      return NextResponse.json({ ok: true, rate });
    }

    if (body.action === "set_vehicle_status") {
      if (!body.plate || !body.status) {
        return NextResponse.json({ error: "plate e status são obrigatórios." }, { status: 400 });
      }
      const vehicle = await GuaritaService.setVehicleStatus(
        propertyId, body.plate, body.status as VehicleStatus, body.reason ?? null, actor,
      );
      return NextResponse.json({ ok: true, vehicle });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    console.error("[admin/guarita POST]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
