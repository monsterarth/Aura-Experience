// Grade categoria × pagantes — a MESMA peça serve o editor (Tabelas), o
// preview do import e o leitor do Arquivo (readOnly). Identidade do admin;
// no celular rola na horizontal com a coluna de categoria fixa.
"use client";

import { X } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CabinCategory, RateTable } from "@/types/aura";
import { MAX_PAX } from "@/lib/rate-engine";
import { IconButton } from "@/components/aura";

const PAX_COLS = Array.from({ length: MAX_PAX }, (_, i) => String(i + 1));

export function PriceGrid({ prices, categories, readOnly, onSetPrice, onRemoveCategory }: {
  prices: RateTable["prices"];
  categories: CabinCategory[];
  readOnly?: boolean;
  onSetPrice?: (catId: string, pax: string, value: string) => void;
  onRemoveCategory?: (catId: string) => void;
}) {
  const catById = new Map(categories.map((c) => [c.id, c]));
  // Só linhas de categorias que ainda existem (chave órfã fica escondida,
  // mas preservada no objeto — mesmo contrato da aba antiga).
  const rowIds = Object.keys(prices).filter((id) => catById.has(id));

  const th: React.CSSProperties = {
    padding: "7px 8px", fontSize: 9.5, fontWeight: 900, letterSpacing: ".1em",
    textTransform: "uppercase", color: T.muted, textAlign: "center", background: T.card,
  };
  const sticky: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1, background: T.card };

  if (rowIds.length === 0) {
    return (
      <p style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "18px 0", margin: 0 }}>
        Tabela vazia.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }} data-no-ptr>
      <table style={{ width: "100%", minWidth: 86 * PAX_COLS.length + 140, borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>
            <th style={{ ...th, ...sticky, textAlign: "left" }}>Categoria</th>
            {PAX_COLS.map((n) => <th key={n} style={{ ...th, width: 86 }}>{n} pax</th>)}
            {!readOnly && <th style={{ width: 36, background: T.card }} />}
          </tr>
        </thead>
        <tbody>
          {rowIds.map((catId) => (
            <tr key={catId}>
              <td style={{
                ...sticky, padding: "6px 8px", fontSize: 12.5, fontWeight: 700, color: T.text,
                whiteSpace: "nowrap", borderTop: `1px solid ${T.border}`, boxShadow: `1px 0 0 ${T.border}`,
              }}>
                {catById.get(catId)!.name}
              </td>
              {PAX_COLS.map((pax) => (
                <td key={pax} style={{ padding: "3px 3px", borderTop: `1px solid ${T.border}` }}>
                  {readOnly ? (
                    <div style={{
                      textAlign: "center", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                      color: prices[catId]?.[pax] ? T.text : T.muted2, padding: "6px 2px",
                    }}>
                      {prices[catId]?.[pax]
                        ? prices[catId][pax].toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                        : "—"}
                    </div>
                  ) : (
                    <input type="number" inputMode="numeric" placeholder="—" aria-label={`${catById.get(catId)!.name} · ${pax} pax`}
                      className="ak-input" data-size="sm"
                      value={prices[catId]?.[pax] ?? ""}
                      onChange={(e) => onSetPrice?.(catId, pax, e.target.value)}
                      style={{ textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums", padding: "6px 4px", minWidth: 78 }} />
                  )}
                </td>
              ))}
              {!readOnly && (
                <td style={{ textAlign: "center", borderTop: `1px solid ${T.border}` }}>
                  <IconButton icon={X} label="Remover da tabela" variant="ghost" size="sm" onClick={() => onRemoveCategory?.(catId)} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
