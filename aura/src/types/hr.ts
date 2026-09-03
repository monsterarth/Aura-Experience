// src/types/hr.ts
//
// Tipos do RH v2 — escala, ausências, dia materializado e publicação do mês.
//
// Vivem aqui e não em `src/types/aura.ts` porque são um domínio inteiro novo
// (cinco tabelas) e porque o `aura.ts` já passa de 1.200 linhas — ver
// `docs/REFACTORING.md`. As regras de recorrência e o motor que as aplica ficam
// em `src/lib/schedule-engine.ts`, que é puro e não conhece Supabase.
//
// Os tipos VELHOS de escala (`StaffSchedule`, `StaffScheduleOverride`,
// `ScheduleConfig`, `ScheduleCheckpoint`, `ScheduleType`) continuam em `aura.ts`
// até o deploy trocar os call sites — o calculador antigo ainda os importa.

import type { PatternBase, PatternRule, WorkPattern } from "@/lib/schedule-engine";

export type { PatternBase, PatternRule, WorkPattern };

/** Modelo de jornada reutilizável — o preset que evita digitar o mesmo horário dez vezes. */
export interface WorkPatternTemplate {
  id: string;
  propertyId: string;
  name: string;
  base: Exclude<PatternBase, "none">;
  startTime: string;
  endTime: string;
  cycleOnDays?: number | null;
  cycleOffDays?: number | null;
  /** Nulo no 6x1 de propósito: quem escolhe o dia de folga é a pessoa, senão o time inteiro folga junto. */
  weekdays?: number[] | null;
  rules: PatternRule[];
  weekdayTimeOverrides?: Record<string, { startTime: string; endTime: string }> | null;
  archivedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tipo de ausência. Uma entidade só para férias, atestado, folga, afastamento,
 * falta e banco de horas — no modelo velho isso era texto livre no campo
 * `reason` de um override de um dia.
 *
 * Férias aqui é AUSÊNCIA, não cálculo trabalhista: a contabilidade controla
 * período aquisitivo, 1/3, abono e fracionamento.
 */
export type AbsenceType =
  | "ferias"
  | "atestado"
  | "folga"
  | "afastamento"
  | "falta"
  | "banco_horas"
  | "outro";

export type AbsenceStatus = "prevista" | "confirmada" | "cancelada";

export interface StaffAbsence {
  id: string;
  staffId: string;
  propertyId: string;
  type: AbsenceType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  /** Saída ao médico às 14h não vira dia inteiro fora. */
  isPartialDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  status: AbsenceStatus;
  reason?: string | null;
  documentUrl?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** De onde o dia veio. `manual` é o único que o regerador não sobrescreve. */
export type ShiftOrigin = "pattern" | "absence" | "manual";

/** O dia materializado — uma linha por pessoa por dia. */
export interface StaffShift {
  id: string;
  staffId: string;
  propertyId: string;
  date: string; // YYYY-MM-DD
  isWork: boolean;
  startTime?: string | null;
  endTime?: string | null;
  plannedMinutes: number;
  origin: ShiftOrigin;
  absenceId?: string | null;
  patternId?: string | null;
  note?: string | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
  updatedAt: string;
}

export type SchedulePeriodStatus = "rascunho" | "publicada";

/**
 * Publicação do mês. Enquanto está em `rascunho`, o app de campo não mostra o
 * mês — quem monta trabalha com calma e publica de uma vez.
 */
export interface SchedulePeriod {
  id: string;
  propertyId: string;
  month: string; // YYYY-MM
  status: SchedulePeriodStatus;
  publishedAt?: string | null;
  publishedBy?: string | null;
  publishedByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── o que a tela do mês consome ─────────────────────────────────────────────

/** Alerta da escala. Avisa, nunca bloqueia — decisão do dono. */
export interface ScheduleAlert {
  kind:
    | "sem_folga_na_semana"
    | "muitos_dias_seguidos"
    | "intervalo_curto"
    | "escalado_e_ausente"
    | "sem_padrao"
    | "setor_descoberto";
  severity: "alta" | "media";
  staffId?: string;
  staffName?: string;
  date?: string;
  message: string;
}

export interface MonthGridRow {
  staffId: string;
  staffName: string;
  role: string;
  patternLabel: string;
  days: Record<string, StaffShift>;
  plannedMinutes: number;
}

export interface MonthGrid {
  month: string;
  propertyId: string;
  status: SchedulePeriodStatus;
  publishedAt?: string | null;
  rows: MonthGridRow[];
  alerts: ScheduleAlert[];
  /** Ativos sem padrão nenhum — a pendência que a tela empurra para resolver. */
  semPadrao: Array<{ staffId: string; staffName: string; role: string }>;
}

/**
 * A resposta de `/api/rh/meu-dia`. Um request no lugar dos três que cada app de
 * campo dispara hoje para escrever uma linha de texto.
 */
export interface MeuDiaResponse {
  today: string;
  days: Array<{
    date: string;
    isWork: boolean;
    startTime?: string | null;
    endTime?: string | null;
    /** Já formatado: "08:20 às 16:20" ou "Folga". A tela não recalcula. */
    label: string;
    /** Veio de ausência ou de ajuste manual — é a bolinha colorida da célula. */
    hasOverride: boolean;
    origin: ShiftOrigin;
    reason?: string | null;
  }>;
  /** Rótulo do padrão ("6x1", "12x36", "Sem jornada fixa") para o rodapé do card. */
  patternLabel: string;
  /**
   * A pessoa tem jornada cadastrada?
   *
   * Existe porque "não trabalha neste dia" e "não tem escala" são coisas
   * diferentes e o `isWork: false` não as distingue. Sem esta bandeira, a tela
   * que procura "a próxima folga" casava no primeiro dia de quem não tem escala
   * nenhuma e anunciava amanhã como folga — para 17 pessoas ativas.
   */
  hasSchedule: boolean;
  /** Nulo quando o mês ainda não foi publicado — a tela mostra "escala não publicada". */
  published: boolean;
}
