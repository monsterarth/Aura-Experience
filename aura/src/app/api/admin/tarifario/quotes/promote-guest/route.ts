// Tarifário — "Promover a hóspede": garante a ficha do titular do orçamento
// SEM mexer no estágio (o lead pode virar hóspede no meio da negociação).
// `guestId` vincula uma ficha EXISTENTE (match aceito na modal); `create`
// ({document, fullName, phone, email}) abre uma ficha NOVA com os dados
// conferidos. Sem nenhum dos dois, tenta o automático pelo CPF do lead.
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
  if (!body?.id) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  try {
    const create = body?.create?.document
      ? {
          document: String(body.create.document),
          fullName: String(body.create.fullName ?? ""),
          phone: body.create.phone ? String(body.create.phone) : null,
          email: body.create.email ? String(body.create.email) : null,
        }
      : null;

    const result = await RateService.ensureGuestForQuote(
      propertyId,
      String(body.id),
      { id: auth.staff.id, name: auth.staff.fullName },
      { guestId: body.guestId ? String(body.guestId) : null, create }
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error("Erro ao promover lead a hóspede:", e);
    const msg = e instanceof Error ? e.message : "Falha ao promover a hóspede.";
    // Dado inválido (CPF/nome) é erro do formulário, não do servidor.
    const bad = /CPF|nome completo|não encontrado/i.test(msg);
    return NextResponse.json({ error: msg }, { status: bad ? 400 : 500 });
  }
}
