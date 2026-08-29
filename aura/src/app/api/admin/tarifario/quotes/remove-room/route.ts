// Remove UMA acomodação de um orçamento — "somos 7, não 8", a conversa mais
// comum depois da proposta enviada. Endpoint próprio (e não um PATCH livre em
// `rooms`) pela mesma razão do reorder-rooms: o servidor só aceita apagar um id
// que já existe, nada é criado nem reprecificado por aqui.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, assertPropertyAccess } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { RateService } from "@/services/rate-service";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["super_admin", "admin", "manager", "reception"] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuth([...WRITE_ROLES]);
  if (isAuthError(auth)) return auth;
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const propertyId: string | undefined = body?.propertyId || auth.staff.propertyId;
  const denied = assertPropertyAccess(auth, propertyId);
  if (denied) return denied;
  if (!propertyId) return NextResponse.json({ error: "propertyId ausente" }, { status: 400 });
  if (!body?.id || !body?.roomId) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const quote = await RateService.removeQuoteRoom(
      propertyId, String(body.id), String(body.roomId),
      { id: auth.staff.id, name: auth.staff.fullName }
    );
    return NextResponse.json({ quote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao remover a acomodação.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
