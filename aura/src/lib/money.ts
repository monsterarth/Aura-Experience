// src/lib/money.ts
//
// Dinheiro em reais, um jeito só.
//
// Antes eram cinco convenções convivendo em ~25 arquivos, e duas delas estavam
// simplesmente erradas para um produto em pt-BR:
//
//   `R$ ${v.toFixed(2)}`                    → "R$ 1234.56"  (ponto decimal, sem milhar)
//   `v.toFixed(2).replace('.', ',')`        → "1234,56"     (sem separador de milhar)
//
// O lado da leitura (texto do usuário → número) já estava centralizado em
// @/lib/parse-money; faltava o lado da escrita.

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BRL_NO_CENTS = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * "R$ 1.234,56". Nulo/indefinido/NaN vira zero — a maioria dos chamadores já
 * fazia `Number(x ?? 0)` na mão.
 *
 * `decimals: 0` para totais grandes onde centavo é ruído (o funil usa assim).
 */
export function formatBRL(value?: number | null, opts: { decimals?: 0 | 2 } = {}): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return (opts.decimals === 0 ? BRL_NO_CENTS : BRL).format(safe);
}

/**
 * Só o número: "1.234,56", sem o símbolo. Para quando o "R$" já está no layout
 * (rótulo separado, coluna de tabela) e prefixar de novo duplicaria.
 */
export function formatAmount(value?: number | null, opts: { decimals?: 0 | 2 } = {}): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString('pt-BR', {
    minimumFractionDigits: opts.decimals === 0 ? 0 : 2,
    maximumFractionDigits: opts.decimals === 0 ? 0 : 2,
  });
}
