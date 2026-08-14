// src/app/api/guest/session/route.ts
//
// BOOTSTRAP DO PORTAL DO HÓSPEDE — a estadia, o hóspede, a cabana e a propriedade.
//
// Oito telas do portal repetiam o mesmo trio pelo navegador
// (getStaysByAccessCode + getStayWithGuestAndCabin + getPropertyById), lendo
// `stays`, `guests`, `cabins` e `properties` com a chave anon. Aqui isso vira uma
// chamada só, com service-role, e a posse é o próprio código de acesso.
//
// REGRA INEGOCIÁVEL: a propriedade sai por ALLOWLIST literal de chaves (nunca
// `select('*')`). Os segredos de integração hoje vivem no cofre `property_secrets`
// (fora de `settings`), mas a allowlist é o que garante que qualquer campo sensível
// NOVO em `settings` não escape por aqui só por existir. Mesma disciplina do
// asset-public-service.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { StayService } from "@/services/stay-service";
import { SurveyService } from "@/services/survey-service";
import { clientIp, isRateLimited, logAttempt } from "@/lib/login-attempts";

export const dynamic = "force-dynamic";

/** Chaves de settings que o portal realmente lê. Nada além disto sai. */
const PUBLIC_SETTINGS_KEYS = [
  "fbSettings",
  "whatsappNumber",
  "generalPolicyText", "privacyPolicyText", "petPolicyText", "petPolicyAlert",
  "earlyCheckInMessage", "lateCheckInMessage",
  "checkInTime", "checkOutTime", "receptionStartTime", "receptionEndTime",
  "acceptsPets", "petMinWeight", "petMaxWeight",
  "mapConfig",
] as const;

function publicProperty(p: Record<string, any> | null) {
  if (!p) return null;
  const settings = (p.settings ?? {}) as Record<string, unknown>;
  const safeSettings: Record<string, unknown> = {};
  for (const k of PUBLIC_SETTINGS_KEYS) if (settings[k] !== undefined) safeSettings[k] = settings[k];
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    logoUrl: p.logoUrl ?? null,
    theme: p.theme ?? null,
    settings: safeSettings,
  };
}

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stayId = searchParams.get("stayId"); // opcional: qual estadia do grupo

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  try {
    const stays = await StayService.getStaysByAccessCode(code);
    if (!stays.length) {
      // Só código INVÁLIDO paga o custo do rate-limit — a carga por código válido
      // (toda vez que o portal recarrega) nunca toca a tabela de tentativas. Fecha o
      // brute force do código por esta rota, que ignorava a trava do login do portal.
      const ip = clientIp(req.headers);
      await logAttempt(ip, false);
      if (await isRateLimited(ip, 10)) {
        return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
      }
      await new Promise((r) => setTimeout(r, 800));
      return NextResponse.json({ error: "Código não encontrado." }, { status: 404 });
    }

    // Estadia escolhida: a pedida (se pertence ao código) ou a primeira.
    const chosen = (stayId && stays.find((s: any) => s.id === stayId)) || stays[0];

    const [full, propRes, hasSurvey, venueRes] = await Promise.all([
      StayService.getStayWithGuestAndCabin(chosen.propertyId, chosen.id),
      supabaseAdmin.from("properties").select("*").eq("id", chosen.propertyId).maybeSingle(),
      SurveyService.hasSurveyForStay(chosen.propertyId, chosen.id),
      // Salão do café: alimenta o horário e o "como chegar" da home.
      supabaseAdmin.from("structures")
        .select("id, name, operatingHours, mapPin")
        .eq("propertyId", chosen.propertyId).eq("isBreakfastVenue", true)
        .limit(1).maybeSingle(),
    ]);

    return NextResponse.json({
      stays,
      stay: full?.stay ?? chosen,
      guest: full?.guest ?? null,
      cabin: full?.cabin ?? null,
      property: publicProperty(propRes.data),
      hasSurvey,
      breakfastVenue: venueRes.data ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
