// Regras de apresentação/filtragem da lista de estadias (puras, sem React).
import { format, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tone } from "@/lib/admin-tokens";
import { isAccountOpen } from "@/lib/stay-account";

/**
 * Três abas. A "Conta" saiu: a conta é da estadia, não uma fila paralela — quem
 * fez check-out e não encerrou a conta fica em Ativas, no grupo "Saíram".
 */
export type TabStatus = "ativas" | "futuras" | "encerradas";
export const TABS: readonly TabStatus[] = ["ativas", "futuras", "encerradas"] as const;

/**
 * A API filtra por `scope`, não por status: uma estadia `finished` pode estar em
 * Ativas (conta aberta) ou em Encerradas (conta fechada), e só o status não diz.
 */
export const TAB_SCOPE: Record<TabStatus, string> = {
  ativas: "ativas",
  futuras: "futuras",
  encerradas: "encerradas",
};

export type StayRow = any;

/** Conta ainda aberta: saiu e ninguém encerrou, ou há saldo/pendência registrada. */
export function hasPendingAccount(s: StayRow): boolean {
  return isAccountOpen(s) || (s.pendingFolioCount ?? 0) > 0;
}

/** Hóspede ainda na casa (o outro grupo de Ativas é "já saiu, conta aberta"). */
export function isInHouse(s: StayRow): boolean {
  return s.status === "active";
}

export function activeStatusInfo(checkOut: string | null | undefined): { label: string; tone: Tone } {
  if (!checkOut) return { label: "Sem data", tone: "neutral" };
  const diff = differenceInCalendarDays(new Date(checkOut), new Date());
  if (diff < 0) return { label: "Check-out atrasado", tone: "red" };
  if (diff === 0) return { label: "Check-out hoje", tone: "orange" };
  if (diff === 1) return { label: "Check-out amanhã", tone: "amber" };
  return { label: "Hospedagem em curso", tone: "green" };
}

export function futureStatusInfo(checkIn: string | null | undefined, expectedTime?: string | null): { label: string; tone: Tone } {
  if (!checkIn) return { label: "Aguardando", tone: "neutral" };
  const start = new Date(checkIn);
  const diff = differenceInCalendarDays(start, new Date());
  const time = expectedTime ? ` às ${expectedTime}` : "";
  if (diff < 0) return { label: `Atrasado · previsto ${format(start, "dd/MM", { locale: ptBR })}${time}`, tone: "red" };
  if (diff === 0) return { label: `Chegada hoje${time}`, tone: "green" };
  if (diff === 1) return { label: `Chegada amanhã${time}`, tone: "amber" };
  return { label: `Chegada em ${diff} dias${time}`, tone: "neutral" };
}

export function extractCabinNumber(name?: string): number {
  const m = name?.match(/\d+/);
  return m ? parseInt(m[0], 10) : Infinity;
}

export function fmtDay(d?: string | null, pattern = "dd MMM"): string {
  return d ? format(new Date(d), pattern, { locale: ptBR }) : "";
}

export function npsInfo(s: StayRow): { label: string; tone: Tone; value: number } | null {
  const v = s.nps !== undefined ? s.nps : s.npsScore;
  if (v === undefined || v === null) return null;
  if (v >= 9) return { label: `Promotor (${v})`, tone: "emerald", value: v };
  if (v <= 6) return { label: `Detrator (${v})`, tone: "red", value: v };
  return { label: `Neutro (${v})`, tone: "amber", value: v };
}

/**
 * Busca, filtros, ordenação e agrupamento vivem em `stay-filters.ts` — este
 * arquivo ficou com as regras de apresentação (rótulos, status, nomes).
 */

/**
 * Ficha do titular sem número de documento. Quem decide é a rota (`docPending`):
 * a lista nunca recebe o documento em si.
 *
 * A regra anterior inferia isso do formato do `guestId` ("id provisório = sem documento")
 * e ficava presa: o id nasce provisório quando a reserva é aberta sem CPF e nunca mudava,
 * mesmo depois do documento chegar. Cartão de estadia ativa acendia para sempre.
 */
export function isDocPending(s: StayRow): boolean {
  return s.docPending === true;
}

const PARTICLES = new Set(["de", "da", "do", "das", "dos", "e", "di", "del", "van", "von"]);

/** "MARIA DA SILVA" → "Maria da Silva" (os nomes chegam em caixa alta do PMS). */
export function titleCase(full?: string | null): string {
  if (!full) return "";
  return full
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && PARTICLES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Primeiro + último nome, em caixa normal. */
export function shortName(full?: string): string {
  const name = titleCase(full) || "Hóspede desconhecido";
  const parts = name.split(" ");
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
}
