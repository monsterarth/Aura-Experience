// src/lib/structure-release.ts
//
// Regra única da liberação diária de estrutura — quando a área ainda está fechada
// e quão alto o sistema deve falar sobre isso.
//
// Por que existe: a trava `requiresDailyRelease` + `releasedForDate` estava
// reimplementada em quatro lugares (agenda do admin, AreaRow e BookingPanel do
// portal, rota /api/guest/structure-bookings), cada um com sua própria noção de
// "hoje". Agora todos leem daqui.
//
// O número que motivou o alerta (medido em produção, 06/06→05/09/2026): em 92
// dias, 43 tiveram hóspede na casa e a jacuzzi nunca foi liberada — nenhum deles
// por manutenção. E as 14 reservas de hóspede do período caíram TODAS em dia
// liberado: nos 43 dias esquecidos ninguém pediu, porque a área simplesmente não
// existia no portal. O prejuízo não deixa rastro, então precisa de alarme.
//
// Isomórfico de propósito: o sino (browser) e o cron do push (servidor) precisam
// da MESMA resposta. Uma segunda cópia da regra é como o push acaba avisando de
// área que o sino já considera liberada.

import type { Structure } from "@/types/aura";

/** Quanto antes da abertura da área o alerta nasce no sino. */
export const RELEASE_WARN_LEAD_MINUTES = 30;

/**
 * `warn`   — falta pouco para abrir e ninguém liberou: aparece no sino, sem campainha.
 * `urgent` — a área já deveria estar aberta e continua fechada: card fixo + campainha.
 * `none`   — não se aplica, já foi liberada, está fora de operação, ou o dia dela já passou.
 */
export type ReleaseAlertLevel = "none" | "warn" | "urgent";

/** Fuso da operação — mesmo de `@/lib/dates`, repetido aqui para o módulo não puxar o motor de datas. */
const PROPERTY_TZ = "America/Sao_Paulo";

/** Só o que a regra precisa ler — aceita a `Structure` inteira ou o recorte do portal. */
export type ReleasableStructure = Pick<
  Structure,
  "requiresDailyRelease" | "releasedForDate" | "operatingHours" | "units" | "unitStatus" | "outOfService"
>;

/** "HH:mm" → minutos desde a meia-noite. Formato inválido devolve null. */
export function hhmmToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Hoje (YYYY-MM-DD) e o minuto do dia, ambos no fuso da operação. */
export function nowInProperty(now: Date = new Date()): { today: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PROPERTY_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  // hourCycle h23 pode devolver "24" na virada; normaliza para 0.
  const hour = Number(get("hour")) % 24;
  return {
    today: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
  };
}

/**
 * Esta unidade está fora de operação? Regra única lida pela agenda do admin, pelo
 * portal e pela rota que grava a reserva. Segue reexportada de
 * `@/services/structure-service` (onde nasceu) para não quebrar os call sites.
 */
export function isUnitInMaintenance(
  unitStatus: Structure["unitStatus"] | null | undefined,
  unitId?: string | null,
): boolean {
  if (!unitId) return false;
  return unitStatus?.[unitId]?.status === "maintenance";
}

/** A estrutura inteira está fora de operação (persistente, até alguém devolver). */
export function isStructureOutOfService(s: Pick<Structure, "outOfService">): boolean {
  return s.outOfService?.status === "maintenance";
}

/** Toda unidade cadastrada está fora de operação — a área não tem o que agendar. */
export function areAllUnitsDown(s: Pick<Structure, "units" | "unitStatus">): boolean {
  const units = s.units ?? [];
  if (units.length === 0) return false;
  return units.every(u => isUnitInMaintenance(s.unitStatus, u.id));
}

/** Nada a agendar nesta área agora — por estrutura inteira ou por todas as unidades. */
export function isFullyOutOfService(
  s: Pick<Structure, "outOfService" | "units" | "unitStatus">,
): boolean {
  return isStructureOutOfService(s) || areAllUnitsDown(s);
}

/** Fechada ao hóspede agora: exige liberação diária e ninguém liberou para esta data. */
export function isAwaitingRelease(s: ReleasableStructure, today: string): boolean {
  return !!s.requiresDailyRelease && s.releasedForDate !== today;
}

/**
 * Quão alto avisar que a área continua fechada.
 *
 * Escada decidida com o fundador em 05/09/2026: 30 min antes de abrir só o sino;
 * ao bater o horário de abertura com a área ainda bloqueada, a situação agrava e
 * vira card de urgência. Depois que a área fecha o alerta some — cobrar liberação
 * às 22h de uma área que fechou às 20h é ruído, e ruído diário é como um canal
 * de alarme morre (foi o que obrigou o WhatsApp a sair do badge do sino).
 *
 * Área fora de operação (estrutura inteira ou todas as unidades) nunca alerta:
 * não há o que liberar.
 *
 * Sem `openTime` legível não há como calcular a antecedência — nesse caso o
 * alerta fica no sino o dia todo e nunca escala, em vez de sumir calado.
 */
export function releaseAlertLevel(
  s: ReleasableStructure,
  today: string,
  nowMinutes: number,
): ReleaseAlertLevel {
  if (!isAwaitingRelease(s, today)) return "none";
  if (isFullyOutOfService(s)) return "none";

  const open = hhmmToMinutes(s.operatingHours?.openTime);
  if (open === null) return "warn";

  const close = hhmmToMinutes(s.operatingHours?.closeTime);
  if (close !== null && close > open && nowMinutes >= close) return "none";

  if (nowMinutes >= open) return "urgent";
  if (nowMinutes >= open - RELEASE_WARN_LEAD_MINUTES) return "warn";
  return "none";
}
