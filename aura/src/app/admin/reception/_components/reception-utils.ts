// Regras puras do painel da recepção.
import type { Tone } from "@/lib/admin-tokens";
import type { HousekeepingTask } from "@/types/aura";

export function formatTimeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

export function getElapsed(task: HousekeepingTask): string {
  if (!task.startedAt) return "Aguardando";
  const mins = Math.round((Date.now() - new Date(task.startedAt as string).getTime()) / 60000);
  return `${mins} min`;
}

export function formatOrderItems(items: any[]): string {
  return (items ?? [])
    .filter(i => i.menuItemId !== "guest_observations")
    .map(i => `${i.quantity}x ${i.name}`)
    .join(", ");
}

export function taskTypeLabel(type: string): string {
  return type === "turnover" ? "Faxina" : type === "daily" ? "Diária" : "Avulsa";
}

export function taskStatusInfo(status: string): { label: string; tone: Tone } {
  if (status === "in_progress") return { label: "Em andamento", tone: "amber" };
  if (status === "waiting_conference") return { label: "Aguardando conferência", tone: "blue" };
  if (status === "pending") return { label: "Aguardando", tone: "neutral" };
  return { label: status, tone: "neutral" };
}

export type StructureAgendaItem = {
  id: string;
  name: string;
  status: "in_use" | "upcoming" | "freed";
  by: string;
  until: string;
  at: string;
  freedAgo: string;
  needCleaning: boolean;
};

export type AlertItem = {
  id: string;
  type: "review" | "message_error";
  title: string;
  desc: string;
  time: string;
};
