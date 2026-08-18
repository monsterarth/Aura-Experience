// src/app/casamento/[code]/page.tsx
//
// O SITE DOS NOIVOS. URL pública que vai no convite: o convidado entra com o
// código de 6 dígitos e simula a hospedagem do fim de semana do evento; os
// noivos, com o código deles, veem ocupação e personalizam a página.
//
// Server component, molde do /cotacao/[id]: sem sessão, sem waterfall.
// O que sai é exatamente PublicWeddingSite — allowlist campo a campo em
// wedding-site-service.ts. Código inválido, site desligado, casamento não
// confirmado e módulo desativado dão a MESMA resposta (notFound).
import React from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { WeddingSiteService } from "@/services/wedding-site-service";
import { clientIp, isRateLimited, logAttempt } from "@/lib/login-attempts";
import { getPortalThemeVars } from "@/app/check-in/[code]/_portal/theme";
import { Property } from "@/types/aura";
import SiteClient from "../_site/SiteClient";

export const dynamic = "force-dynamic";

// Teto de MISSES por IP na página: o código de 6 dígitos é enumerável, e o
// 404-vs-200 desta rota seria um oráculo grátis sem estrangulamento (as rotas
// /api/wedding-site/* já pagam login_attempts). Só código INVÁLIDO conta — um
// convidado com código real nunca é barrado. Folga alta para não travar quem
// erra a URL algumas vezes; mesmo assim inviabiliza varrer o espaço.
const PAGE_MISS_MAX = 30;

/** Página de convite jamais deve entrar num índice de busca. */
export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const site = await WeddingSiteService.getPublicSite(params.code);
  return {
    title: site ? `${site.bride} & ${site.groom} · ${site.property.name}` : "Casamento",
    robots: { index: false, follow: false },
  };
}

export default async function CasamentoPage({ params }: { params: { code: string } }) {
  const ip = clientIp(headers());
  // IP que já estourou o teto de misses some no notFound antes de qualquer
  // consulta — não é oráculo nem carga de banco para um scanner.
  if (await isRateLimited(ip, PAGE_MISS_MAX)) notFound();

  const site = await WeddingSiteService.getPublicSite(params.code);
  if (!site) {
    await logAttempt(ip, false);
    notFound();
  }

  // Painel dos noivos precisa da ocupação — só o coupleCode resolve overview.
  const overview = site.role === "couple"
    ? await WeddingSiteService.getCoupleOverview(params.code)
    : null;

  // Tema camaleão: as cores do casal entram POR DENTRO do theme da propriedade
  // antes da derivação — assim brand-deep/brand-soft/etc. saem consistentes.
  const baseTheme = (site.property.theme ?? {}) as { colors?: Record<string, string> };
  const c = site.config.colors;
  const mergedTheme = {
    ...baseTheme,
    colors: {
      ...(baseTheme.colors ?? {}),
      ...(c?.primary ? { primary: c.primary } : {}),
      ...(c?.background ? { background: c.background } : {}),
      ...(c?.surface ? { surface: c.surface } : {}),
    },
  };
  const themeVars = getPortalThemeVars({ theme: mergedTheme } as unknown as Property);

  return (
    <main style={{
      ...themeVars,
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      background: "var(--bg)",
      color: "var(--ink)",
      minHeight: "100dvh",
    }}>
      <SiteClient code={params.code} site={site} overview={overview} />
    </main>
  );
}
