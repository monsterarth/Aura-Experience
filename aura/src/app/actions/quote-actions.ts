'use server';

// Ações públicas da proposta comercial (/cotacao/<id>). Sem sessão — o id da
// proposta (uuid, não enumerável) é a única credencial. Molde:
// src/app/actions/asset-actions.ts. Validação, honeypot e as guardas de abuso
// vivem em RateQuotePublicService.

import { headers } from "next/headers";
import { RateQuotePublicService } from "@/services/rate-quote-public-service";

export async function acceptQuoteProposal(
  id: string,
  input: {
    selections: { roomId: string; categoryId: string }[];
    elapsedMs?: number;
    website?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Mesma leitura de IP do rate-limit do login do hóspede.
    const h = headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim()
      || h.get("x-real-ip")
      || "unknown";

    return await RateQuotePublicService.acceptQuote({
      id,
      selections: input.selections,
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
