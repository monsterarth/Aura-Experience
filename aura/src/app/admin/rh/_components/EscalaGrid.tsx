"use client";

// A grade do mês. É um EDITOR DE EXCEÇÕES, não um construtor de grade: abre já
// preenchida pelo padrão de cada pessoa, e o trabalho de quem monta é mexer nas
// poucas células que fogem. Com ~20 pessoas de jornada real, o mês tem ~600
// células e cerca de 15 exceções — se a tela exigisse preencher as 600, nenhuma
// interface salvaria.
//
// Usa `ScrollMatrix` do kit (pessoa nas LINHAS, dia nas COLUNAS). A grade antiga
// de /admin/escalas/mensal fazia o contrário e tinha `#0a0a0a` cravado, o que
// quebra no tema claro — não é modelo a copiar.

import React from "react";
import { ScrollMatrix, T, alpha } from "@/components/aura";
import { daysOfMonth, dowOf } from "@/lib/schedule-engine";
import type { MonthGrid, StaffShift } from "@/types/hr";

const DOW = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Cor da célula por natureza do dia. Semântica antes de decoração. */
function estilo(dia: StaffShift | undefined, fimDeSemana: boolean): React.CSSProperties {
  if (!dia) return { background: fimDeSemana ? alpha(T.muted, 4) : undefined, color: T.muted2 };
  if (!dia.isWork) {
    if (dia.origin === "absence") return { background: T.amberBg, color: T.amber };
    return { background: alpha(T.muted, 6), color: T.muted2 };
  }
  if (dia.origin === "manual") return { background: T.blueBg, color: T.blue, fontWeight: 700 };
  return { background: alpha(T.g2, 10), color: T.text };
}

export function EscalaGrid({
  grid,
  onCell,
}: {
  grid: MonthGrid;
  onCell: (staffId: string, staffName: string, date: string, dia?: StaffShift) => void;
}) {
  const dias = daysOfMonth(grid.month);

  return (
    <ScrollMatrix minWidth={120 + dias.length * 34} maxHeight="60dvh">
      <thead>
        <tr>
          <th style={{ minWidth: 150, textAlign: "left" }}>Pessoa</th>
          {dias.map(d => {
            const dow = dowOf(d);
            const fds = dow === 0 || dow === 6;
            return (
              <th key={d} style={{ textAlign: "center", minWidth: 34, color: fds ? T.brandText : undefined }}>
                <div>{DOW[dow]}</div>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{d.slice(-2)}</div>
              </th>
            );
          })}
          <th style={{ textAlign: "right", minWidth: 64 }}>Horas</th>
        </tr>
      </thead>
      <tbody>
        {grid.rows.map(linha => (
          <tr key={linha.staffId}>
            <td style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 600, color: T.text }}>{linha.staffName}</div>
              <div style={{ fontSize: 10, color: T.muted }}>{linha.patternLabel}</div>
            </td>
            {dias.map(d => {
              const dia = linha.days[d];
              const dow = dowOf(d);
              return (
                <td
                  key={d}
                  onClick={() => onCell(linha.staffId, linha.staffName, d, dia)}
                  title={dia?.isWork ? `${dia.startTime ?? ""}–${dia.endTime ?? ""}` : dia?.note ?? "Sem escala"}
                  style={{
                    textAlign: "center",
                    cursor: "pointer",
                    fontSize: 10,
                    padding: "6px 2px",
                    ...estilo(dia, dow === 0 || dow === 6),
                  }}
                >
                  {dia?.isWork ? (dia.startTime ?? "").slice(0, 5) : dia ? "·" : ""}
                </td>
              );
            })}
            <td style={{ textAlign: "right", fontWeight: 700, color: T.text }}>
              {(linha.plannedMinutes / 60).toFixed(0)}h
            </td>
          </tr>
        ))}
      </tbody>
    </ScrollMatrix>
  );
}
