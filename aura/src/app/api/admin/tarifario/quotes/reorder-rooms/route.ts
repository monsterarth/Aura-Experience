// Reordena as acomodações de um orçamento — a ordem que o cliente lê na
// proposta pública e na mensagem. Endpoint próprio (e não um PATCH livre em
// `rooms`) porque o servidor só aceita uma PERMUTAÇÃO dos ids que já existem:
// nada é criado, removido nem reprecificado por aqui.
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
  if (!body?.id || !Array.isArray(body?.roomIds) || body.roomIds.length === 0) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  try {
    const quote = await RateService.reorderQuoteRooms(
      propertyId, String(body.id), body.roomIds.map(String),
      { id: auth.staff.id, name: auth.staff.fullName }
    );
    return NextResponse.json({ quote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao reordenar as acomodações.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
