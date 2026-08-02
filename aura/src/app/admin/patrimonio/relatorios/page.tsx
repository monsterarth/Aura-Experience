// src/app/admin/patrimonio/relatorios/page.tsx
// Relatórios de patrimônio. Estrutura clonada de admin/estoque/relatorios:
// o mesmo payload estruturado alimenta a tabela, o CSV e a impressão.
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import {
  AssetReport, AssetReportKind, AssetStatus, StockCategory, StockLocation, StockStaffOption,
} from "@/types/aura";
import { toCsv, downloadCsv, stampedName } from "@/lib/csv";
import PrintReport from "@/components/admin/PrintReport";
import TickList from "@/components/admin/TickList";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, FileText, Download, Printer } from "lucide-react";
import PatrimonioTabs from "../PatrimonioTabs";

const KINDS: { value: AssetReportKind; label: string; hint: string; dated?: boolean }[] = [
  { value: "asset_position", label: "Posição patrimonial", hint: "Um ativo por linha, com custo e valor contábil" },
  { value: "asset_depreciation", label: "Razão de depreciação", hint: "Lançamentos mensais por ativo", dated: true },
  { value: "asset_warranty", label: "Garantias", hint: "O que está por vencer e o que já venceu" },
  { value: "asset_maintenance", label: "Custo de manutenção", hint: "Quanto cada ativo já custou de reparo", dated: true },
  { value: "asset_disposals", label: "Baixas", hint: "Alienações do período, com ganho ou perda", dated: true },
];

const STATUS_OPTIONS: { id: AssetStatus; name: string }[] = [
  { id: "active", name: "Ativo" }, { id: "maintenance", name: "Manutenção" },
  { id: "inactive", name: "Inativo" }, { id: "disposed", name: "Baixado" },
];

const money = (n: number) => `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONEY_COLS = new Set(["custo", "depreciado", "valorContabil", "depreciacao", "acumulada", "custoAquisicao", "custoManutencao", "recebido", "resultado"]);

export default function PatrimonioRelatoriosPage() {
  const { currentProperty: property } = useProperty();

  const [kind, setKind] = useState<AssetReportKind>("asset_position");
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [staff, setStaff] = useState<StockStaffOption[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [custodianIds, setCustodianIds] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [warrantyWindowDays, setWarrantyWindowDays] = useState(90);
  const [includeDisposed, setIncludeDisposed] = useState(false);

  const [report, setReport] = useState<AssetReport | null>(null);
  const [running, setRunning] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const [cats, locs, st] = await Promise.all([
        StockClient.categories(property.id), StockClient.locations(property.id), StockClient.movementStaff(property.id),
      ]);
      setCategories(cats.filter((c) => c.appliesTo !== "consumable"));
      setLocations(locs.filter((l) => l.active));
      setStaff(st);
    } catch (e) { toast.error((e as Error).message); }
  }, [property?.id]);
  useEffect(() => { load(); }, [load]);

  const cfg = KINDS.find((k) => k.value === kind)!;

  const run = async () => {
    if (!property?.id) return;
    setRunning(true);
    try {
      setReport(await StockClient.assetReport(property.id, kind, {
        categoryIds, locationIds, custodianIds,
        statuses: statuses as AssetStatus[],
        from: from || null, to: to || null,
        warrantyWindowDays, includeDisposed,
      }));
    } catch (e) { toast.error((e as Error).message); setReport(null); }
    finally { setRunning(false); }
  };

  const exportCsv = () => {
    if (!report) return;
    const headers = report.columns.map((c) => c.label);
    const rows = report.rows.map((r) => report.columns.map((c) => r[c.key] ?? ""));
    downloadCsv(stampedName(`patrimonio-${kind.replace("asset_", "")}`), toCsv(headers, rows));
  };

  const kindLabel = cfg.label;
  const itemsStatus = useMemo(() => STATUS_OPTIONS, []);

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/admin/patrimonio" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={15} /> Patrimônio
      </Link>

      <header className="mb-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText size={22} /> Relatórios de patrimônio</h1>
        <p className="text-sm text-muted-foreground">Filtre, gere na tela, exporte em CSV ou imprima em A4.</p>
      </header>

      <PatrimonioTabs active="relatorios" />

      {/* Tipo */}
      <div className="flex flex-wrap gap-2 my-4">
        {KINDS.map((k) => (
          <button key={k.value} onClick={() => { setKind(k.value); setReport(null); }}
            className={cn("px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors",
              kind === k.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground")}>
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mb-4">{cfg.hint}</p>

      {/* Filtros */}
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        <TickList label="Categorias" items={categories.map((c) => ({ id: c.id, name: c.name }))}
          selected={categoryIds} onChange={setCategoryIds} />
        <TickList label="Locais" items={locations.map((l) => ({ id: l.id, name: l.name }))}
          selected={locationIds} onChange={setLocationIds} searchable />
        <TickList label="Status" items={itemsStatus} selected={statuses} onChange={setStatuses} />
        <TickList label="Responsáveis" items={staff.map((s) => ({ id: s.id, name: s.name }))}
          selected={custodianIds} onChange={setCustodianIds} searchable />
      </div>

      <div className="flex gap-3 flex-wrap items-end mb-4">
        {cfg.dated && (
          <>
            <div><label className="field-label">De</label>
              <input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="field-label">Até</label>
              <input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </>
        )}
        {kind === "asset_warranty" && (
          <div><label className="field-label">Janela (dias)</label>
            <input type="number" className="field-input w-28" value={warrantyWindowDays}
              onChange={(e) => setWarrantyWindowDays(Number(e.target.value) || 90)} /></div>
        )}
        {kind !== "asset_disposals" && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer pb-2.5">
            <input type="checkbox" checked={includeDisposed} onChange={(e) => setIncludeDisposed(e.target.checked)} />
            Incluir baixados
          </label>
        )}
        <button onClick={run} disabled={running}
          className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-60">
          {running ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Gerar relatório
        </button>
      </div>

      {report && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <p className="text-xs text-muted-foreground">
              {report.meta.rowCount} linha(s) · {report.meta.filterSummary}
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

function ReportTable({ report }: { report: AssetReport }) {
  return (
    <table className="stk-table w-full text-sm">
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
                  c.key === "ativo" ? "text-foreground" : "text-muted-foreground")}>
                  {typeof v === "number" && MONEY_COLS.has(c.key) ? money(v) : (v ?? "")}
                </td>
              );
            })}
          </tr>
        ))}
        {report.rows.length === 0 && (
          <tr><td colSpan={report.columns.length || 1} className="px-4 py-12 text-center text-muted-foreground">
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
                  ? (MONEY_COLS.has(c.key) ? money(report.totals[c.key]) : report.totals[c.key])
                  : "")}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
