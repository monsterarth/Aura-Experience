// Contexto do titular do lead (painel do cliente no drawer): ficha vinculada,
// nº de estadias, sugestões por telefone e cotações do cliente — numa chamada.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { CrmService } from "@/services/crm-service";

export const dynamic = "force-dynamic";

const READ_ROLES = ["super_admin", "admin", "manager", "reception"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const params = new URL(req.url).searchParams;
  const propertyId = params.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });

  const guestId = params.get("guestId");
  const phone = params.get("phone");
  const q = params.get("q");
  if (!guestId && !phone && !q) {
    return NextResponse.json({ error: "guestId, phone ou q obrigatório" }, { status: 400 });
  }

  try {
    const context = await CrmService.getClientContext(propertyId, { guestId, phone, q });
    return NextResponse.json(context);
  } catch (e) {
    console.error("Erro ao carregar contexto do cliente:", e);
    return NextResponse.json({ error: "Falha ao carregar o cliente." }, { status: 500 });
  }
}
