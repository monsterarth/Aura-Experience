// src/lib/pets.ts
//
// Ponto único de leitura/escrita dos pets da estadia.
//
// Por que existe: a estadia carrega TRÊS campos que precisam contar a mesma
// história — `pets` (a lista, fonte da verdade), `hasPet` (o booleano que as
// patinhas leem na lista de estadias, no mapa e na governança) e `petDetails`
// (o objeto único legado, hoje espelho de pets[0]). Deixar cada tela sincronizar
// os três na mão é como eles saem de sincronia.
//
// Ler sempre por `readPets` — há estadias gravadas antes da coluna `pets` existir,
// com o pet só em `petDetails`. Escrever sempre por `writePets`.
import { PetDetails, Stay } from "@/types/aura";

export const EMPTY_PET: PetDetails = { name: "", species: "Cachorro", weight: 0, breed: "" };

/** Peso semeado num pet novo, quando a propriedade não define um mínimo maior. */
export const DEFAULT_PET_WEIGHT = 5;

/** Quantos pets o formulário aceita registrar, independente da política. Trava anti-abuso. */
export const PET_HARD_CAP = 5;

/** true quando o registro tem qualquer informação preenchida. */
function isFilled(p: Partial<PetDetails> | null | undefined): boolean {
  if (!p) return false;
  return (p.name ?? "").trim() !== "" || (p.breed ?? "").trim() !== "" || Number(p.weight) > 0;
}

/**
 * Lê os pets em qualquer formato já gravado: a lista nova, o objeto único legado,
 * ou nada. Nunca devolve null — quem chama itera direto.
 */
export function readPets(stay: Partial<Stay> | null | undefined): PetDetails[] {
  if (!stay) return [];
  if (Array.isArray(stay.pets) && stay.pets.length > 0) {
    return stay.pets.filter(isFilled).map((p) => ({ ...EMPTY_PET, ...p }));
  }
  if (isFilled(stay.petDetails)) return [{ ...EMPTY_PET, ...stay.petDetails } as PetDetails];
  return [];
}

/**
 * Monta o trio coerente para o UPDATE. `hasPet` vem do toggle da tela, mas só
 * sobrevive se houver pet de verdade — marcar "trago pet" e não preencher nada
 * não deve acender a patinha da governança.
 */
export function writePets(hasPet: boolean, pets: PetDetails[] | null | undefined): {
  pets: PetDetails[];
  hasPet: boolean;
  petDetails: PetDetails | null;
} {
  const clean = hasPet ? (pets ?? []).filter(isFilled).slice(0, PET_HARD_CAP) : [];
  return { pets: clean, hasPet: clean.length > 0, petDetails: clean[0] ?? null };
}

/** Limite declarado pela propriedade. Padrão 1 — só informa o aviso, não bloqueia. */
export function maxPetsOf(settings: { maxPets?: number } | null | undefined): number {
  const n = Number(settings?.maxPets);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
