// Hub Comercial — definições de estágio e helpers compartilhados pelas peças.
import type { CSSProperties } from "react";
import { CrmLead } from "@/types/aura";
import { T } from "@/lib/admin-tokens";

/** dot agora é COR (hex) — os componentes renderizam com inline style. */
export interface StageDef { id: string; label: string; dot: string }

// ── Estilos da identidade visual (ver src/app/admin/CLAUDE.md) ───────────────

export const S = {
  /** Label de seção: 10px 800 uppercase espaçado. */
  label: {
    fontSize: 10, fontWeight: 800, letterSpacing: ".12em",
    textTransform: "uppercase", color: T.muted,
  } as CSSProperties,
  /** Card padrão (#1c1c1c, hairline, raio 16). */
  card: {
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 16,
  } as CSSProperties,
  /** Linha interna (glass, raio 12). */
  row: {
    background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12,
  } as CSSProperties,
  /** Input padrão (glass + hairline forte). */
  input: {
    width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 11,
    background: T.glass, border: `1px solid ${T.border2}`, color: T.text,
    fontFamily: "inherit", fontSize: 13, outline: "none",
  } as CSSProperties,
  /** Botão fantasma (glass). */
  ghostBtn: {
    display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
    borderRadius: 10, border: `1px solid ${T.border2}`, background: T.glass,
    cursor: "pointer", color: T.muted, fontSize: 12, fontWeight: 700,
    fontFamily: "inherit",
  } as CSSProperties,
  /** Botão primário (gradiente da marca). */
  gradBtn: {
    display: "flex", alignItems: "center", gap: 7, padding: "8px 16px",
    borderRadius: 10, border: "none", background: T.grad, cursor: "pointer",
    color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "inherit",
    boxShadow: "0 4px 14px rgba(155,109,255,.3)",
  } as CSSProperties,
};

export const pillS = (bg: string, color: string, border: string): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 10, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase",
  padding: "2px 8px", borderRadius: 999, lineHeight: 1.6,
  background: bg, color, border: `1px solid ${border}`,
});

export const QUOTE_STAGES: StageDef[] = [
  { id: "open",        label: "Aberto",        dot: "#60a5fa" },
  { id: "sent",        label: "Enviado",       dot: "#4ec9d4" },
  { id: "negotiating", label: "Negociando",    dot: "#f59e0b" },
  { id: "won",         label: "Ganho",         dot: "#34d399" },
  { id: "lost",        label: "Perdido",       dot: "#f87171" },
];

export const WEDDING_STAGES: StageDef[] = [
  { id: "tentative", label: "Em negociação", dot: "#f59e0b" },
  { id: "confirmed", label: "Confirmado",    dot: "#34d399" },
  { id: "completed", label: "Realizado",     dot: "#94a3b8" },
  { id: "cancelled", label: "Cancelado",     dot: "#fb7185" },
  { id: "lost",      label: "Perdido",       dot: "#f87171" },
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
