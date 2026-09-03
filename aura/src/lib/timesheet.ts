// src/lib/timesheet.ts
//
// PREVISTO × REALIZADO: confronta a escala materializada (`staff_shifts`) com o
// que o relógio registrou (`time_clock_events`, agregado em `TimeClockDay`).
//
// Puro — sem Supabase, sem fetch, sem "agora" implícito. Quem lê o banco é
// `hr-service.ts`; quem desenha é a tela.
//
// ─────────────────────────────────────────────────────────────────────────────
// A REGRA DE TOLERÂNCIA (CLT art. 58 §1º + Súmula 366 do TST)
//
// Decisão do dono: usar a da lei. Ela tem uma sutileza que quase todo sistema
// implementa errado, e é ela que este arquivo protege:
//
//   1. Variação de até CINCO minutos em CADA marcação não conta — nem como
//      atraso, nem como hora extra.
//   2. O limite do DIA é dez minutos somados.
//   3. **Se estourar os dez, conta o tempo TODO — não só o que passou de dez.**
//
// O item 3 é o que a Súmula 366 firmou: "ultrapassado esse limite, considera-se
// como extra a totalidade do tempo que exceder a jornada normal". Um sistema que
// desconta os dez e cobra o resto paga a menos, e é diferença que aparece em
// reclamatória.
//
// Isto é leitura da norma, não do código: **confirmar com a contabilidade antes
// de usar o número para pagar alguém.** O AURA é software de tratamento — a
// fonte legal do registro é o REP.

import type { TimeClockDay } from "@/types/aura";
import { minutesBetween } from "./schedule-engine";

/** Minutos de variação, em UMA marcação, que a lei manda ignorar. */
export const TOLERANCIA_POR_MARCACAO = 5;
/** Teto somado no dia. Estourou, conta tudo. */
export const TOLERANCIA_DIARIA = 10;

export type SituacaoDia =
  /** Trabalhou o previsto, dentro da tolerância. */
  | "ok"
  /** Escalado, sem nenhuma batida no dia. */
  | "falta"
  /** Entrou depois (ou saiu antes) além da tolerância. */
  | "atraso"
  /** Ficou além do previsto, acima da tolerância. */
  | "extra"
  /** Trabalhou num dia que a escala diz folga. */
  | "trabalhou_na_folga"
  /** Folga prevista e nenhuma batida — o caso normal, não é desvio. */
  | "folga"
  /** Bateu entrada e não bateu saída: não dá para dizer nada sobre o dia. */
  | "jornada_aberta"
  /** Sem escala para o dia — a pessoa não entra no confronto. */
  | "sem_escala";

export interface DiaConfrontado {
  date: string;
  situacao: SituacaoDia;

  /** Da escala. */
  previstoInicio?: string | null;
  previstoFim?: string | null;
  previstoMin: number;

  /** Do relógio. */
  realizadoInicio?: string | null;
  realizadoFim?: string | null;
  realizadoMin: number;

  /** Diferença bruta, em minutos. Positivo = trabalhou além do previsto. */
  diferencaMin: number;
  /** Minutos de atraso APÓS a tolerância. Já é zero quando tolerado. */
  atrasoMin: number;
  /** Minutos de hora extra APÓS a tolerância. */
  extraMin: number;
  /** A variação do dia coube na tolerância legal? */
  tolerado: boolean;

  /** Precisa de gente: jornada aberta, saída sem entrada. */
  pendencia: boolean;
  nota?: string;
}

export interface ResumoPeriodo {
  staffId: string;
  staffName: string;
  dias: DiaConfrontado[];
  previstoMin: number;
  realizadoMin: number;
  atrasoMin: number;
  extraMin: number;
  faltas: number;
  pendencias: number;
}

/** O par entrada/saída efetivo de um dia: a primeira entrada e a última saída. */
function extremos(dia: TimeClockDay | undefined): {
  inicio: string | null;
  fim: string | null;
  minutos: number;
  aberta: boolean;
  pendente: boolean;
} {
  if (!dia || dia.sessions.length === 0) {
    return { inicio: null, fim: null, minutos: 0, aberta: false, pendente: false };
  }
  const fechadas = dia.sessions.filter(s => s.end);
  const primeira = dia.sessions[0];
  const ultima = fechadas[fechadas.length - 1];
  return {
    inicio: primeira?.start ? hm(primeira.start.ts) : null,
    fim: ultima?.end ? hm(ultima.end.ts) : null,
    minutos: dia.minutes,
    aberta: dia.hasOpen,
    pendente: dia.hasPending,
  };
}

function hm(ts: string): string {
  // A agregação em `timeclock.ts` já acontece no fuso de quem lê; aqui só se
  // extrai HH:MM do mesmo instante, sem reconverter nada.
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Aplica a tolerância legal às variações de um dia.
 *
 * `variacoes` são os desvios em minutos de cada marcação — entrada e saída —,
 * com sinal: positivo quando a pessoa ficou mais tempo à disposição.
 */
export function aplicarTolerancia(variacoes: number[]): { tolerado: boolean; total: number } {
  const absolutos = variacoes.map(Math.abs);
  const cadaUmaCabe = absolutos.every(v => v <= TOLERANCIA_POR_MARCACAO);
  const somaCabe = absolutos.reduce((a, b) => a + b, 0) <= TOLERANCIA_DIARIA;
  const tolerado = cadaUmaCabe && somaCabe;
  // Estourou: volta o valor INTEIRO, não o excedente. É o item 3 da regra.
  return { tolerado, total: tolerado ? 0 : variacoes.reduce((a, b) => a + b, 0) };
}

/** Confronta um dia. `previsto` vem de `staff_shifts`; `realizado` do relógio. */
export function confrontarDia(
  date: string,
  previsto: { isWork: boolean; startTime?: string | null; endTime?: string | null; plannedMinutes: number } | undefined,
  realizado: TimeClockDay | undefined,
): DiaConfrontado {
  const r = extremos(realizado);
  const base = {
    date,
    previstoInicio: previsto?.startTime ?? null,
    previstoFim: previsto?.endTime ?? null,
    previstoMin: previsto?.isWork ? previsto.plannedMinutes : 0,
    realizadoInicio: r.inicio,
    realizadoFim: r.fim,
    realizadoMin: r.minutos,
    atrasoMin: 0,
    extraMin: 0,
    tolerado: true,
    pendencia: r.aberta || r.pendente,
  };

  if (!previsto) {
    return { ...base, situacao: r.minutos > 0 ? "trabalhou_na_folga" : "sem_escala", diferencaMin: r.minutos, extraMin: r.minutos, tolerado: r.minutos === 0 };
  }

  if (!previsto.isWork) {
    if (r.minutos === 0 && !r.aberta) return { ...base, situacao: "folga", diferencaMin: 0 };
    // Dia de folga trabalhado é extra INTEIRO: não há jornada normal contra a
    // qual descontar, então a tolerância não se aplica.
    return { ...base, situacao: "trabalhou_na_folga", diferencaMin: r.minutos, extraMin: r.minutos, tolerado: false };
  }

  if (r.aberta || r.pendente) {
    return { ...base, situacao: "jornada_aberta", diferencaMin: 0, nota: "Entrada sem saída — resolver antes de fechar o mês." };
  }

  if (r.minutos === 0) {
    return { ...base, situacao: "falta", diferencaMin: -previsto.plannedMinutes, atrasoMin: previsto.plannedMinutes, tolerado: false };
  }

  // As duas variações que a lei olha: a da entrada e a da saída.
  const varEntrada = previsto.startTime && r.inicio ? -minutosDeDesvio(previsto.startTime, r.inicio) : 0;
  const varSaida = previsto.endTime && r.fim ? minutosDeDesvio(previsto.endTime, r.fim) : 0;
  const { tolerado } = aplicarTolerancia([varEntrada, varSaida]);

  const diferenca = r.minutos - previsto.plannedMinutes;

  if (tolerado) {
    return { ...base, situacao: "ok", diferencaMin: diferenca, tolerado: true };
  }

  return {
    ...base,
    situacao: diferenca >= 0 ? "extra" : "atraso",
    diferencaMin: diferenca,
    extraMin: diferenca > 0 ? diferenca : 0,
    atrasoMin: diferenca < 0 ? -diferenca : 0,
    tolerado: false,
  };
}

/**
 * Desvio em minutos entre dois HH:MM do MESMO dia, com sinal.
 *
 * Não usa `minutesBetween`, que trata a volta do relógio como turno da
 * madrugada e devolveria 1.380 onde o desvio real é de -60.
 */
function minutosDeDesvio(referencia: string, real: string): number {
  const [rh, rm] = referencia.split(":").map(Number);
  const [ah, am] = real.split(":").map(Number);
  if ([rh, rm, ah, am].some(Number.isNaN)) return 0;
  return (ah * 60 + am) - (rh * 60 + rm);
}

/** Fecha o período de uma pessoa. */
export function confrontarPeriodo(
  staffId: string,
  staffName: string,
  datas: string[],
  previstoPorData: Map<string, { isWork: boolean; startTime?: string | null; endTime?: string | null; plannedMinutes: number }>,
  realizadoPorData: Map<string, TimeClockDay>,
): ResumoPeriodo {
  const dias = datas.map(d => confrontarDia(d, previstoPorData.get(d), realizadoPorData.get(d)));
  return {
    staffId,
    staffName,
    dias,
    previstoMin: dias.reduce((a, d) => a + d.previstoMin, 0),
    realizadoMin: dias.reduce((a, d) => a + d.realizadoMin, 0),
    atrasoMin: dias.reduce((a, d) => a + d.atrasoMin, 0),
    extraMin: dias.reduce((a, d) => a + d.extraMin, 0),
    faltas: dias.filter(d => d.situacao === "falta").length,
    pendencias: dias.filter(d => d.pendencia).length,
  };
}

/** `minutesBetween` fica importado para o caso de turno virando a noite. */
export { minutesBetween };
