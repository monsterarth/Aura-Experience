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

/** Limite declarado pela propriedade. Padrão 1 — é o limite da política BASE. */
export function maxPetsOf(settings: { maxPets?: number } | null | undefined): number {
  const n = Number(settings?.maxPets);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificação: dentro da política · exceção · fora do teto
//
// Três faixas, e não duas, porque a política de 2026 tem duas camadas: a
// POLÍTICA PET (1 animal, até 15 kg) e a POLÍTICA PET EXCEÇÃO, que analisa caso
// a caso o que passa disso. O que estiver acima do teto absoluto não vira nem
// pedido — é o único bloqueio que sobrou no formulário.
//
// O peso deixou de bloquear na faixa do meio de propósito: travar em 15 kg só
// ensinava o hóspede a digitar 14. Melhor ele declarar 20 e a pousada decidir.
// ─────────────────────────────────────────────────────────────────────────────

/** Limites das duas camadas. Teto ausente ou nulo = não há teto (analisa tudo). */
export interface PetLimits {
  maxPets?: number;
  petMinWeight?: number;
  petMaxWeight?: number;
  /** false → não existe exceção nesta propriedade: o que passa da base é bloqueado. */
  acceptsPetExceptions?: boolean;
  petExceptionMaxPets?: number | null;
  petExceptionMaxWeight?: number | null;
}

/** Por que um pet (ou o conjunto) saiu da política base. `index` ausente = é do conjunto. */
export type PetReason =
  | { kind: "count"; value: number; limit: number }
  | { kind: "weight"; index: number; value: number; limit: number }
  | { kind: "underweight"; index: number; value: number; limit: number }
  | { kind: "species"; index: number; value: string };

export type PetBand = "ok" | "exception" | "blocked";

export interface PetClassification {
  band: PetBand;
  /** Tudo que fugiu da base, mesmo quando a faixa final é `blocked`. */
  reasons: PetReason[];
  /** Só os motivos que sozinhos já bloqueiam — o que a tela precisa destacar. */
  blocking: PetReason[];
}

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Teto: `null`/ausente significa "sem teto", e não zero. */
const ceiling = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Diz em que faixa a lista de pets cai. Ponto único: formulário, painel da
 * recepção e API respondem a mesma coisa para a mesma estadia.
 *
 * Espécie "Outro" sempre é exceção — a política base recebe cães e gatos, e
 * qualquer outra espécie depende de análise.
 */
export function classifyPets(
  pets: PetDetails[] | null | undefined,
  limits: PetLimits | null | undefined,
): PetClassification {
  const list = (pets ?? []).filter(isFilled);
  if (list.length === 0) return { band: "ok", reasons: [], blocking: [] };

  const maxPets = maxPetsOf(limits);
  const minWeight = num(limits?.petMinWeight, 1);
  const maxWeight = num(limits?.petMaxWeight, 15);
  // Propriedade que não declarou nada segue aceitando exceção — é o comportamento
  // permissivo de hoje, e desligar isso é decisão de quem configura, não default.
  const acceptsExceptions = limits?.acceptsPetExceptions !== false;
  const capPets = ceiling(limits?.petExceptionMaxPets);
  const capWeight = ceiling(limits?.petExceptionMaxWeight);

  const reasons: PetReason[] = [];
  const blocking: PetReason[] = [];

  const push = (r: PetReason, isBlocking: boolean) => {
    reasons.push(r);
    if (isBlocking) blocking.push(r);
  };

  if (list.length > maxPets) {
    push({ kind: "count", value: list.length, limit: maxPets },
      !acceptsExceptions || (capPets !== null && list.length > capPets));
  }

  list.forEach((pet, index) => {
    const weight = Number(pet.weight) || 0;

    // Abaixo do mínimo é dado inválido, não pedido de exceção: ninguém analisa
    // um cachorro de 200 g. Bloqueia sempre.
    if (weight > 0 && weight < minWeight) {
      push({ kind: "underweight", index, value: weight, limit: minWeight }, true);
    } else if (weight > maxWeight) {
      push({ kind: "weight", index, value: weight, limit: maxWeight },
        !acceptsExceptions || (capWeight !== null && weight > capWeight));
    }

    if (pet.species && pet.species !== "Cachorro" && pet.species !== "Gato") {
      push({ kind: "species", index, value: pet.species }, !acceptsExceptions);
    }
  });

  if (blocking.length > 0) return { band: "blocked", reasons, blocking };
  if (reasons.length > 0) return { band: "exception", reasons, blocking };
  return { band: "ok", reasons: [], blocking: [] };
}

/** Estado do pedido de exceção da estadia, ou null quando não há pedido. */
export function petExceptionStatus(
  stay: { petException?: { status?: string } | null } | null | undefined,
): 'pending' | 'approved' | 'refused' | null {
  const st = stay?.petException?.status;
  return st === 'pending' || st === 'approved' || st === 'refused' ? st : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Janela de alta temporada
//
// Critério INTERNO, e de propósito: o texto que o hóspede assina fala em
// "ocupação do período" e diz que a decisão é discricionária. Quem decide vê a
// janela na tela; quem pede, não. Assim a direção segue podendo liberar sem que
// o hóspede leia uma promessa no documento.
// ─────────────────────────────────────────────────────────────────────────────

/** Janela por dia do ano, sem ano: `from`/`to` em "MM-DD". Vira a virada do ano. */
export interface PetBlackoutWindow { from: string; to: string }

/** 15/12 a 15/03 — o período que a direção declarou em 03/09/2026. */
export const DEFAULT_PET_BLACKOUT: PetBlackoutWindow[] = [{ from: "12-15", to: "03-15" }];

const MMDD = /^\d{2}-\d{2}$/;

/** "2026-12-20T..." → "12-20". Aceita Date e ISO. */
function monthDay(d: string | Date): string | null {
  const s = typeof d === "string" ? d : d.toISOString();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}-${m[3]}` : null;
}

/** true se o dia cai dentro da janela — inclusive, e ciente da virada do ano. */
function dayInWindow(day: string, w: PetBlackoutWindow): boolean {
  if (!MMDD.test(w.from) || !MMDD.test(w.to)) return false;
  // Janela normal (03-01 → 05-30): intervalo simples.
  if (w.from <= w.to) return day >= w.from && day <= w.to;
  // Janela que vira o ano (12-15 → 03-15): vale de dezembro ao fim do ano OU do
  // começo do ano até março. Comparar como texto sem isto daria sempre falso.
  return day >= w.from || day <= w.to;
}

/**
 * A estadia toca a janela de alta? Basta UM dia dentro — chegar em 14/12 e sair
 * em 20/12 é hospedagem de alta temporada tanto quanto entrar no dia 16.
 */
export function touchesBlackout(
  checkIn: string | Date | null | undefined,
  checkOut: string | Date | null | undefined,
  windows: PetBlackoutWindow[] | null | undefined,
): boolean {
  const list = (windows ?? []).filter((w) => w && MMDD.test(w.from) && MMDD.test(w.to));
  if (list.length === 0 || !checkIn) return false;

  const start = new Date(typeof checkIn === "string" ? checkIn : checkIn.toISOString());
  const end = checkOut ? new Date(typeof checkOut === "string" ? checkOut : checkOut.toISOString()) : start;
  if (isNaN(start.getTime())) return false;

  // Varre dia a dia. Estadia é curta (dias, não anos) e o teto evita laço infinito
  // se vier uma data absurda do banco.
  for (let i = 0, cur = new Date(start); i < 400 && cur <= end; i++, cur.setDate(cur.getDate() + 1)) {
    const day = monthDay(cur);
    if (day && list.some((w) => dayInWindow(day, w))) return true;
  }
  return false;
}
