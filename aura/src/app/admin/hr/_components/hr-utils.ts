// Regras puras do painel de gestão (RH): datas, rótulos/tons por cargo, turnos.
import type { Tone } from "@/lib/admin-tokens";
import type { Staff, StaffSchedule } from "@/types/aura";

export type StaffWithSchedules = Staff & { schedules: StaffSchedule[] };
export type Turno = "manhã" | "tarde" | "noite" | "plantão";
export type TurnoFilter = "todos" | Turno;

export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toYMD(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function initialsOf(name: string): string {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

export const ROLE_LABELS: Record<string, string> = {
  reception:   "Recepção",
  governance:  "Governanta",
  maid:        "Camareira",
  maintenance: "Coord. Manutenção",
  technician:  "Manutenção",
  kitchen:     "Cozinha",
  waiter:      "Garçom",
  porter:      "Porteiro",
  houseman:    "Mensageiro",
  marketing:   "Marketing",
  hr:          "Gestão",
  manager:     "Gerente / RH",
  admin:       "Administrador",
  director:    "Diretor",
  super_admin: "Super Admin",
  compras:     "Compras",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** Tom de cor por cargo (mesma família de cores do restante do admin). */
const ROLE_TONES: Record<string, Tone> = {
  governance: "violet",
  reception: "green",
  kitchen: "orange",
  maintenance: "amber",
  technician: "blue",
  porter: "blue",
  houseman: "blue",
  marketing: "rose",
  maid: "brand",
  waiter: "emerald",
  hr: "blue",
  manager: "blue",
  admin: "emerald",
  director: "violet",
  super_admin: "brand",
  compras: "amber",
};

export function roleTone(role: string): Tone {
  return ROLE_TONES[role] ?? "brand";
}

export const TURNO_TONE: Record<Turno, Tone> = { "manhã": "amber", tarde: "blue", noite: "violet", "plantão": "green" };

export function getTurno(startTime: string, endTime?: string | null): Turno {
  if (endTime) {
    const hStart = parseInt(startTime.split(":")[0], 10);
    const hEnd = parseInt(endTime.split(":")[0], 10);
    // 12h+ de duração (incluindo virada de meia-noite) → plantão
    const duration = hEnd > hStart ? hEnd - hStart : 24 - hStart + hEnd;
    if (duration >= 12) return "plantão";
  }
  const h = parseInt(startTime.split(":")[0], 10);
  if (h < 12) return "manhã";
  if (h < 18) return "tarde";
  return "noite";
}

export const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export interface PersonItem {
  id: string;
  name: string;
  initials: string;
  role: string;
  tone: Tone;
  profilePictureUrl?: string;
  /** Texto auxiliar (ex.: data do aniversário). */
  meta?: string;
}

export interface ShiftEntry extends PersonItem {
  start: string;
  end: string;
  turno: Turno;
}

export interface BirthdayItem extends PersonItem {
  daysLeft: number;
  dateLabel: string;
}

export interface DeptItem { label: string; count: number; tone: Tone }
export interface WeekBar { day: string; shifts: number; folgas: number; isToday: boolean }
