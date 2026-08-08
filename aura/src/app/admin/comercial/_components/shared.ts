// Hub Comercial — definições de estágio e helpers compartilhados pelas peças.
import { CrmLead } from "@/types/aura";

export interface StageDef { id: string; label: string; dot: string }

export const QUOTE_STAGES: StageDef[] = [
  { id: "open",        label: "Aberto",        dot: "bg-blue-500" },
  { id: "sent",        label: "Enviado",       dot: "bg-cyan-500" },
  { id: "negotiating", label: "Negociando",    dot: "bg-amber-500" },
  { id: "won",         label: "Ganho",         dot: "bg-emerald-500" },
  { id: "lost",        label: "Perdido",       dot: "bg-red-500" },
];

export const WEDDING_STAGES: StageDef[] = [
  { id: "tentative", label: "Em negociação", dot: "bg-amber-500" },
  { id: "confirmed", label: "Confirmado",    dot: "bg-emerald-500" },
  { id: "completed", label: "Realizado",     dot: "bg-slate-400" },
  { id: "cancelled", label: "Cancelado",     dot: "bg-rose-400" },
  { id: "lost",      label: "Perdido",       dot: "bg-red-500" },
];

/** Estágios em que o lead ainda está vivo (prazos valem, follow-up conta). */
export const ACTIVE_STAGES = new Set(["open", "sent", "negotiating", "tentative"]);

export const todayIso = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export const fmtBR = (iso?: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

export const money = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Follow-up vencido ou prazo estourado (só faz sentido em lead ativo). */
export function leadAlert(l: CrmLead): "expired" | "followup" | null {
  if (!ACTIVE_STAGES.has(l.stage)) return null;
  const t = todayIso();
  if (l.expiresAt && l.expiresAt < t) return "expired";
  if (l.followUpAt && l.followUpAt <= t) return "followup";
  return null;
}
