// src/lib/event-payload.ts
//
// Whitelist + normalização do que pode ser ESCRITO em `events`.
//
// Existe porque a escrita de evento era `insert({ ...form })` e
// `update({ ...data })` — spread cru do objeto que veio da tela. Quem manda o
// corpo escolhia as colunas, inclusive `propertyId`, `createdAt` e o `id`. Aqui
// a lista de campos graváveis é fechada: chave fora dela é DESCARTADA em
// silêncio (o cliente não precisa saber o que existe), e valor dentro dela é
// validado — chave conhecida com valor inválido devolve erro, porque nesse caso
// alguém digitou algo e merece saber que não entrou.
//
// A mesma função vai servir a rota do parceiro (Altamare), que hoje ainda não
// existe: o dia em que ela existir, o saneamento já está escrito e testado pelo
// caminho do admin.
import { isIsoDate } from "./event-dates";

export const EVENT_TYPES = ["local", "external", "private"] as const;
export const EVENT_STATUSES = ["draft", "published", "cancelled", "finished"] as const;
export const EVENT_CATEGORIES = [
  "entertainment", "gastronomy", "sports", "culture", "nightlife",
  "corporate", "wedding", "birthday", "other",
] as const;
export const EVENT_VISIBILITIES = ["all_guests", "public"] as const;

/** Texto livre: campo → tamanho máximo. Corta o absurdo antes do banco. */
const TEXT_FIELDS: Record<string, number> = {
  title: 200, titleEn: 200, titleEs: 200,
  description: 5000, descriptionEn: 5000, descriptionEs: 5000,
  location: 200, priceDescription: 200,
};
/** Campos que viram `href`/`src` na tela do hóspede — validação de protocolo. */
const URL_FIELDS = ["locationUrl", "imageUrl", "externalUrl"] as const;
const DATE_FIELDS = ["startDate", "endDate"] as const;
const TIME_FIELDS = ["startTime", "endTime"] as const;
const NUMBER_FIELDS: Record<string, number> = { price: 1_000_000, maxCapacity: 100_000 };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SanitizeResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

/** `undefined` = não veio no corpo. `null`/"" = veio para limpar. */
function textOrNull(v: unknown, max: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t.slice(0, max);
}

/**
 * Só http(s). Sem isto, `javascript:` e `data:` entram numa coluna que o portal
 * renderiza como `href` — e o plano prevê o parceiro escrevendo aqui.
 */
function urlOrNull(v: unknown): string | null | undefined | false {
  const t = textOrNull(v, 2000);
  if (t === undefined || t === null) return t;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return t;
  } catch {
    return false;
  }
}

/**
 * Devolve APENAS as colunas graváveis, já normalizadas.
 *
 * `mode: "create"` exige título e data de início; `"update"` aceita corpo
 * parcial e só valida o que veio.
 */
export function sanitizeEventInput(raw: unknown, mode: "create" | "update"): SanitizeResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Corpo inválido." };
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    const v = textOrNull(src[field], max);
    if (v !== undefined) out[field] = v;
  }

  for (const field of URL_FIELDS) {
    const v = urlOrNull(src[field]);
    if (v === false) return { ok: false, error: `Endereço inválido em "${field}" — use http:// ou https://.` };
    if (v !== undefined) out[field] = v;
  }

  for (const field of DATE_FIELDS) {
    const v = textOrNull(src[field], 10);
    if (v === undefined) continue;
    if (v !== null && !isIsoDate(v)) return { ok: false, error: `Data inválida em "${field}".` };
    out[field] = v;
  }

  for (const field of TIME_FIELDS) {
    const v = textOrNull(src[field], 5);
    if (v === undefined) continue;
    if (v !== null && !HHMM.test(v)) return { ok: false, error: `Horário inválido em "${field}" — use HH:mm.` };
    out[field] = v;
  }

  for (const [field, max] of Object.entries(NUMBER_FIELDS)) {
    const v = src[field];
    if (v === undefined) continue;
    if (v === null || v === "") { out[field] = null; continue; }
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) return { ok: false, error: `Valor inválido em "${field}".` };
    out[field] = n;
  }

  const enums: [string, readonly string[]][] = [
    ["type", EVENT_TYPES], ["status", EVENT_STATUSES],
    ["category", EVENT_CATEGORIES], ["visibility", EVENT_VISIBILITIES],
  ];
  for (const [field, allowed] of enums) {
    const v = src[field];
    if (v === undefined) continue;
    if (typeof v !== "string" || !allowed.includes(v)) {
      return { ok: false, error: `Valor não aceito em "${field}".` };
    }
    out[field] = v;
  }

  if (src.featured !== undefined) out.featured = src.featured === true || src.featured === "true";

  if (src.privateEventId !== undefined) {
    const v = textOrNull(src.privateEventId, 36);
    if (v !== null && v !== undefined && !UUID.test(v)) {
      return { ok: false, error: 'Vínculo inválido em "privateEventId".' };
    }
    out.privateEventId = v ?? null;
  }

  if (mode === "create") {
    if (!out.title) return { ok: false, error: "O título é obrigatório." };
    if (!out.startDate) return { ok: false, error: "A data de início é obrigatória." };
    // Defaults explícitos: escrita sem `type` cai no default da coluna ('local'),
    // mas deixar isso implícito é o tipo de coisa que muda sem ninguém ver.
    out.type ??= "local";
    out.category ??= "entertainment";
    out.status ??= "draft";
    out.visibility ??= "all_guests";
    out.featured ??= false;
  } else if (out.title !== undefined && !out.title) {
    return { ok: false, error: "O título não pode ficar vazio." };
  }

  // Coerência de intervalo, com o cuidado de comparar contra o que a linha VAI
  // ficar: num update parcial, só dá para checar quando as duas pontas vieram.
  const s = out.startDate as string | null | undefined;
  const e = out.endDate as string | null | undefined;
  if (s && e && e < s) return { ok: false, error: "A data de fim é anterior à de início." };

  if (Object.keys(out).length === 0) return { ok: false, error: "Nada para gravar." };
  return { ok: true, data: out };
}
