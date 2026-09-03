// src/lib/meu-dia.ts
//
// A escala da própria pessoa, para os apps de campo.
//
// Substitui o bloco que estava copiado em cinco apps: três requisições
// (`schedules` + `schedule-overrides` + `schedule-checkpoints`) e o cálculo da
// jornada rodando no navegador, tudo para escrever "08:20 às 16:20" ou "Folga".
// Eram quinze chamadas por rodada de apps, num plano cujo egress já estourou.
//
// A data do dia NÃO é montada aqui. Os apps faziam `new Date().toISOString()`
// sobre o relógio do aparelho, e depois das 21h em BRT isso já era o dia seguinte
// em UTC — a pessoa via a escala de amanhã achando que era a de hoje. Agora quem
// decide que dia é hoje é o servidor.

import type { MeuDiaResponse } from "@/types/hr";

export type MeuDia = MeuDiaResponse;
export type MeuDiaItem = MeuDiaResponse["days"][number];

/**
 * Busca a escala da pessoa logada. Sem parâmetros, devolve só hoje.
 * Nunca lança: app de campo com a rede ruim mostra "Sem escala definida" em vez
 * de quebrar a tela de perfil inteira.
 */
export async function fetchMeuDia(from?: string, to?: string, staffId?: string): Promise<MeuDia | null> {
  try {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    // Só cargo de gestão consegue pedir a escala de outra pessoa; o servidor
    // recusa o resto com 403.
    if (staffId) p.set("staffId", staffId);
    const qs = p.toString();
    const r = await fetch(`/api/rh/meu-dia${qs ? `?${qs}` : ""}`);
    if (!r.ok) return null;
    return (await r.json()) as MeuDia;
  } catch {
    return null;
  }
}

/** A linha "08:20 às 16:20" / "Folga" / "Sem escala definida" de um dia. */
export function labelDoDia(dia: MeuDiaItem | undefined): string | null {
  return dia?.label ?? null;
}

/** A semana (segunda a domingo) que contém `ymd`, em UTC — sem passar por horário local. */
export function semanaDe(ymd: string): { from: string; to: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay();
  const segunda = t - ((dow + 6) % 7) * 86_400_000;
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: fmt(segunda), to: fmt(segunda + 6 * 86_400_000) };
}
