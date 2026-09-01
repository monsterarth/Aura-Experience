// src/lib/timeclock.ts
//
// Derivação de jornadas a partir de batidas. Puro e isomórfico de propósito.
//
// O banco guarda só EVENTOS (entrou às 08:12, saiu às 12:03, entrou às 13:10…).
// O par entrada→saída, o total do dia e a pendência são calculados aqui, sempre.
// Nada disso é gravado — é o que permite 1, 2 ou N pares por dia sem migration,
// e o que faz uma correção de batida recalcular tudo sozinha.
//
// **Por que a agregação por dia roda no CLIENTE:** o servidor (Vercel) roda em
// UTC e a pousada não. "Que dia é esta batida" só tem resposta certa no fuso de
// quem lê, então o servidor devolve instantes absolutos e o agrupamento é feito
// aqui, no navegador. Sem isso, uma batida das 22h viraria o dia seguinte no
// relatório.
import { TimeClockDay, TimeClockEvent, WorkSession } from "@/types/aura";

/** Data local YYYY-MM-DD (fuso de quem executa) de um instante. */
export function localYMD(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** HH:MM local. */
export function localHM(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 492 → "8h 12min" · 45 → "45min" · 0 → "—" */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) return "0min";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/** Formato decimal para planilha: 492 → "8,20". */
export function minutesToDecimal(minutes: number | null | undefined): string {
  if (minutes == null) return "";
  return (minutes / 60).toFixed(2).replace(".", ",");
}

function sortEvents(events: TimeClockEvent[]): TimeClockEvent[] {
  return [...events].sort((a, b) => {
    const diff = new Date(a.ts).getTime() - new Date(b.ts).getTime();
    if (diff !== 0) return diff;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });
}

/** Batidas que contam: as não excluídas. */
export function activeEvents(events: TimeClockEvent[]): TimeClockEvent[] {
  return events.filter(e => !e.deletedAt);
}

/**
 * Pareia as batidas em jornadas.
 *
 * Duas anomalias são possíveis e nenhuma delas é resolvida por adivinhação —
 * o sistema **nunca inventa hora**:
 *  - entrada seguida de outra entrada → a primeira fica sem saída (`dangling`);
 *  - saída sem entrada → vira uma sessão `orphanOut`, visível para correção.
 *
 * `now` existe para o teste e para o cálculo do "há quanto tempo estou dentro".
 */
export function buildSessions(events: TimeClockEvent[], now: Date = new Date()): WorkSession[] {
  const sorted = sortEvents(activeEvents(events));
  const sessions: WorkSession[] = [];
  let open: TimeClockEvent | null = null;

  const pushOpen = (entry: TimeClockEvent) => {
    // Jornada sem saída: é `open` enquanto for do dia de hoje (a pessoa ainda
    // está trabalhando) e `dangling` depois disso (esqueceu de bater).
    const stillToday = localYMD(entry.ts) === localYMD(now);
    sessions.push({ start: entry, minutes: null, status: stillToday ? "open" : "dangling" });
  };

  for (const event of sorted) {
    if (event.kind === "in") {
      if (open) pushOpen(open);
      open = event;
      continue;
    }
    // kind === 'out'
    if (!open) {
      sessions.push({ start: event, end: event, minutes: 0, status: "orphanOut" });
      continue;
    }
    const minutes = Math.round((new Date(event.ts).getTime() - new Date(open.ts).getTime()) / 60000);
    sessions.push({ start: open, end: event, minutes: Math.max(0, minutes), status: "closed" });
    open = null;
  }

  if (open) pushOpen(open);
  return sessions;
}

/** Minutos decorridos de uma jornada aberta (para o contador ao vivo). */
export function elapsedMinutes(session: WorkSession, now: Date = new Date()): number {
  if (session.minutes != null) return session.minutes;
  return Math.max(0, Math.round((now.getTime() - new Date(session.start.ts).getTime()) / 60000));
}

/**
 * Agrupa por data LOCAL de início da jornada.
 *
 * A jornada pertence ao dia em que COMEÇOU — é o que mantém um turno noturno
 * (entra 19h, sai 7h) como uma linha só, em vez de duas meias-jornadas em dias
 * diferentes. Hoje nenhuma escala da casa vira a meia-noite, mas o dia em que
 * a portaria virar turno, o relatório não quebra.
 */
export function groupByDay(sessions: WorkSession[]): TimeClockDay[] {
  const map = new Map<string, TimeClockDay>();

  for (const session of sessions) {
    const date = localYMD(session.start.ts);
    let day = map.get(date);
    if (!day) {
      day = { date, sessions: [], minutes: 0, hasOpen: false, hasPending: false };
      map.set(date, day);
    }
    day.sessions.push(session);
    if (session.status === "closed") day.minutes += session.minutes ?? 0;
    if (session.status === "open") day.hasOpen = true;
    if (session.status === "dangling" || session.status === "orphanOut") day.hasPending = true;
  }

  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export interface ClockStatus {
  /** Há uma jornada aberta agora? */
  inside: boolean;
  /** Início da jornada aberta (ISO), se houver. */
  since?: string;
  /** Minutos já acumulados na jornada aberta. */
  openMinutes: number;
  /** Total FECHADO de hoje, em minutos (não inclui a jornada em curso). */
  todayClosedMinutes: number;
  /**
   * Jornada aberta que ficou para trás (dia anterior). Enquanto existir, o botão
   * não oferece "bater saída" — fechar isso com a hora de agora inventaria horas.
   */
  dangling?: WorkSession;
  pendingCount: number;
}

/** Estado atual de uma pessoa, para o botão do topo. */
export function clockStatus(events: TimeClockEvent[], now: Date = new Date()): ClockStatus {
  const sessions = buildSessions(events, now);
  const today = localYMD(now);

  const open = sessions.find(s => s.status === "open");
  const dangling = sessions.find(s => s.status === "dangling");
  const pendingCount = sessions.filter(s => s.status === "dangling" || s.status === "orphanOut").length;

  const todayClosedMinutes = sessions
    .filter(s => s.status === "closed" && localYMD(s.start.ts) === today)
    .reduce((sum, s) => sum + (s.minutes ?? 0), 0);

  return {
    inside: !!open,
    since: open?.start.ts,
    openMinutes: open ? elapsedMinutes(open, now) : 0,
    todayClosedMinutes,
    dangling,
    pendingCount,
  };
}

/** Qual batida o botão deve gerar agora. `null` = há pendência a resolver antes. */
export function nextPunchKind(status: ClockStatus): "in" | "out" | null {
  if (status.dangling) return null;
  return status.inside ? "out" : "in";
}

export const DAY_LABEL: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "2-digit" };

/** "seg, 01/09" a partir de YYYY-MM-DD, sem escorregar de fuso. */
export function formatDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", DAY_LABEL);
}
