// Rótulos/tons do Café Salão.
import type { Tone } from "@/lib/admin-tokens";

export type WaiterTab = "lista" | "salao" | "cozinha";
export const WAITER_TABS: readonly WaiterTab[] = ["lista", "salao", "cozinha"] as const;

export const ATTENDANCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  expected: { label: "Esperado", tone: "blue" },
  arrived:  { label: "Chegou",   tone: "amber" },
  seated:   { label: "Sentado",  tone: "green" },
  left:     { label: "Saiu",     tone: "neutral" },
  absent:   { label: "Ausente",  tone: "neutral" },
  inactive: { label: "Inativo",  tone: "red" },
};

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending:   { label: "Pendente",   tone: "amber" },
  confirmed: { label: "Confirmado", tone: "blue" },
  preparing: { label: "Preparando", tone: "orange" },
  delivered: { label: "Entregue",   tone: "green" },
  cancelled: { label: "Cancelado",  tone: "neutral" },
};

export function attendanceStatus(s: string) { return ATTENDANCE_STATUS[s] ?? { label: s, tone: "neutral" as Tone }; }
export function orderStatus(s: string) { return ORDER_STATUS[s] ?? { label: s, tone: "neutral" as Tone }; }
