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

