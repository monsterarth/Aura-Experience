// Grade categoria × pagantes — a MESMA peça serve o editor (Tabelas), o
// preview do import e o leitor do Arquivo (readOnly). Identidade do admin.
"use client";

import { X } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CabinCategory, RateTable } from "@/types/aura";
import { MAX_PAX } from "@/lib/rate-engine";

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
    textTransform: "uppercase", color: T.muted, textAlign: "center",
  };

  if (rowIds.length === 0) {
    return (
      <p style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "18px 0", margin: 0 }}>
        Tabela vazia.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Categoria</th>
            {PAX_COLS.map((n) => <th key={n} style={{ ...th, width: 86 }}>{n} pax</th>)}
            {!readOnly && <th style={{ width: 30 }} />}
          </tr>
        </thead>
        <tbody>
          {rowIds.map((catId) => (
            <tr key={catId}>
              <td style={{
                padding: "6px 8px", fontSize: 12.5, fontWeight: 700, color: T.text,
                whiteSpace: "nowrap", borderTop: `1px solid ${T.border}`,
              }}>
                {catById.get(catId)!.name}
              </td>
              {PAX_COLS.map((pax) => (
                <td key={pax} style={{ padding: "3px 3px", borderTop: `1px solid ${T.border}` }}>
                  {readOnly ? (
                    <div style={{
                      textAlign: "center", fontSize: 12, fontWeight: 700,
                      color: prices[catId]?.[pax] ? T.text : T.muted2, padding: "6px 2px",
                    }}>
                      {prices[catId]?.[pax]
                        ? prices[catId][pax].toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                        : "—"}
                    </div>
                  ) : (
                    <input type="number" placeholder="—"
                      value={prices[catId]?.[pax] ?? ""}
                      onChange={(e) => onSetPrice?.(catId, pax, e.target.value)}
                      style={{
                        width: "100%", boxSizing: "border-box", textAlign: "center",
                        fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
                        color: T.g2, background: T.glass, outline: "none",
                        border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 4px",
                      }} />
                  )}
                </td>
              ))}
              {!readOnly && (
                <td style={{ textAlign: "center", borderTop: `1px solid ${T.border}` }}>
                  <button onClick={() => onRemoveCategory?.(catId)} title="Remover da tabela"
                    style={{ padding: 4, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "inline-flex" }}>
                    <X size={13} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
