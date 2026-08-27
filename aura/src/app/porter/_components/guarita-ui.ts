// Tokens e helpers do app da guarita — mesma identidade dos outros apps de campo
// (fundo mais escuro que o admin, gradiente roxo→teal da marca).
import type { VehicleKind } from "@/types/aura";

export const T = {
  bg: "#06080f",
  card: "#101420",
  glass: "rgba(255,255,255,0.035)",
  glass2: "rgba(255,255,255,0.055)",
  border: "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.13)",
  text: "#eef0f8",
  muted: "rgba(238,240,248,0.5)",
  muted2: "rgba(238,240,248,0.28)",
  g1: "#9b6dff",
  g2: "#4ec9d4",
  grad: "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
  gradSoft: "linear-gradient(135deg,rgba(155,109,255,0.15) 0%,rgba(78,201,212,0.15) 100%)",
  brandBorder: "rgba(155,109,255,0.22)",
  green: "#2dd4bf", greenBg: "rgba(45,212,191,0.08)", greenBorder: "rgba(45,212,191,0.22)",
  amber: "#f59e0b", amberBg: "rgba(245,158,11,0.08)", amberBorder: "rgba(245,158,11,0.22)",
  blue: "#60a5fa", blueBg: "rgba(96,165,250,0.08)", blueBorder: "rgba(96,165,250,0.22)",
  red: "#f87171", redBg: "rgba(248,113,113,0.08)", redBorder: "rgba(248,113,113,0.22)",
  violet: "#c084fc", violetBg: "rgba(192,132,252,0.08)", violetBorder: "rgba(192,132,252,0.22)",
  orange: "#fb923c", orangeBg: "rgba(251,146,60,0.1)", orangeBorder: "rgba(251,146,60,0.25)",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/** Cada tipo tem cor e rótulo próprios — o guarita lê pela cor antes de ler o texto. */
export const KIND: Record<VehicleKind, { label: string; color: string; bg: string; border: string; pays: boolean }> = {
  guest:    { label: "Hóspede",    color: T.blue,   bg: T.blueBg,   border: T.blueBorder,   pays: false },
  visitor:  { label: "Visita",     color: T.violet, bg: T.violetBg, border: T.violetBorder, pays: false },
  supplier: { label: "Fornecedor", color: T.orange, bg: T.orangeBg, border: T.orangeBorder, pays: false },
  staff:    { label: "Equipe",     color: T.muted,  bg: T.glass2,   border: T.border2,      pays: false },
  customer: { label: "Cliente",    color: T.green,  bg: T.greenBg,  border: T.greenBorder,  pays: true },
};

export const KIND_ORDER: VehicleKind[] = ["customer", "guest", "visitor", "supplier", "staff"];

export const PAYMENTS = [
  { id: "credit", label: "Crédito", card: true },
  { id: "debit", label: "Débito", card: true },
  { id: "pix", label: "Pix", card: false },
  { id: "cash", label: "Dinheiro", card: false },
] as const;

export const CARD_BRANDS = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard", "Diners", "Outra"];

export const money = (v: number) => `R$ ${(Number(v) || 0).toFixed(2).replace(".", ",")}`;

export const shortMoney = (v: number) => {
  const n = Number(v) || 0;
  return Number.isInteger(n) ? `R$ ${n}` : money(n);
};

/** ABC1D23 → ABC-1D23 (só exibição). */
export const displayPlate = (plate: string) => {
  const p = (plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
};

export const normalizePlate = (plate: string) => (plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const hhmm = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** "desde 09:12" / "há 2h" — o guarita quer a duração, não o timestamp. */
export const since = (iso?: string | null) => {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  return `há ${h}h${mins % 60 ? ` ${mins % 60}min` : ""}`;
};
