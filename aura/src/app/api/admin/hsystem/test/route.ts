// src/app/api/admin/hsystem/test/route.ts
//
// Teste de conexão com o HUNIT: valida as credenciais do cofre com duas leituras
// (portal/read + roomrate/read) e devolve os tipos de quarto para a UI de
// mapeamento. O operador nunca vê a senha — só o resultado.
import { NextRequest, NextResponse } from "next/server";
import { requirePropertyAccess, isAuthError } from "@/lib/api-auth";
import { HsystemService } from "@/services/hsystem-service";

const ROLES = ["super_admin", "admin", "manager"] as const;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId: string | undefined = body?.propertyId;
  const auth = await requirePropertyAccess(propertyId, [...ROLES]);
  if (isAuthError(auth)) return auth;

  try {
    const result = await HsystemService.testConnection(propertyId!);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
