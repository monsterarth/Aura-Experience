// src/lib/stock-locations.ts
// Regras de apresentação dos locais de estoque compartilhadas entre as telas.
//
// Local com "cabinId" é DERIVADO de uma cabana: ele existe por causa do cadastro
// de cabanas, não do cadastro de locais. Por isso some das listas planas e é
// alcançado pelo seletor de dois passos (escolhe "Cabanas", depois qual).
import { StockLocation } from "@/types/aura";

/** Opção sintética do passo 1 que abre a lista de cabanas no passo 2. */
export const CABIN_SENTINEL = "__CABINS__";

export function isCabinBacked(l: StockLocation): boolean {
  return !!l.cabinId;
}

/**
 * Separa os locais "de cadastro" (que aparecem na lista plana) dos derivados de
 * cabana. Locais tipo 'cabin' ainda NÃO vinculados continuam na lista plana —
 * enquanto ninguém reconciliou, eles são locais comuns e precisam ser usáveis.
 */
export function splitLocations(locations: StockLocation[]): { flat: StockLocation[]; cabinBacked: StockLocation[] } {
  return {
    flat: locations.filter((l) => !isCabinBacked(l)),
    cabinBacked: locations.filter(isCabinBacked),
  };
}
