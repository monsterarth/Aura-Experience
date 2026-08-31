// Tipos e regras puras do Concierge (pedidos, urgência, catálogo).
import type { Tone } from "@/lib/admin-tokens";
import type { ConciergeRequest, ConciergeCategory, ConciergeStockComponent } from "@/types/aura";
import { formatBRL } from "@/lib/money";

export type Tab = "pending" | "history" | "catalog";
export const TABS: readonly Tab[] = ["pending", "history", "catalog"] as const;
export type UrgencyLevel = "urgent" | "warning" | "new";
export type RequestAction = "deliver" | "return" | "lost";

export interface EnrichedRequest extends ConciergeRequest {
  ageMin: number;
  urgency: UrgencyLevel;
}

export interface ItemForm {
  name: string; name_en: string; name_es: string;
  description: string; description_en: string; description_es: string;
  category: ConciergeCategory;
  price: string; loss_price: string; included_qty: string;
  image_url: string; active: boolean;
  availableForGuest: boolean; availableForMaid: boolean;
  order: string;
  groupId: string;
  deductFromStock: boolean;                    // toggle "Baixar do estoque" (Fase 4)
  stockComponents: ConciergeStockComponent[];  // ficha técnica
}

export interface GroupForm { name: string; icon: string; color: string; order: string }

export const defaultForm: ItemForm = {
  name: "", name_en: "", name_es: "",
  description: "", description_en: "", description_es: "",
  category: "consumption",
  price: "0", loss_price: "", included_qty: "0",
  image_url: "", active: true,
  availableForGuest: true, availableForMaid: false,
  order: "0",
  groupId: "",
  deductFromStock: false,
  stockComponents: [],
};

export const defaultGroupForm: GroupForm = { name: "", icon: "📦", color: "#9b6dff", order: "0" };

// ── Emoji como imagem ──
const EMOJI_PREFIX = "emoji:";
export function isEmojiUrl(url?: string) { return !!url && url.startsWith(EMOJI_PREFIX); }
export function emojiFromUrl(url?: string) { return url ? url.slice(EMOJI_PREFIX.length) : ""; }
export function emojiToUrl(em: string) { return `${EMOJI_PREFIX}${em}`; }

export function resolveItemIcon(item: { image_url?: string; category: string }): { kind: "emoji" | "image" | "none"; value: string } {
  if (isEmojiUrl(item.image_url)) return { kind: "emoji", value: emojiFromUrl(item.image_url) };
  if (item.image_url) return { kind: "image", value: item.image_url };
  return { kind: "none", value: "" };
}

// ── Urgência ──
export function getUrgency(ageMin: number): UrgencyLevel {
  if (ageMin > 30) return "urgent";
  if (ageMin > 15) return "warning";
  return "new";
}

export const URGENCY: Record<UrgencyLevel, { label: string; tone: Tone }> = {
  urgent:  { label: "Urgente", tone: "red" },
  warning: { label: "Atenção", tone: "amber" },
  new:     { label: "Novo",    tone: "green" },
};

export const STATUS_CFG: Record<string, { label: string; tone: Tone }> = {
  delivered: { label: "Entregue",   tone: "green" },
  returned:  { label: "Devolvido",  tone: "blue" },
  lost:      { label: "Extraviado", tone: "red" },
};
export function statusCfg(s: string) { return STATUS_CFG[s] ?? STATUS_CFG.delivered; }

export function categoryTone(category?: string): Tone { return category === "loan" ? "blue" : "brand"; }
export function categoryLabel(category?: string): string { return category === "loan" ? "Empréstimo" : "Consumo"; }

// ── Formatação ──
export function ageLabel(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
export function avatarFromName(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function dayLabel(offset: number): string {
  if (offset === 0) return "Hoje";
  if (offset === -1) return "Ontem";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
export function fullDayLabel(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
export const fmtBRL = (v: number) => formatBRL(v);
