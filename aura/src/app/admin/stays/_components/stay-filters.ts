// Busca, filtros, ordenação e agrupamento da lista de estadias — funções puras.
//
// Antes tudo isso era uma `filterAndSort()` só, com a ordenação fixa (número da
// cabana) e invisível para quem usa. Aqui cada peça é separada porque a página
// combina as três em ordem: filtra → ordena → agrupa.
import { differenceInCalendarDays, endOfDay, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { hasPendingAccount, isDocPending, npsInfo, titleCase, extractCabinNumber, type StayRow, type TabStatus } from "./stay-utils";
import { petExceptionStatus } from "@/lib/pets";

// ── Ordenação ────────────────────────────────────────────────────────────────

export type SortKey = "checkIn" | "checkOut" | "cabin" | "guest" | "created";
export type SortDir = "asc" | "desc";
export interface SortState { key: SortKey; dir: SortDir }

export const SORT_LABELS: Record<SortKey, string> = {
  checkIn: "Check-in",
  checkOut: "Check-out",
  cabin: "Cabana",
  guest: "Hóspede",
  created: "Criada em",
};

/** O que cada aba pergunta primeiro: quem está onde, quem chega, quem saiu por último. */
export const DEFAULT_SORT: Record<TabStatus, SortState> = {
  ativas: { key: "cabin", dir: "asc" },
  futuras: { key: "checkIn", dir: "asc" },
  encerradas: { key: "checkOut", dir: "desc" },
};

const time = (d?: string | null): number => (d ? new Date(d).getTime() : 0);

export function applySort(rows: StayRow[], sort: SortState): StayRow[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sort.key) {
      case "cabin":
        cmp = extractCabinNumber(a.cabinName) - extractCabinNumber(b.cabinName);
        break;
      case "guest":
        cmp = titleCase(a.guestName).localeCompare(titleCase(b.guestName), "pt-BR");
        break;
      case "created":
        cmp = time(a.createdAt) - time(b.createdAt);
        break;
      case "checkOut":
        cmp = time(a.checkOut) - time(b.checkOut);
        break;
      default:
        cmp = time(a.checkIn) - time(b.checkIn);
    }
    // Desempate estável pela cabana — duas chegadas no mesmo dia não podem trocar
    // de lugar a cada realtime.
    if (cmp === 0) cmp = extractCabinNumber(a.cabinName) - extractCabinNumber(b.cabinName);
    return cmp * dir;
  });
}

// ── Filtros ──────────────────────────────────────────────────────────────────

export type FlagId = "pet" | "petException" | "docPending" | "group" | "internal" | "openAccount";

export const FLAG_LABELS: Record<FlagId, string> = {
  pet: "Pet",
  petException: "Pet — exceção pendente",
  docPending: "Doc pendente",
  group: "Grupo",
  internal: "Uso da casa",
  openAccount: "Conta aberta",
};

const FLAG_TEST: Record<FlagId, (s: StayRow) => boolean> = {
  pet: s => !!s.hasPet,
  petException: s => petExceptionStatus(s as any) === "pending",
  docPending: s => isDocPending(s),
  group: s => !!s.groupId,
  internal: s => !!s.internalUse,
  openAccount: s => hasPendingAccount(s),
};

export interface StayFilters {
  /** yyyy-MM-dd — vazio = sem limite daquele lado. */
  from: string;
  to: string;
  flags: FlagId[];
  /** cabins.id — vazio = todas. */
  cabins: string[];
  /** status do banco válidos para a aba — vazio = todos. */
  status: string[];
}

export const EMPTY_FILTERS: StayFilters = { from: "", to: "", flags: [], cabins: [], status: [] };

export function hasDateFilter(f: StayFilters): boolean {
  return !!f.from || !!f.to;
}

export function activeFilterCount(f: StayFilters): number {
  return (hasDateFilter(f) ? 1 : 0) + f.flags.length + (f.cabins.length ? 1 : 0) + (f.status.length ? 1 : 0);
}

export function isFiltering(f: StayFilters): boolean {
  return activeFilterCount(f) > 0;
}

/**
 * O período pergunta coisas diferentes em cada aba: em Futuras é "quem chega
 * nessa janela", em Encerradas "quem saiu nela", e em Ativas "quem estava na
 * casa" — aí a comparação é de sobreposição, não de data solta.
 */
function matchesPeriod(s: StayRow, tab: TabStatus, from: string, to: string): boolean {
  const start = from ? startOfDay(new Date(`${from}T00:00:00`)).getTime() : null;
  const end = to ? endOfDay(new Date(`${to}T00:00:00`)).getTime() : null;
  if (start === null && end === null) return true;

  if (tab === "ativas") {
    const ci = time(s.checkIn);
    const co = time(s.checkOut) || ci;
    if (start !== null && co < start) return false;
    if (end !== null && ci > end) return false;
    return true;
  }

  const ref = tab === "encerradas" ? time(s.checkOut) : time(s.checkIn);
  if (!ref) return false;
  if (start !== null && ref < start) return false;
  if (end !== null && ref > end) return false;
  return true;
}

export function applyFilters(rows: StayRow[], f: StayFilters, tab: TabStatus): StayRow[] {
  return rows.filter(s => {
    if (!matchesPeriod(s, tab, f.from, f.to)) return false;
    if (f.cabins.length && !f.cabins.includes(s.cabinId ?? "")) return false;
    if (f.status.length && !f.status.includes(s.status)) return false;
    // Sinalizadores somam: cada chip aceso estreita o resultado.
    for (const flag of f.flags) if (!FLAG_TEST[flag](s)) return false;
    return true;
  });
}

// ── Busca livre ──────────────────────────────────────────────────────────────

/** Nome, cabana, data (dd/MM/yyyy) e os rótulos de avaliação. */
export function applySearch(rows: StayRow[], searchTerm: string): StayRow[] {
  const term = searchTerm.toLowerCase().trim();
  if (!term) return rows;
  return rows.filter(s => {
    const guestMatch = (s.guestName || "").toLowerCase().includes(term);
    const cabinMatch = (s.cabinName || "").toLowerCase().includes(term);
    const checkInStr = s.checkIn ? format(new Date(s.checkIn), "dd/MM/yyyy", { locale: ptBR }) : "";
    const checkOutStr = s.checkOut ? format(new Date(s.checkOut), "dd/MM/yyyy", { locale: ptBR }) : "";
    const periodMatch = checkInStr.includes(term) || checkOutStr.includes(term);
    const nps = npsInfo(s);
    const evalMatch =
      (term === "avaliado" && !!nps) ||
      (term === "promotor" && nps?.tone === "emerald") ||
      (term === "neutro" && nps?.tone === "amber") ||
      (term === "detrator" && nps?.tone === "red");
    return guestMatch || cabinMatch || periodMatch || evalMatch;
  });
}

// ── Agrupamento ──────────────────────────────────────────────────────────────

export interface StayGroup {
  id: string;
  label: string;
  rows: StayRow[];
  /** Tom do cabeçalho; "neutral" para o grupo de fundo. */
  tone?: "orange" | "neutral";
}

/** Janela do grupo "Próximas chegadas", em horas. */
export const FUTURE_SOON_HOURS = 72;

/**
 * Futuras em duas frentes: o que exige preparo agora e o resto. As atrasadas
 * (chegada já passou e ninguém fez check-in) caem naturalmente na primeira —
 * e sobem ao topo assim que a ordenação é por check-in ascendente.
 *
 * Quem filtra por período já disse qual janela quer ver; agrupar de novo por
 * 72h em cima disso só embaralharia a resposta. Nesse caso a página chama
 * `groupFuturas` com `enabled = false` e mostra lista única.
 */
export function groupFuturas(rows: StayRow[], enabled = true): StayGroup[] {
  if (!enabled) return [{ id: "todas", label: "", rows }];
  const limit = Date.now() + FUTURE_SOON_HOURS * 60 * 60 * 1000;
  const soon: StayRow[] = [];
  const later: StayRow[] = [];
  for (const s of rows) {
    const ci = time(s.checkIn);
    (ci && ci <= limit ? soon : later).push(s);
  }
  const groups: StayGroup[] = [];
  if (soon.length) groups.push({ id: "soon", label: `Próximas ${FUTURE_SOON_HOURS}h`, rows: soon, tone: "orange" });
  if (later.length) groups.push({ id: "later", label: "Demais chegadas", rows: later, tone: "neutral" });
  return groups;
}

/** "há 3 dias" / "hoje" / "há 2 semanas" — usado nos cards de saída. */
export function relativeDays(d?: string | null): string {
  if (!d) return "";
  const diff = differenceInCalendarDays(new Date(), new Date(d));
  if (diff <= 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff < 7) return `há ${diff} dias`;
  if (diff < 14) return "há 1 semana";
  if (diff < 60) return `há ${Math.floor(diff / 7)} semanas`;
  return `há ${Math.floor(diff / 30)} meses`;
}
