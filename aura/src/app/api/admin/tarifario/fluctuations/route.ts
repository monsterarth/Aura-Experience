// Tarifário — flutuações POR PERÍODO: um preset (settings.fluctuations)
// atribuído a um intervalo de datas, que a cotação em modo "Automática"
// aplica noite a noite. RECEPÇÃO PODE ESCREVER — é decisão do refactor
// fase 4, sustentada pela auditoria no service (toda escrita vira
// audit_log RATE_FLUCTUATION_*).
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const ROLES = ["super_admin", "admin", "manager", "reception"] as const;

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

  const { data, error } = await supabaseAdmin
    .from("rate_fluctuations")
    .select("*")
    .eq("propertyId", propertyId)
    .order("startDate");
  // Tabela ausente (migration pendente) → null, o mesmo sinal do bundle.
  return NextResponse.json({ fluctuations: error ? null : data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  const r = body?.rule;
  const mode: string = body?.mode || "strict";
  if (
    !r?.presetId ||
    !ISO_DATE.test(r?.startDate || "") || !ISO_DATE.test(r?.endDate || "") ||
    r.startDate > r.endDate ||
    !["strict", "overwrite", "fill"].includes(mode)
  ) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const result = await RateService.saveFluctuation(
      propertyId,
      {
        id: r.id || undefined,
        presetId: String(r.presetId),
        startDate: r.startDate,
        endDate: r.endDate,
      },
      mode as "strict" | "overwrite" | "fill",
      { id: auth.staff.id, name: auth.staff.fullName }
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao salvar a flutuação.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth([...ROLES]);
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
    await RateService.deleteFluctuation(propertyId, id, {
      id: auth.staff.id, name: auth.staff.fullName,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Erro ao excluir flutuação:", e);
    return NextResponse.json({ error: "Falha ao excluir a flutuação." }, { status: 500 });
  }
}
