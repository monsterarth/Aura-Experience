// Helpers para o horário de check-in/check-out das estadias.
//
// Tudo opera em horário LOCAL do navegador — consistente com o restante do app:
// o StayDetailsModal (formatDateForInput/parseDateFromInput) e o Portal do Hóspede
// renderizam datas via date-fns / toLocale* em horário local. A hora-do-dia gravada
// em `stays.checkIn` / `stays.checkOut` representa o horário previsto (política da
// propriedade no momento da criação, ajustável depois caso a caso).

/** Horários padrão usados quando a propriedade não tem política configurada. */
export const DEFAULT_CHECK_IN_TIME = "14:00";
export const DEFAULT_CHECK_OUT_TIME = "12:00";

/** "HH:MM" → [horas, minutos] válidos, ou null se inválido. */
function parseHHMM(hhmm?: string | null): [number, number] | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return [h, min];
}

/** Nova Date com a hora-do-dia (local) ajustada para `hhmm`, mantendo ano/mês/dia.
 *  Usa `fallback` quando `hhmm` é inválido. */
export function applyTimeToDate(date: Date, hhmm?: string | null, fallback = DEFAULT_CHECK_OUT_TIME): Date {
  const [h, m] = parseHHMM(hhmm) ?? parseHHMM(fallback) ?? [12, 0];
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Extrai "HH:MM" (local) de um timestamp; "" se ausente ou inválido. */
export function extractTimeHHMM(timestamp: unknown): string {
  if (!timestamp) return "";
  const d = new Date(timestamp as string | number | Date);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Combina "YYYY-MM-DD" + "HH:MM" (local) em uma ISO string. null se `dateStr` vazio. */
export function combineDateAndTimeISO(dateStr: string, timeStr?: string | null, fallbackTime = DEFAULT_CHECK_OUT_TIME): string | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  const [h, m] = parseHHMM(timeStr) ?? parseHHMM(fallbackTime) ?? [12, 0];
  const d = new Date();
  d.setFullYear(year, month - 1, day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
