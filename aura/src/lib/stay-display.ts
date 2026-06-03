// Helpers de exibição de estadia — centraliza o nome mostrado e a identificação de uso interno.
// Uma reserva de "uso da casa" (internalUse) é uma ocupação interna (manutenção, família, bloqueio),
// não um cliente. Em todas as telas de equipe ela deve ser identificada como tal.

export const INTERNAL_USE_LABEL = "Uso da Casa";

interface InternalInfo {
  internalUse?: boolean | null;
  internalLabel?: string | null;
}

/**
 * Nome a exibir para uma estadia. Para reservas de uso da casa, retorna o rótulo interno
 * (ou "Uso da Casa"); caso contrário, o nome do hóspede (ou um fallback).
 */
export function stayDisplayName(stay: InternalInfo, guestName?: string | null, fallback = "Hóspede"): string {
  if (stay?.internalUse) return (stay.internalLabel?.trim() || INTERNAL_USE_LABEL);
  return guestName?.trim() || fallback;
}

/** true quando a estadia é uma ocupação interna (deve ganhar selo "Uso da Casa"). */
export function isInternalStay(stay: InternalInfo): boolean {
  return !!stay?.internalUse;
}
