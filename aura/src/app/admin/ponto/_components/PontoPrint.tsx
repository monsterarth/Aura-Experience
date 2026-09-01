"use client";

// src/app/admin/ponto/_components/PontoPrint.tsx
//
// Relatório do período em folha A4 — o formato que se anexa a uma nota ou se
// manda por e-mail para quem contrata. Reaproveita o shell de impressão que o
// estoque já usa (PrintReport), que é quem resolve o `@page` A4 e esconde o
// resto do app na hora de imprimir.
import React from "react";
import PrintReport from "@/components/admin/PrintReport";
import { formatDayLabel, formatMinutes, localHM } from "@/lib/timeclock";
import type { TimeClockDay } from "@/types/aura";

export function PontoPrint({
  days, totals, personName, periodLabel, propertyName, onClose,
}: {
  days: TimeClockDay[];
  totals: { minutes: number; days: number; average: number };
  personName: string;
  periodLabel: string;
  propertyName?: string;
  onClose: () => void;
}) {
  return (
    <PrintReport
      title={`Relatório de ponto — ${personName}`}
      subtitle={[propertyName, periodLabel, `Emitido em ${new Date().toLocaleString("pt-BR")}`].filter(Boolean).join(" · ")}
      onClose={onClose}
    >
      <table className="stk-table w-full text-left" style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ padding: "6px 8px", fontSize: 11, textTransform: "uppercase" }}>Dia</th>
            <th style={{ padding: "6px 8px", fontSize: 11, textTransform: "uppercase" }}>Jornadas</th>
            <th style={{ padding: "6px 8px", fontSize: 11, textTransform: "uppercase", textAlign: "right" }}>Horas</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map(day => (
            <tr key={day.date}>
              <td style={{ padding: "6px 8px", fontSize: 12, whiteSpace: "nowrap", textTransform: "capitalize" }}>
                {formatDayLabel(day.date)}
              </td>
              <td style={{ padding: "6px 8px", fontSize: 12 }}>
                {day.sessions.map((s, i) => (
                  <span key={i} style={{ marginRight: 10, whiteSpace: "nowrap" }}>
                    {s.status === "orphanOut" ? "—" : localHM(s.start.ts)}
                    {" → "}
                    {s.end && s.status !== "orphanOut" ? localHM(s.end.ts) : s.status === "orphanOut" ? localHM(s.start.ts) : "—"}
                  </span>
                ))}
              </td>
              <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                {formatMinutes(day.minutes)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ padding: "8px", fontSize: 12, fontWeight: 700 }}>
              {totals.days} {totals.days === 1 ? "dia trabalhado" : "dias trabalhados"}
            </td>
            <td style={{ padding: "8px", fontSize: 12 }}>
              Média de {formatMinutes(totals.average)} por dia
            </td>
            <td style={{ padding: "8px", fontSize: 14, textAlign: "right", fontWeight: 900 }}>
              {formatMinutes(totals.minutes)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p style={{ marginTop: 18, fontSize: 10, lineHeight: 1.6 }}>
        Registro gerencial de horas gerado pelo sistema Aura a partir das batidas do próprio
        colaborador. Jornadas em aberto não são somadas.
      </p>
    </PrintReport>
  );
}
