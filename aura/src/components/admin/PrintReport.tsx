// src/components/admin/PrintReport.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";

/**
 * Shell de impressão A4 para relatórios.
 *
 * Dois detalhes que não são óbvios:
 *
 * 1. `globals.css` tem um `@media print { @page { size: 80mm auto } }` GLOBAL,
 *    feito para comanda térmica, que vale para o app inteiro. Por isso este
 *    bloco começa redeclarando `@page` em A4 — e como o portal injeta o <style>
 *    no fim do <body>, ou seja, depois da folha global, ele vence.
 *
 * 2. Esconder o resto da página não dá para fazer com `visibility` no ancestral:
 *    o modal é um portal irmão do #root, então a regra é esconder todo filho
 *    direto do body que não seja este container.
 */
interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function PrintReport({ title, subtitle, onClose, children }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <div id="stk-report-root" className="fixed inset-0 z-50 overflow-y-auto bg-background/95 backdrop-blur-sm">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body > *:not(#stk-report-root) { display: none !important; }
          #stk-report-root {
            position: static !important;
            overflow: visible !important;
            background: #fff !important;
            backdrop-filter: none !important;
          }
          #stk-report-root * { color: #000 !important; background: transparent !important; }
          .stk-no-print { display: none !important; }
          .stk-sheet { box-shadow: none !important; border: 0 !important; padding: 0 !important; max-width: none !important; }
          .stk-table { font-size: 10px; }
          .stk-table th, .stk-table td { border-bottom: 1px solid #ddd !important; padding: 4px 6px !important; }
          .stk-table thead { display: table-header-group; }  /* repete o cabeçalho a cada página */
          .stk-table tr { break-inside: avoid; }
        }
      `}</style>

      <div className="stk-no-print sticky top-0 z-10 flex justify-end gap-2 p-4 bg-background/90 backdrop-blur border-b border-border">
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
          <Printer size={15} /> Imprimir / salvar PDF
        </button>
        <button onClick={onClose}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-secondary text-foreground">
          <X size={15} /> Fechar
        </button>
      </div>

      <div className="stk-sheet max-w-4xl mx-auto bg-card border border-border rounded-2xl p-8 my-6">
        <header className="mb-6 pb-4 border-b border-border">
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
