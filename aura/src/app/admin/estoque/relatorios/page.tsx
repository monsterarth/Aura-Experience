// src/app/admin/estoque/relatorios/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import {
  StockCategory, StockLocation, StockProduct, StockReport, StockReportKind,
} from "@/types/aura";
import { splitLocations } from "@/lib/stock-locations";
import { toCsv, downloadCsv, stampedName } from "@/lib/csv";
import PrintReport from "@/components/admin/PrintReport";
import TickList from "@/components/admin/TickList";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, FileText, Download, Printer } from "lucide-react";

const KINDS: { value: StockReportKind; label: string; hint: string }[] = [
  { value: "position", label: "Posição de estoque", hint: "Saldo, custo e valor por item em cada estoque" },
  { value: "movements", label: "Movimentações", hint: "Tudo que entrou, saiu e foi transferido no período" },
  { value: "losses", label: "Perdas", hint: "Só as perdas, com o motivo de cada uma" },
  { value: "consumption", label: "Consumo por setor", hint: "Saídas de consumo e reposição por setor, com categoria e item" },
];

const money = (n: number) => `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isMoneyCol = (key: string) => key === "valor" || key === "custo" || key === "custoMedio";

export default function EstoqueRelatoriosPage() {
  const { currentProperty: property } = useProperty();

  const [kind, setKind] = useState<StockReportKind>("position");
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hideZero, setHideZero] = useState(true);

  const [report, setReport] = useState<StockReport | null>(null);
  const [running, setRunning] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const [locs, prods, cats] = await Promise.all([
        StockClient.locations(property.id), StockClient.products(property.id), StockClient.categories(property.id),
      ]);
      setLocations(locs.filter((l) => l.active));
      setProducts(prods.filter((p) => p.active));
      setCategories(cats);
    } catch (e) { toast.error((e as Error).message); }
  }, [property?.id]);
  useEffect(() => { load(); }, [load]);

  // Cabanas entram agrupadas: consumo por cabana é um dos ganhos da modelagem.
  const { flat, cabinBacked } = useMemo(() => splitLocations(locations), [locations]);
  const locationItems = useMemo(
    () => [...flat, ...cabinBacked].map((l) => ({ id: l.id, name: l.name })),
    [flat, cabinBacked],
  );
  const allCabinsSelected = cabinBacked.length > 0 && cabinBacked.every((c) => locationIds.includes(c.id));

  const toggleAllCabins = () => {
    const ids = cabinBacked.map((c) => c.id);
    setLocationIds(allCabinsSelected
      ? locationIds.filter((i) => !ids.includes(i))
      : locationIds.concat(ids.filter((i) => !locationIds.includes(i))));
  };

  const run = async () => {
    if (!property?.id) return;
    setRunning(true);
    try {
      setReport(await StockClient.report(property.id, kind, {
        locationIds, productIds, categoryIds,
        from: from || null, to: to || null,
        hideZero,
      }));
    } catch (e) { toast.error((e as Error).message); } finally { setRunning(false); }
  };

  const exportCsv = () => {
    if (!report) return;
    const headers = report.columns.map((c) => c.label);
    const rows = report.rows.map((r) => report.columns.map((c) => r[c.key] ?? ""));
    downloadCsv(stampedName(`relatorio-${report.kind}`), toCsv(headers, rows));
  };

  const kindLabel = KINDS.find((k) => k.value === kind)!.label;
  const needsPeriod = kind !== "position";

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText size={22} /> Relatórios</h1>
        <p className="text-sm text-muted-foreground">Filtre por estoque, item e período; exporte em CSV ou imprima.</p>
      </header>

      {/* Tipo de relatório */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        {KINDS.map((k) => (
          <button key={k.value} onClick={() => { setKind(k.value); setReport(null); }}
            className={cn("text-left bg-card border rounded-2xl p-4 transition-colors",
              kind === k.value ? "border-primary" : "border-border hover:border-primary/40")}>
            <p className="font-bold text-foreground text-sm">{k.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{k.hint}</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <div>
          <TickList label="Estoques" items={locationItems} selected={locationIds} onChange={setLocationIds} searchable />
          {cabinBacked.length > 0 && (
            <button onClick={toggleAllCabins} className="text-[11px] font-bold text-primary hover:opacity-80 mt-1.5">
              {allCabinsSelected ? "Desmarcar" : "Marcar"} todas as {cabinBacked.length} cabanas
            </button>
          )}
        </div>
        <TickList label="Itens" items={products.map((p) => ({ id: p.id, name: p.name }))}
          selected={productIds} onChange={setProductIds} searchable />
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[180px] flex-1">
          <label className="field-label">Categorias (vazio = todas)</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {categories.map((c) => {
              const on = categoryIds.includes(c.id);
              return (
                <button key={c.id} type="button"
                  onClick={() => setCategoryIds(on ? categoryIds.filter((x) => x !== c.id) : [...categoryIds, c.id])}
                  className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold border",
                    on ? "bg-primary/15 border-primary/40 text-foreground" : "bg-secondary border-border text-muted-foreground")}>
                  {c.icon} {c.name}
                </button>
              );
            })}
          </div>
        </div>
        {needsPeriod && (
          <>
            <div>
              <label className="field-label">De</label>
              <input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Até</label>
              <input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
        {kind === "position" && (
          <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} className="w-4 h-4 accent-primary" />
            Esconder saldo zero
          </label>
        )}
        <button onClick={run} disabled={running}
          className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground ml-auto">
          {running ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Gerar relatório
        </button>
      </div>

      {/* Resultado */}
      {report && (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
            <p className="text-xs text-muted-foreground">
              <b className="text-foreground">{report.meta.rowCount}</b> linha(s) · {report.meta.filterSummary}
            </p>
            <div className="flex gap-2">
              <button onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-secondary text-foreground hover:bg-secondary/70">
                <Download size={14} /> Exportar CSV
              </button>
              <button onClick={() => setPrinting(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-secondary text-foreground hover:bg-secondary/70">
                <Printer size={14} /> Imprimir / PDF
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
            <ReportTable report={report} />
          </div>
        </>
      )}

      {printing && report && (
        <PrintReport
          title={`${kindLabel} — ${property.name}`}
          subtitle={`${report.meta.filterSummary} · gerado em ${new Date(report.meta.generatedAt).toLocaleString("pt-BR")}`}
          onClose={() => setPrinting(false)}
        >
          <ReportTable report={report} />
        </PrintReport>
      )}
    </div>
  );
}

function ReportTable({ report }: { report: StockReport }) {
  return (
    <table className="stk-table w-full text-sm min-w-[600px]">
      <thead>
        <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
          {report.columns.map((c) => (
            <th key={c.key} className={cn("px-3 py-3 whitespace-nowrap", c.align === "right" ? "text-right" : "text-left")}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {report.rows.map((r, i) => (
          <tr key={i} className="border-b border-border/50 last:border-0">
            {report.columns.map((c) => {
              const v = r[c.key];
              return (
                <td key={c.key} className={cn("px-3 py-2", c.align === "right" ? "text-right tabular-nums" : "text-left",
                  c.key === "item" ? "text-foreground" : "text-muted-foreground")}>
                  {typeof v === "number" && isMoneyCol(c.key) ? money(v) : (v ?? "")}
                </td>
              );
            })}
          </tr>
        ))}
        {report.rows.length === 0 && (
          <tr><td colSpan={report.columns.length} className="px-4 py-12 text-center text-muted-foreground">
            Nenhuma linha com esses filtros.
          </td></tr>
        )}
      </tbody>
      {report.rows.length > 0 && (
        <tfoot>
          <tr className="border-t-2 border-border font-bold text-foreground">
            {report.columns.map((c, i) => (
              <td key={c.key} className={cn("px-3 py-3", c.align === "right" ? "text-right tabular-nums" : "text-left")}>
                {i === 0 ? "Total" : (report.totals[c.key] !== undefined
                  ? (isMoneyCol(c.key) ? money(report.totals[c.key]) : report.totals[c.key])
                  : "")}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
