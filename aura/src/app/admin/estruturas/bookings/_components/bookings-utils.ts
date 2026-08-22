import type { Stay, StructureBooking } from "@/types/aura";
import type { Tone } from "@/lib/admin-tokens";

export type StayLite = Stay & { guestName?: string; cabinName?: string };
export type BookingStatus = StructureBooking["status"];

export const STATUS_TONE: Record<string, Tone> = {
  pending: "orange", approved: "blue", completed: "green", rejected: "red", cancelled: "neutral", expired: "neutral",
};
export const STATUS_LABEL: Record<string, string> = {
  pending: "Aprovação pendente", approved: "Agendado", completed: "Finalizado", rejected: "Rejeitado", cancelled: "Cancelado", expired: "Expirado sem resposta",
};

/** "12 - Maria" (nº da cabana + primeiro nome) ou o nome gravado na reserva. */
export function bookingDisplayName(b: StructureBooking, stays: StayLite[], short = false): string {
  if (b.type === "maintenance_block") return short ? "Bloqueio" : (b.guestName || "Manutenção/Bloqueio");
  const stay = b.stayId ? stays.find(s => s.id === b.stayId) : null;
  const first = (stay?.guestName || b.guestName || (short ? "Ocupado" : "Hóspede")).split(" ")[0];
  if (stay?.cabinName) return `${stay.cabinName.match(/\d+/)?.[0] ?? stay.cabinName} - ${first}`;
  return b.guestName || (short ? "Ocupado" : "Hóspede");
}

export function sortStaysByCabin(stays: StayLite[]): StayLite[] {
  return [...stays].sort((a, b) => {
    const numA = (a.cabinName?.match(/\d+/) ?? [])[0];
    const numB = (b.cabinName?.match(/\d+/) ?? [])[0];
    if (numA && numB) return parseInt(numA) - parseInt(numB);
    return (a.cabinName || "").localeCompare(b.cabinName || "");
  });
}
