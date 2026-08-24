'use server';

// Ações públicas da proposta comercial (/cotacao/<id>). Sem sessão — o id da
// proposta (uuid, não enumerável) é a única credencial. Molde:
// src/app/actions/asset-actions.ts. Validação, honeypot e as guardas de abuso
// vivem em RateQuotePublicService.

import { headers } from "next/headers";
import {
  RateQuotePublicService, type PublicIntakeInput,
} from "@/services/rate-quote-public-service";

/** Mesma leitura de IP do rate-limit do login do hóspede. */
function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim()
    || h.get("x-real-ip")
    || "unknown";
}

export async function acceptQuoteProposal(
  id: string,
  input: {
    selections: { roomId: string; categoryId: string }[];
    policyAccepted?: boolean;
    elapsedMs?: number;
    website?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const h = headers();
    const ip = clientIp(h);

    return await RateQuotePublicService.acceptQuote({
      id,
      selections: input.selections,
      policyAccepted: input.policyAccepted,
      elapsedMs: input.elapsedMs,
      website: input.website,
      ip,
      userAgent: h.get("user-agent") ?? undefined,
    });
  } catch (e) {
    console.error("[acceptQuoteProposal]", e);
    return { ok: false, error: "Não foi possível registrar o aceite." };
  }
}

/**
 * Passo 2 da proposta: o cadastro do titular ("para garantir sua reserva").
 * Só o ID da condição de pagamento vem daqui — rótulo, desconto e valor são
 * resolvidos no servidor. Validação e trava vivem no service.
 */
export async function submitQuoteIntake(
  id: string,
  input: {
    intake: PublicIntakeInput;
    elapsedMs?: number;
    website?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const h = headers();
    return await RateQuotePublicService.submitIntake({
      id,
      intake: input.intake,
      elapsedMs: input.elapsedMs,
      website: input.website,
      ip: clientIp(h),
      userAgent: h.get("user-agent") ?? undefined,
    });
  } catch (e) {
    console.error("[submitQuoteIntake]", e);
    return { ok: false, error: "Não foi possível registrar os seus dados." };
  }
}
