/**
 * Parser de valor monetário digitado por humanos BR.
 *
 * Aceita "3.450,50", "3450,50", "3450.50", "3450.5", "1.500" e "3450".
 * Regra: o ÚLTIMO separador é decimal quando tem 1-2 dígitos depois dele;
 * ponto seguido de exatamente 3 dígitos (sem vírgula na string) é milhar,
 * convenção BR ("1.500" = mil e quinhentos).
 *
 * Motivo de existir: o parser ingênuo `replace(/\./g,"").replace(",",".")`
 * tratava TODO ponto como milhar — e como os prefills de edição vinham em
 * formato JS ("3450.5"), reconfirmar um valor com centavos multiplicava por
 * 10x/100x (bug pego na revisão da fase B.5).
 */
export function parseMoneyBR(raw: string): number {
  const t = (raw || "").trim().replace(/[^\d.,-]/g, "");
  if (!t) return NaN;

  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  const sep = Math.max(lastComma, lastDot);
  if (sep === -1) return parseFloat(t);

  const intPart = t.slice(0, sep).replace(/[.,]/g, "");
  const frac = t.slice(sep + 1).replace(/[.,]/g, "");

  // Ponto + 3 dígitos sem vírgula = separador de milhar ("1.500", "12.345.678")
  if (t[sep] === "." && lastComma === -1 && frac.length === 3) {
    return parseFloat(intPart + frac);
  }
  return parseFloat(`${intPart}${frac ? `.${frac}` : ""}`);
}

/** Valor numérico → string de edição em formato BR (vírgula decimal). */
export function moneyToInput(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  return String(v).replace(".", ",");
}
