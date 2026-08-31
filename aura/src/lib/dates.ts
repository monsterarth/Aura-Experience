// src/lib/dates.ts
//
// Datas date-only (YYYY-MM-DD, sem fuso) — o formato que estadia, tarifário e
// evento usam para comparar como string. Vivia dentro do rate-engine, o que
// obrigava wedding-service e crm-service a importar o motor de tarifas só para
// somar um dia (e, em vez disso, cada um reescreveu o `addDays`).
//
// ATENÇÃO AOS DOIS "HOJE" — eles NÃO são intercambiáveis:
//
//   todayPropertyIso()            hoje no fuso da pousada (America/Sao_Paulo).
//                                 Use em código de servidor: cron, fatura,
//                                 diária, funil. O que vale é o dia da casa,
//                                 não o do relógio de quem chamou.
//
//   todayIso() de event-dates.ts  hoje no fuso de QUEM ESTÁ OLHANDO.
//                                 Use em tela de hóspede: um evento rolando
//                                 hoje à noite não pode sumir da aba "Hoje"
//                                 porque o servidor já virou o dia.

/** Fuso da operação. Hoje só existe uma propriedade; vira config quando houver duas. */
export const PROPERTY_TZ = 'America/Sao_Paulo';

/** Meio-dia local: somar/subtrair dias nunca escorrega de dia por horário de verão. */
export function isoToDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return dateToIso(d);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((isoToDate(checkOut).getTime() - isoToDate(checkIn).getTime()) / 86400000);
}

/** Todas as noites do intervalo: [checkIn, checkOut). */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}

/** SEX/SÁB contam como fim de semana (a noite de sáb→dom vira diária de sábado). */
export function isWeekendNight(iso: string): boolean {
  const wd = isoToDate(iso).getDay();
  return wd === 5 || wd === 6;
}

export function formatDateBR(iso: string): string {
  return iso.split('-').reverse().join('/');
}

/**
 * Hoje no fuso da pousada, como YYYY-MM-DD.
 *
 * O `en-CA` é o truque que devolve ISO já formatado. Estava escrito à mão em
 * treze lugares; `toISOString().slice(0,10)` NÃO serve de substituto — das 21h
 * à meia-noite ele responde o dia seguinte.
 */
export function todayPropertyIso(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: PROPERTY_TZ });
}
