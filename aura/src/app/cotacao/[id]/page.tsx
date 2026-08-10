// src/app/cotacao/[id]/page.tsx
//
// A PROPOSTA. URL pública que o vendedor manda para o cliente: ele vê as
// cabanas oferecidas para cada acomodação, escolhe e aceita — e isso volta
// para o CRM (timeline + alarme na fila de hoje da recepção).
//
// Server component, molde do /p/[code]: sem sessão, sem waterfall. O que sai
// é exatamente PublicQuoteView — sem CPF, sem valor negociado, sem a régua de
// desconto interna. Ver rate-quote-public-service.ts.
import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { RateQuotePublicService } from "@/services/rate-quote-public-service";
import { getPortalThemeVars } from "@/app/check-in/[code]/_portal/theme";
import { Property } from "@/types/aura";
import ProposalClient from "./ProposalClient";

export const dynamic = "force-dynamic";

/** Uma proposta jamais deve entrar num índice de busca. */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const quote = await RateQuotePublicService.getPublicQuote(params.id);
  return {
    title: quote ? `Sua proposta · ${quote.property.name}` : "Proposta",
    robots: { index: false, follow: false },
  };
}

export default async function CotacaoPage({ params }: { params: { id: string } }) {
  const quote = await RateQuotePublicService.getPublicQuote(params.id);
  // Id inválido, proposta fechada e proposta vencida dão a MESMA resposta —
  // um palpite não pode distinguir "não existe" de "existe mas fechou".
  if (!quote) notFound();

  const themeVars = getPortalThemeVars({
    theme: quote.property.theme,
  } as unknown as Property);

  return (
    <main style={{
      ...themeVars,
      fontFamily: "var(--font-portal-body), system-ui, sans-serif",
      background: "var(--bg)",
      color: "var(--ink)",
      minHeight: "100dvh",
    }}>
      <ProposalClient quote={quote} />
    </main>
  );
}
