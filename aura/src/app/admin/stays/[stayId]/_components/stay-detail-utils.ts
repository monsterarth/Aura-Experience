// Helpers puros da ficha completa da estadia.
import type { Tone } from "@/lib/admin-tokens";

export const formatDateForInput = (ts: any): string => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const parseDateFromInput = (dateStr: string, orig: any): string | null => {
  if (!dateStr) return null;
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = orig ? new Date(orig) : new Date();
  d.setFullYear(y, m - 1, day);
  return d.toISOString();
};

export const STAY_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending:          { label: "Pendente",     tone: "amber" },
  pre_checkin_done: { label: "Pré check-in", tone: "blue" },
  active:           { label: "Hospedado",    tone: "green" },
  finished:         { label: "Encerrado",    tone: "neutral" },
  cancelled:        { label: "Cancelado",    tone: "red" },
};

export function stayStatus(status: string): { label: string; tone: Tone } {
  return STAY_STATUS[status] ?? { label: status, tone: "neutral" };
}

export const bedLabel = (b: any): string =>
  ({ single: "Solteiro", double: "Casal", sofa_bed: "Sofá-cama" }[b.type as string] ?? b.label ?? "Extra") as string;

export const COMPANION_LABEL: Record<string, string> = { adult: "Adulto", child: "Criança", free: "Bebê", baby: "Bebê" };
export const COMPANION_TONE: Record<string, Tone> = { adult: "brand", child: "blue", free: "orange", baby: "orange" };

export type KeyLocation = "reception" | "cabin" | "unknown";
