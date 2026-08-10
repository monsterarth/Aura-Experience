// Tarifário — linha do tempo de versões de uma tabela de preços (o arquivo).
// Leitura para os mesmos papéis da página; migration pendente = lista vazia.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const READ_ROLES = ["super_admin", "admin", "manager", "reception"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAuth([...READ_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const url = new URL(req.url);
  const tableId = url.searchParams.get("tableId");
  const propertyId = url.searchParams.get("propertyId") || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!tableId) return NextResponse.json({ error: "tableId ausente" }, { status: 400 });

  const versions = await RateService.listTableVersions(propertyId, tableId);
  return NextResponse.json({ versions });
}
