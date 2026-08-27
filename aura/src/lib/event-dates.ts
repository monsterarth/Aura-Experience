// src/lib/event-dates.ts
//
// Datas de evento — semântica date-only (YYYY-MM-DD) comparada como string, a
// mesma do resto do sistema (estadias, tarifário). Um evento cobre o intervalo
// fechado [startDate, endDate]; `endDate` nulo/vazio é evento de um dia só.
//
// Existe porque o multi-dia estava quebrado em cinco lugares, cada um com uma
// regra própria: a listagem do portal filtrava `.gte(startDate)` (evento em
// curso sumia no dia 2), a agenda do dia filtrava `.eq(startDate)` (sumia em
// todos os dias do meio), e o calendário do admin marcava só o primeiro e o
// último dia. Um evento de 31/12 a 02/01 simplesmente não existia no dia 1º.

/** Formato date-only aceito. Serve como validação de entrada de rota. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && ISO_DATE.test(v);
}

type DateRange = { startDate: string; endDate?: string | null };

/**
 * Data no fuso de QUEM ESTÁ OLHANDO, como YYYY-MM-DD.
 *
 * `new Date().toISOString().slice(0,10)` devolve a data em UTC: das 21h à
 * meia-noite no horário de Brasília ele já responde "amanhã", e o evento
 * acontecendo naquela noite sumia da aba "Hoje" justamente enquanto rolava.
 */
export function localIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hoje, no fuso do dispositivo. */
export function todayIso(): string {
  return localIso(new Date());
}

/** Último dia coberto. `endDate` vazio ou nulo = evento de um dia. */
export function eventEnd(e: DateRange): string {
  return e.endDate || e.startDate;
}

/** O evento cobre este dia? */
export function eventSpansDay(e: DateRange, day: string): boolean {
  return e.startDate <= day && eventEnd(e) >= day;
}

/** O evento cruza o intervalo [from, to], ambos inclusivos? */
export function eventOverlaps(e: DateRange, from: string, to: string): boolean {
  return e.startDate <= to && eventEnd(e) >= from;
}

/**
 * Dias (YYYY-MM-DD) cobertos pelo evento DENTRO do mês `prefix` (YYYY-MM).
 * Recortado ao mês, então a volta é de no máximo 31 iterações — evento com
 * `endDate` absurdo no banco não vira laço longo na renderização.
 */
export function eventDaysInMonth(e: DateRange, prefix: string): string[] {
  const [y, m] = prefix.split("-").map(Number);
  if (!y || !m) return [];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthStart = `${prefix}-01`;
  const monthEnd = `${prefix}-${String(lastDay).padStart(2, "0")}`;

  const from = e.startDate > monthStart ? e.startDate : monthStart;
  const to = eventEnd(e) < monthEnd ? eventEnd(e) : monthEnd;
  if (from > to) return [];

  const days: string[] = [];
  // Meio-dia UTC: a soma de dias nunca escorrega para o dia anterior por fuso.
  for (const d = new Date(`${from}T12:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > to) break;
    days.push(iso);
  }
  return days;
}

/**
 * Filtro PostgREST para "o evento ainda não tinha terminado em `from`".
 * Combine com `.lte('startDate', to)` quando houver limite superior.
 *
 * O argumento de `.or()` é montado por interpolação — a API do PostgREST não
 * parametriza essa string —, então `from` PRECISA ser data validada. Entrada
 * inválida devolve `null` para o chamador responder 400, em vez de consultar
 * com um filtro que o cliente conseguiu reescrever.
 */
export function notEndedBefore(from: string): string | null {
  if (!isIsoDate(from)) return null;
  return `endDate.gte.${from},and(endDate.is.null,startDate.gte.${from})`;
}
