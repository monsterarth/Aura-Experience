// src/lib/multilang.ts
// Texto trilíngue guardado em jsonb (properties.settings): { pt, en, es }.
// Diferente do padrão `name` / `name_en` / `name_es` das tabelas — ali são colunas,
// aqui é um objeto dentro do JSON. Os dois convivem no sistema.
import { MultiLangObj } from "@/types/aura";

export const EMPTY_MULTILANG: MultiLangObj = { pt: "", en: "", es: "" };

/**
 * Aceita o formato antigo (string solta = português) e o novo (objeto).
 * Campo vazio herda do fallback, para um texto novo não nascer em branco.
 */
export function parseMultiLang(val: unknown, fallback: MultiLangObj = EMPTY_MULTILANG): MultiLangObj {
  if (!val) return fallback;
  if (typeof val === "string") return { pt: val, en: "", es: "" };
  const o = val as Partial<MultiLangObj>;
  return {
    pt: o.pt || fallback.pt,
    en: o.en || fallback.en,
    es: o.es || fallback.es,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O OUTRO formato: colunas `campo` / `campo_en` / `campo_es` nas tabelas.
//
// Esta escolha estava reescrita à mão em seis telas do portal (café, pedidos,
// concierge, pesquisa) além do mapa. Todas com a mesma regra: tradução vazia
// cai no português. Uma cópia a menos é um idioma a menos para esquecer quando
// entrar uma tela nova.
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnLang = "pt" | "en" | "es";

type Translated<K extends string, V> = Partial<Record<K | `${K}_en` | `${K}_es`, V | null>>;

/** Coluna traduzida por idioma; tradução ausente ou vazia cai no PT. */
export function pickColumn<K extends string>(
  row: Translated<K, string> | null | undefined,
  field: K,
  lang: ColumnLang,
): string {
  if (!row) return "";
  const translated = lang === "pt" ? null : row[`${field}_${lang}` as keyof typeof row];
  return ((translated as string | null) || (row[field as keyof typeof row] as string | null) || "");
}

/**
 * Idem para colunas de lista (ex.: `options` / `options_en`). Lista traduzida
 * vazia também cai no PT — meia tradução renderizaria opções em branco.
 */
export function pickColumnList<K extends string>(
  row: Translated<K, string[]> | null | undefined,
  field: K,
  lang: ColumnLang,
): string[] {
  if (!row) return [];
  const translated = lang === "pt" ? null : row[`${field}_${lang}` as keyof typeof row];
  const list = translated as string[] | null;
  return list?.length ? list : ((row[field as keyof typeof row] as string[] | null) ?? []);
}

