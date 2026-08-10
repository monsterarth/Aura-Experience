// Tarifário — regras de calendário, com resolução de conflito no padrão do
// SIT: strict (detecta e devolve), overwrite (sobrepõe) e fill (preenche vazios).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

// Regras de calendário são de gestão — recepção consulta, não escreve
// (refactor fase 4; flutuações têm rota própria onde recepção PODE).
const WRITE_ROLES = ["super_admin", "admin", "manager"] as const;
const DELETE_ROLES = ["super_admin", "admin", "manager"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  const p = body?.period;
  const mode: string = body?.mode || "strict";

  if (
    !p?.name ||
    !ISO_DATE.test(p?.startDate || "") || !ISO_DATE.test(p?.endDate || "") ||
    p.startDate > p.endDate ||
    !["strict", "overwrite", "fill"].includes(mode)
  ) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const result = await RateService.savePeriod(
      propertyId,
      {
        id: p.id || undefined,
        name: String(p.name),
        startDate: p.startDate,
        endDate: p.endDate,
        minNights: parseInt(String(p.minNights), 10) || 1,
        weekdayTableId: p.weekdayTableId || null,
        weekendTableId: p.weekendTableId || null,
      },
      mode as "strict" | "overwrite" | "fill"
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error("Erro ao salvar regra de calendário:", e);
    return NextResponse.json({ error: "Falha ao salvar a regra." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth([...DELETE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const propertyId = url.searchParams.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!id) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    await RateService.deletePeriod(propertyId, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Erro ao excluir regra de calendário:", e);
    return NextResponse.json({ error: "Falha ao excluir a regra." }, { status: 500 });
  }
}
