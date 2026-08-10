// Parser do "colar do Excel" — extraído da aba Tabelas antiga SEM mudanças de
// comportamento: o Ctrl+V de células do Excel (TAB entre colunas) é contrato.
// 1ª coluna = nome da categoria (casada com as cadastradas, nome operacional
// ou comercial); colunas 2..7 = diária para 1..6 pagantes.
import { CabinCategory, RateTable } from "@/types/aura";
import { MAX_PAX } from "@/lib/rate-engine";

/** "1.590" / "1590,50" / "R$ 990" → número (formato pt-BR do Excel). */
export function parseBRLCell(raw: string): number {
  const clean = raw.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(clean);
  return isNaN(v) ? 0 : v;
}

export const normKey = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Linha sem categoria correspondente é reportada em `unmatched` em vez de
 * virar categoria fantasma. Match: exato primeiro, substring depois.
 */
export function parseExcelPaste(
  raw: string,
  categories: CabinCategory[]
): { prices: RateTable["prices"]; unmatched: string[] } {
  const byKey: { key: string; id: string }[] = [];
  for (const c of categories) {
    byKey.push({ key: normKey(c.name), id: c.id });
    if (c.shortName) byKey.push({ key: normKey(c.shortName), id: c.id });
  }

  const prices: RateTable["prices"] = {};
  const unmatched: string[] = [];

  for (const line of raw.split("\n")) {
    const cells = line.split("\t");
    if (cells.length < 2) continue;
    const rawName = cells[0].trim();
    if (!rawName) continue;

    const row: Record<string, number> = {};
    for (let i = 1; i <= MAX_PAX && i < cells.length; i++) {
      const v = parseBRLCell(cells[i]);
      if (v > 0) row[String(i)] = v;
    }
    if (Object.keys(row).length === 0) continue;

    const key = normKey(rawName);
    const catId =
      byKey.find((e) => e.key === key)?.id ??
      byKey.find((e) => e.key.includes(key) || key.includes(e.key))?.id;

    if (catId) prices[catId] = row;
    else unmatched.push(rawName);
  }
  return { prices, unmatched };
}
