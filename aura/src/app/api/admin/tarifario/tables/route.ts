// Tarifário — CRUD das tabelas de preço.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["super_admin", "admin", "manager", "reception"] as const;
const DELETE_ROLES = ["super_admin", "admin", "manager"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!body?.table?.name) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const id = await RateService.saveTable(propertyId, {
      id: body.table.id,
      name: String(body.table.name),
      prices: body.table.prices || {},
    });
    return NextResponse.json({ id });
  } catch (e) {
    console.error("Erro ao salvar tabela de preços:", e);
    return NextResponse.json({ error: "Falha ao salvar a tabela." }, { status: 500 });
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
    await RateService.deleteTable(propertyId, id, auth.staff.id, auth.staff.fullName);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Erro ao excluir tabela de preços:", e);
    return NextResponse.json({ error: "Falha ao excluir a tabela." }, { status: 500 });
  }
}
