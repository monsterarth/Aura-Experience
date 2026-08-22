// Rótulos/tons e helpers puros da tela de hóspedes.
import type { Tone } from "@/lib/admin-tokens";
import type { Guest } from "@/types/aura";

export const LANG_LABELS: Record<string, string> = { pt: "PT", en: "EN", es: "ES" };
export const LANG_TONE: Record<string, Tone> = { pt: "green", en: "blue", es: "amber" };

export const STAY_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Ativa", tone: "green" },
  pending: { label: "Prevista", tone: "blue" },
  pre_checkin_done: { label: "Pré-checkin", tone: "emerald" },
  finished: { label: "Encerrada", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "red" },
  archived: { label: "Arquivada", tone: "neutral" },
};

export const QUOTE_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Aberto", tone: "blue" },
  sent: { label: "Enviado", tone: "emerald" },
  negotiating: { label: "Negociando", tone: "amber" },
  won: { label: "Ganho", tone: "green" },
  lost: { label: "Perdido", tone: "red" },
};

export function getInitials(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface GuestStayRow {
  id: string;
  checkIn: string;
  checkOut: string;
  status: string;
  cabinName: string;
}

export type PanelTab = "dados" | "estadias" | "orcamentos";

export const EMPTY_GUEST: Omit<Guest, "updatedAt"> = {
  id: "",
  propertyId: "",
  fullName: "",
  email: "",
  phone: "",
  nationality: "Brasileira",
  birthDate: "",
  gender: "NAO_INFORMADO",
  occupation: "",
  document: { type: "CPF", number: "" },
  address: { street: "", number: "", neighborhood: "", city: "", state: "", zipCode: "", country: "Brasil" },
  allergies: [],
  preferredLanguage: "pt",
};
