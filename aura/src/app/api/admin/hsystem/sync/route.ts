// src/app/api/admin/hsystem/sync/route.ts
//
// Disparo manual da sincronização (botões da página /admin/hsystem):
//   POST { propertyId, action: "bookings" }              → busca reservas agora
//   POST { propertyId, action: "availability", force? }  → envia disponibilidade agora
// O cron externo (api/cron/hsystem-sync) faz o mesmo em ciclo; aqui é o operador.
import { NextRequest, NextResponse } from "next/server";
import { requirePropertyAccess, isAuthError } from "@/lib/api-auth";
import { HsystemService } from "@/services/hsystem-service";

const ROLES = ["super_admin", "admin", "manager"] as const;

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId: string | undefined = body?.propertyId;
  const action: string = body?.action ?? "bookings";
  const auth = await requirePropertyAccess(propertyId, [...ROLES]);
  if (isAuthError(auth)) return auth;

  try {
    if (action === "availability") {
      const result = await HsystemService.pushAvailability(propertyId!, { force: body?.force === true });
      return NextResponse.json(result);
    }
    if (action === "bookings") {
      const result = await HsystemService.syncBookings(propertyId!);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'action inválida ("bookings" | "availability").' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
