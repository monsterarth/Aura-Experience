// src/lib/csv.ts
// Geração de CSV que abre limpo no Excel em português, sem dependência nova.
//
// Três detalhes que fazem a diferença entre "abre" e "abre certo" no Excel pt-BR:
//   • BOM UTF-8 no início, senão acento vira caractere quebrado;
//   • separador ";", porque a vírgula é o separador decimal aqui;
//   • número com vírgula decimal, senão o Excel trata como texto e não soma.

export type CsvCell = string | number | null | undefined;

const BOM = "﻿";

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value).replace(".", ",");
  }
  const s = String(value);
  // Aspas só quando precisa: separador, aspas ou quebra de linha no conteúdo.
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(cell).join(";"), ...rows.map((r) => r.map(cell).join(";"))];
  return BOM + lines.join("\r\n");
}

/** Dispara o download no browser. Nome sem extensão ganha .csv. */
export function downloadCsv(filename: string, content: string): void {
  const name = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** "relatorio-estoque-2026-08-01" — data no nome ajuda a não sobrescrever. */
export function stampedName(prefix: string, date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  return `${prefix}-${iso}`;
}
