// src/app/api/guest/precheckin/route.ts
//
// Pré-check-in do hóspede — a ÚNICA superfície do portal que ESCREVE.
//
// Posse: o formulário é aberto por link direto (/check-in/form/<stayId>) e o
// hóspede não tem o código de acesso em mãos ali. O segredo é o próprio UUID da
// estadia, como já era antes desta rota existir. Não dá para exigir accessCode
// sem quebrar o link que sai no WhatsApp — o que MUDA aqui é que a escrita deixa
// de ser um UPDATE livre no banco e passa por allowlist de campos no servidor.
//
// O que a allowlist impede (e antes não impedia): um request forjado gravando
// status, cabinId, valores do fólio ou qualquer coluna de `guests`.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { StayService } from "@/services/stay-service";
import { Guest, Stay } from "@/types/aura";

export const dynamic = "force-dynamic";

/** Mesmas chaves da rota de sessão: o formulário lê políticas, pets e horários. */
const PUBLIC_SETTINGS_KEYS = [
  "fbSettings", "whatsappNumber",
  "generalPolicyText", "privacyPolicyText", "petPolicyText", "petPolicyAlert",
  "earlyCheckInMessage", "lateCheckInMessage",
  "checkInTime", "checkOutTime", "receptionStartTime", "receptionEndTime",
  "acceptsPets", "petMinWeight", "petMaxWeight", "maxPets",
  "acceptsPetExceptions", "petExceptionMaxPets", "petExceptionMaxWeight",
  "petExceptionPolicyText", "petExceptionAlert",
] as const;

function publicProperty(p: Record<string, any> | null) {
  if (!p) return null;
  const settings = (p.settings ?? {}) as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const k of PUBLIC_SETTINGS_KEYS) if (settings[k] !== undefined) safe[k] = settings[k];
  return { id: p.id, name: p.name, slug: p.slug, logoUrl: p.logoUrl ?? null, theme: p.theme ?? null, settings: safe };
}

/** GET ?stayId= — tudo que o formulário precisa para abrir. */
export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const stayId = new URL(req.url).searchParams.get("stayId");
  if (!stayId) return NextResponse.json({ error: "Missing stayId" }, { status: 400 });

  const propertyId = await StayService.findPropertyIdByStayId(stayId);
  if (!propertyId) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });

  const [full, propRes] = await Promise.all([
    StayService.getStayWithGuestAndCabin(propertyId, stayId),
    supabaseAdmin.from("properties").select("*").eq("id", propertyId).maybeSingle(),
  ]);
  if (!full?.stay) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });

  // Reserva de grupo: o formulário lista as cabanas do mesmo código.
  const groupStays = full.stay.accessCode
    ? await StayService.getGroupStays(full.stay.accessCode)
    : [];

  return NextResponse.json({
    propertyId,
    stay: full.stay,
    guest: full.guest,
    cabin: full.cabin,
    groupStays,
    property: publicProperty(propRes.data),
  });
}

/**
 * POST — três ações:
 *   draft         salva o rascunho enquanto o hóspede digita
 *   complete      conclui o pré-check-in (devolve o código de acesso final)
 *   accept-terms  aceite dos termos na home (exige accessCode, que a home tem)
 */
export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { action, stayId } = body ?? {};
  if (!stayId || !action) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const propertyId = await StayService.findPropertyIdByStayId(stayId);
  if (!propertyId) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });

  try {
    if (action === "draft") {
      await StayService.savePreCheckinDraft(propertyId, stayId, body.stayData ?? {}, body.guestData ?? {});
      return NextResponse.json({ ok: true });
    }

    if (action === "complete") {
      const accessCode = await StayService.completePreCheckin(
        propertyId, stayId,
        (body.stayData ?? {}) as Partial<Stay>,
        (body.guestData ?? {}) as Partial<Guest>,
      );
      return NextResponse.json({ ok: true, accessCode });
    }

    if (action === "accept-terms") {
      // Aqui dá para exigir o código: quem aceita os termos está no portal, com ele.
      const { data: stay } = await supabaseAdmin
        .from("stays").select("id, guestId, automationFlags")
        .eq("id", stayId).eq("accessCode", body.accessCode ?? "").eq("propertyId", propertyId)
        .maybeSingle();
      if (!stay) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

      await StayService.acceptGuestTerms(
        propertyId, stayId, stay.guestId || "system",
        body.guestName || "Hóspede",
        (stay.automationFlags ?? {}) as Record<string, unknown>,
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
