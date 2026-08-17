// src/app/admin/estoque/movimentacoes/historico/page.tsx
// Histórico completo de movimentações — a tela onde as OBSERVAÇÕES escritas no
// lançamento ficam legíveis. A página de Movimentações é para lançar; esta é
// para procurar: filtra por período, tipo, produto, estoque, responsável e
// texto da observação, com paginação no servidor.
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import {
  StockProduct, StockLocation, StockMovement, StockMovementType,
  StockStaffOption, StockMovementHistoryFilters,
} from "@/types/aura";
import StaffSelect from "@/components/admin/StaffSelect";
import ProductDetailModal from "@/components/admin/ProductDetailModal";
import StockBatchPanel from "@/components/admin/StockBatchPanel";
import { splitLocations } from "@/lib/stock-locations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Loader2, ArrowLeft, History, Search, X, MessageSquareText,
  ArrowDownToLine, ArrowUpFromLine, Repeat, SlidersHorizontal, AlertOctagon,
  ChevronLeft, ChevronRight, ChevronDown,
} from "lucide-react";

const TYPES: { value: StockMovementType; label: string; icon: React.ElementType; color: string }[] = [
  { value: "entry", label: "Entrada", icon: ArrowDownToLine, color: "text-emerald-500" },
  { value: "exit", label: "Saída", icon: ArrowUpFromLine, color: "text-orange-500" },
  { value: "transfer", label: "Transferência", icon: Repeat, color: "text-blue-500" },
  { value: "adjustment", label: "Ajuste", icon: SlidersHorizontal, color: "text-violet-500" },
  { value: "loss", label: "Perda", icon: AlertOctagon, color: "text-red-500" },
];
const LOSS_LABEL: Record<string, string> = {
  expiry: "Vencimento", damage: "Quebra/Danificação", handling: "Manipulação", other: "Outros",
};
// Movimentação que nasceu de outro módulo — vale sinalizar de onde veio.
const ORIGIN_LABEL: Record<string, string> = {
  purchase: "Compra", consumption: "Consumo", inventory: "Inventário",
  concierge: "Concierge", minibar: "Frigobar", fb: "A&B",
};
const PERIOD_PRESETS = [
  { days: 7, label: "7 dias" }, { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" }, { days: 0, label: "Tudo" },
];
const PAGE_SIZE = 50;

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

interface FilterState {
  from: string; to: string; types: StockMovementType[];
  productId: string; locationId: string; responsibleId: string;
  search: string; onlyWithNotes: boolean;
}
const emptyFilters: FilterState = {
  from: "", to: "", types: [], productId: "", locationId: "",
  responsibleId: "", search: "", onlyWithNotes: false,
};

export default function EstoqueHistoricoPage() {
  const { currentProperty: property } = useProperty();

  const [products, setProducts] = useState<StockProduct[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [staff, setStaff] = useState<StockStaffOption[]>([]);

  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  // A busca por texto tem debounce próprio: digitar não pode disparar um request por tecla.
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState<string | null>(null);
  // Lote expandido. É por dentro desta expansão que o estorno acontece.
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const toggleBatch = (batchRef: string) =>
    setOpenBatch((cur) => (cur === batchRef ? null : batchRef));

  useEffect(() => {
    if (!property?.id) return;
    Promise.all([
      StockClient.products(property.id),
      StockClient.locations(property.id),
      StockClient.movementStaff(property.id),
    ]).then(([p, l, s]) => { setProducts(p); setLocations(l); setStaff(s); })
      .catch((e) => toast.error((e as Error).message));
  }, [property?.id]);

  // Deep-link: "ver histórico" a partir de um estoque ou da ficha de um produto.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const locationId = p.get("locationId") ?? "";
    const productId = p.get("productId") ?? "";
    if (!locationId && !productId) return;
    setFilters((f) => ({ ...f, locationId, productId }));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput })), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Qualquer mudança de filtro volta para a primeira página — senão a tela abre vazia.
  useEffect(() => { setPage(1); }, [filters]);

  const load = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      const query: StockMovementHistoryFilters = {
        from: filters.from || undefined,
        to: filters.to || undefined,
        types: filters.types.length ? filters.types : undefined,
        productId: filters.productId || undefined,
        locationId: filters.locationId || undefined,
        responsibleId: filters.responsibleId || undefined,
        search: filters.search.trim() || undefined,
        onlyWithNotes: filters.onlyWithNotes || undefined,
        page, pageSize: PAGE_SIZE,
      };
      const r = await StockClient.movementHistory(property.id, query);
      setRows(r.rows); setTotal(r.total);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id, filters, page]);
  useEffect(() => { load(); }, [load]);

  // Cabanas num optgroup no fim: a lista plana é o que se usa todo dia.
  // numeric:true para "Cabana 10" vir depois de "Cabana 9", não antes.
  const locationOptions = useMemo(() => {
    const byName = (a: StockLocation, b: StockLocation) => a.name.localeCompare(b.name, "pt-BR", { numeric: true });
    const { flat, cabinBacked } = splitLocations(locations.filter((l) => l.active));
    return { flat: [...flat].sort(byName), cabins: [...cabinBacked].sort(byName) };
  }, [locations]);

  const toggleType = (t: StockMovementType) => setFilters((f) => ({
    ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t],
  }));

  const setPeriod = (days: number) => setFilters((f) => ({
    ...f, from: days ? isoDaysAgo(days) : "", to: "",
  }));

  const clearAll = () => { setFilters(emptyFilters); setSearchInput(""); };

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.from || filters.to) n++;
    if (filters.types.length) n++;
    if (filters.productId) n++;
    if (filters.locationId) n++;
    if (filters.responsibleId) n++;
    if (filters.search.trim()) n++;
    if (filters.onlyWithNotes) n++;
    return n;
  }, [filters]);

  const typeMeta = (t: StockMovementType) => TYPES.find((x) => x.value === t)!;
  const fmtDate = (s: string) => new Date(s).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/admin/estoque/movimentacoes"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={14} /> Movimentações
      </Link>

      <header className="mb-5">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><History size={22} /> Histórico</h1>
        <p className="text-sm text-muted-foreground">
          Tudo que já foi movimentado, com as observações de cada lançamento.
        </p>
      </header>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIOD_PRESETS.map((p) => {
            const on = p.days ? filters.from === isoDaysAgo(p.days) && !filters.to : !filters.from && !filters.to;
            return (
              <button key={p.label} onClick={() => setPeriod(p.days)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                  on ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground")}>
                {p.label}
              </button>
            );
          })}
          <span className="w-px h-5 bg-border mx-1" />
          {TYPES.map((t) => {
            const Icon = t.icon;
            const on = filters.types.includes(t.value);
            return (
              <button key={t.value} onClick={() => toggleType(t.value)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                  on ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground")}>
                <Icon size={13} className={on ? "" : t.color} /> {t.label}
              </button>
            );
          })}
          {activeCount > 0 && (
            <button onClick={clearAll}
              className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground">
              <X size={13} /> Limpar {activeCount} filtro(s)
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="field-label">Produto</label>
            <select className="field-input w-full" value={filters.productId}
              onChange={(e) => setFilters({ ...filters, productId: e.target.value })}>
              <option value="">Todos</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Estoque (origem ou destino)</label>
            <select className="field-input w-full" value={filters.locationId}
              onChange={(e) => setFilters({ ...filters, locationId: e.target.value })}>
              <option value="">Todos</option>
              {locationOptions.flat.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              {locationOptions.cabins.length > 0 && (
                <optgroup label="Cabanas">
                  {locationOptions.cabins.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label className="field-label">Responsável</label>
            <StaffSelect staff={staff} value={filters.responsibleId} placeholder="Todos"
              onChange={(id) => setFilters({ ...filters, responsibleId: id })} />
          </div>
          <div>
            <label className="field-label">Buscar na observação</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="field-input w-full pl-9" placeholder="Ex.: vencido, sobra, festa"
                value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label">De</label>
            <input type="date" className="field-input" value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Até</label>
            <input type="date" className="field-input" value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer pb-2.5">
            <input type="checkbox" checked={filters.onlyWithNotes} className="w-4 h-4 accent-primary"
              onChange={(e) => setFilters({ ...filters, onlyWithNotes: e.target.checked })} />
            <span className="text-sm text-foreground flex items-center gap-1.5">
              <MessageSquareText size={14} className="text-muted-foreground" /> Só com observação
            </span>
          </label>
        </div>
      </div>

      {/* Resultado */}
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {loading ? "Carregando…" : total === 0 ? "Nenhuma movimentação" : `${firstRow}–${lastRow} de ${total}`}
        </h2>
        {lastPage > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg bg-secondary/50 text-muted-foreground hover:text-foreground disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-muted-foreground tabular-nums px-1">{page} / {lastPage}</span>
            <button onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page >= lastPage || loading}
              className="p-1.5 rounded-lg bg-secondary/50 text-muted-foreground hover:text-foreground disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Produto</th>
                <th className="text-right px-4 py-3">Qtd.</th>
                <th className="text-left px-4 py-3">Origem → Destino</th>
                <th className="text-left px-4 py-3">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const meta = typeMeta(m.type);
                const Icon = meta.icon;
                const origin = m.referenceType && m.referenceType !== "manual" ? ORIGIN_LABEL[m.referenceType] : null;
                return (
                  <React.Fragment key={m.id}>
                    <tr onClick={() => m.productId && setProductId(m.productId)}
                      className={cn("hover:bg-secondary/30 cursor-pointer", !m.notes && "border-b border-border/50")}>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{fmtDate(m.createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn("inline-flex items-center gap-1.5 font-bold", meta.color)}>
                          <Icon size={14} /> {meta.label}
                        </span>
                        {m.type === "loss" && m.lossType && (
                          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                            {LOSS_LABEL[m.lossType] ?? m.lossType}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {m.product?.name ?? "—"}
                        {origin && (
                          <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground align-middle">
                            {origin}
                          </span>
                        )}
                        {m.batchRef && (
                          <button onClick={(e) => { e.stopPropagation(); toggleBatch(m.batchRef!); }}
                            title="Lançada em lote — clique para ver o lote inteiro e, se for o caso, estorná-lo"
                            className={cn("ml-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded align-middle transition-colors",
                              openBatch === m.batchRef ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground")}>
                            {openBatch === m.batchRef ? <ChevronDown size={10} /> : <ChevronRight size={10} />} Lote
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap">
                        {Number(m.quantity)} <span className="text-xs font-normal text-muted-foreground">{m.product?.unit ?? ""}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {m.fromLocation?.name && <span>{m.fromLocation.name}{m.fromStaffName ? ` · ${m.fromStaffName}` : ""}</span>}
                        {m.fromLocation?.name && m.toLocation?.name && <span> → </span>}
                        {m.toLocation?.name && <span>{m.toLocation.name}{m.toStaffName ? ` · ${m.toStaffName}` : ""}</span>}
                        {!m.fromLocation?.name && !m.toLocation?.name && "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {m.responsibleName ?? m.performedByName ?? "—"}
                      </td>
                    </tr>
                    {/* Detalhe do lote. O estorno vive AQUI dentro: não dá para inverter um
                        lote sem antes ver, na íntegra, o que vai ser invertido. */}
                    {m.batchRef && openBatch === m.batchRef && property && (
                      <tr className="border-b border-border/50 bg-secondary/20">
                        <td colSpan={6} className="px-4 pb-4 pt-1">
                          <StockBatchPanel propertyId={property.id} batchRef={m.batchRef}
                            onReverted={() => { setOpenBatch(null); load(); }} />
                        </td>
                      </tr>
                    )}
                    {/* A observação ganha a linha inteira — é o motivo desta tela existir. */}
                    {m.notes && (
                      <tr onClick={() => m.productId && setProductId(m.productId)}
                        className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer">
                        <td colSpan={6} className="px-4 pb-3 -mt-1">
                          <p className="flex items-start gap-1.5 text-xs text-foreground/80 bg-secondary/40 rounded-lg px-2.5 py-1.5">
                            <MessageSquareText size={13} className="shrink-0 mt-0.5 text-muted-foreground" />
                            <span className="whitespace-pre-wrap">{m.notes}</span>
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {activeCount > 0 ? "Nenhuma movimentação com esses filtros." : "Nenhuma movimentação registrada ainda."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {productId && (
        <ProductDetailModal propertyId={property.id} productId={productId} onClose={() => setProductId(null)} />
      )}
    </div>
  );
}
