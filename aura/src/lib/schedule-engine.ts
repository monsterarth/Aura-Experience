// src/lib/schedule-engine.ts
//
// O motor da escala: dado o PADRÃO de uma pessoa e uma data, diz se ela trabalha
// e em que horário. Puro — sem Supabase, sem fetch, sem `new Date()` de "agora".
// Quem materializa é `src/services/hr-service.ts`; quem desenha é a página.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE NÃO EXISTE "scheduleType" AQUI
//
// O modelo velho tratava 6x1, 5x2 e 12x36 como três valores do mesmo campo, e
// eles não são a mesma coisa:
//
//   6x1   trabalha TODO dia menos a folga fixa, e ainda folga um domingo a cada
//         quatro. Não é ciclo — é regra semanal mais uma regra periódica.
//   5x2   regra semanal: seg a sex.
//   12x36 ciclo de verdade: 1 dia sim, 1 dia não, a partir de uma âncora.
//
// Tratar os três como "tipo" foi o que obrigou o `sundayOffCycle` a existir como
// booleano pendurado, resolvendo um caso só e deixando o "Domingo Mes" virar
// texto livre num campo de motivo. Aqui há duas BASES e uma lista de REGRAS.
//
// ─────────────────────────────────────────────────────────────────────────────
// FUSO
//
// Toda conta de data acontece sobre 'YYYY-MM-DD' em UTC, nunca em horário local.
// O servidor roda em UTC e o navegador não; `new Date('2026-09-01')` e
// `new Date('2026-09-01T00:00:00')` dão dias diferentes dependendo de onde
// rodam, e foi assim que o cálculo velho virou refém de rodar no browser.

/** Regra periódica aplicada DEPOIS da base. Regra só tira dia, nunca adiciona. */
export type PatternRule =
  /** Folga fixa num dia da semana. Usada com base `cycle` (na `weekly` a folga já está fora de `weekdays`). */
  | { kind: "weekday_off"; weekday: number }
  /** "Trabalha 3 domingos, folga o 4º": a cada `everyN` ocorrências a partir da âncora, folga a de índice `index`. */
  | { kind: "nth_weekday_off"; weekday: number; everyN: number; index: number; anchor: string }
  /** "Folga o primeiro domingo do mês". `nth` negativo conta do fim (-1 = último). */
  | { kind: "monthly_weekday_off"; weekday: number; nth: number };

export type PatternBase = "none" | "weekly" | "cycle";

export interface WorkPattern {
  id: string;
  staffId: string;
  propertyId: string;
  templateId?: string | null;
  base: PatternBase;
  startTime?: string | null;
  endTime?: string | null;
  /** base `weekly`: dias trabalhados. 0=Dom … 6=Sáb. */
  weekdays?: number[] | null;
  /** base `cycle`. */
  cycleOnDays?: number | null;
  cycleOffDays?: number | null;
  cycleAnchor?: string | null;
  rules: PatternRule[];
  weekdayTimeOverrides?: Record<string, { startTime: string; endTime: string }> | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  /** Anotação de quem criou a vigência ("Rodízio com o João", "Volta de férias"). */
  note?: string | null;
}

export interface ResolvedDay {
  isWork: boolean;
  startTime?: string;
  endTime?: string;
  plannedMinutes: number;
  /** Qual regra tirou o dia — é o que a tela mostra no lugar de "Folga" seco. */
  reason?: string;
}

// ─── datas: 'YYYY-MM-DD' em UTC ──────────────────────────────────────────────

const DAY = 86_400_000;

export function parseYMD(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toYMD(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 0=Dom … 6=Sáb. */
export function dowOf(ymd: string): number {
  return new Date(parseYMD(ymd)).getUTCDay();
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseYMD(a) - parseYMD(b)) / DAY);
}

export function addDaysYMD(ymd: string, n: number): string {
  return toYMD(parseYMD(ymd) + n * DAY);
}

/** Todos os dias de um mês 'YYYY-MM'. */
export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) out.push(`${month}-${String(d).padStart(2, "0")}`);
  return out;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = parseYMD(from); t <= parseYMD(to); t += DAY) out.push(toYMD(t));
  return out;
}

/** Minutos entre dois HH:mm. Turno que vira a noite (20:30→08:30) conta certo. */
export function minutesBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 0;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff >= 0 ? diff : diff + 1440;
}

// ─── regras ──────────────────────────────────────────────────────────────────

/** Primeira data >= `from` cujo dia da semana é `weekday`. */
function firstWeekdayOnOrAfter(from: string, weekday: number): string {
  const d = dowOf(from);
  return addDaysYMD(from, (weekday - d + 7) % 7);
}

/**
 * A regra tira este dia? Devolve o motivo quando sim.
 *
 * `nth_weekday_off` reproduz de propósito a semântica do modelo velho
 * (`sundayOffCycle` em `schedule-calculator.ts`): conta as ocorrências do dia da
 * semana a partir da primeira que cai em ou depois da âncora, e folga a de
 * índice `index` dentro de cada bloco de `everyN`. Antes da âncora, não vale —
 * era assim antes e mudar isso alteraria escala já combinada.
 */
function ruleBlocks(rule: PatternRule, ymd: string): string | null {
  const dow = dowOf(ymd);

  if (rule.kind === "weekday_off") {
    return dow === rule.weekday ? "Folga fixa" : null;
  }

  if (rule.kind === "nth_weekday_off") {
    if (dow !== rule.weekday) return null;
    if (!rule.anchor || rule.everyN <= 0) return null;
    const first = firstWeekdayOnOrAfter(rule.anchor, rule.weekday);
    if (parseYMD(ymd) < parseYMD(first)) return null;
    const idx = diffDays(ymd, first) / 7;
    if (!Number.isInteger(idx)) return null;
    const pos = ((idx % rule.everyN) + rule.everyN) % rule.everyN;
    return pos === rule.index ? `Folga de ciclo (1 a cada ${rule.everyN})` : null;
  }

  if (rule.kind === "monthly_weekday_off") {
    if (dow !== rule.weekday) return null;
    const month = ymd.slice(0, 7);
    const ocorrencias = daysOfMonth(month).filter(d => dowOf(d) === rule.weekday);
    const alvo = rule.nth < 0 ? ocorrencias[ocorrencias.length + rule.nth] : ocorrencias[rule.nth - 1];
    return alvo === ymd ? "Folga do mês" : null;
  }

  return null;
}

// ─── resolução do dia ────────────────────────────────────────────────────────

const VAZIO: ResolvedDay = { isWork: false, plannedMinutes: 0 };

/** Trabalha neste dia? Só o padrão — ausência e ajuste manual entram depois. */
export function resolveDay(pattern: WorkPattern | null | undefined, ymd: string): ResolvedDay {
  if (!pattern || pattern.base === "none") {
    return { ...VAZIO, reason: pattern ? "Sem jornada fixa" : "Sem padrão" };
  }
  if (ymd < pattern.effectiveFrom) return { ...VAZIO, reason: "Fora da vigência" };
  if (pattern.effectiveTo && ymd > pattern.effectiveTo) return { ...VAZIO, reason: "Fora da vigência" };

  let trabalha = false;

  if (pattern.base === "weekly") {
    trabalha = (pattern.weekdays ?? []).includes(dowOf(ymd));
    if (!trabalha) return { ...VAZIO, reason: "Folga semanal" };
  } else {
    const on = pattern.cycleOnDays ?? 0;
    const off = pattern.cycleOffDays ?? 0;
    if (!pattern.cycleAnchor || on <= 0 || on + off <= 0) {
      return { ...VAZIO, reason: "Ciclo sem âncora" };
    }
    const periodo = on + off;
    const pos = ((diffDays(ymd, pattern.cycleAnchor) % periodo) + periodo) % periodo;
    trabalha = pos < on;
    if (!trabalha) return { ...VAZIO, reason: "Folga do ciclo" };
  }

  for (const rule of pattern.rules ?? []) {
    const motivo = ruleBlocks(rule, ymd);
    if (motivo) return { ...VAZIO, reason: motivo };
  }

  const override = pattern.weekdayTimeOverrides?.[String(dowOf(ymd))];
  const startTime = override?.startTime ?? pattern.startTime ?? undefined;
  const endTime = override?.endTime ?? pattern.endTime ?? undefined;

  return { isWork: true, startTime, endTime, plannedMinutes: minutesBetween(startTime, endTime) };
}

/** O padrão vigente numa data, entre os que a pessoa tem. */
export function patternForDate(patterns: WorkPattern[], ymd: string): WorkPattern | null {
  const validos = patterns.filter(
    p => p.effectiveFrom <= ymd && (!p.effectiveTo || p.effectiveTo >= ymd)
  );
  if (validos.length === 0) return null;
  // Mais de um vigente é dado quebrado; o mais recente vence, e o índice único
  // do banco impede que dois abertos coexistam.
  return validos.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}
