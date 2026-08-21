// src/app/admin/estoque/locais/page.tsx — Estoques (locais) em visão de cards
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { StockLocationOverview, StockLocationType } from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Loader2, Warehouse, ChefHat, Wine, Shirt, Home, Users, Package,
  AlertTriangle, ChevronRight, Search, Plus, ArrowLeftRight,
} from "lucide-react";

/** Cada tipo de local ganha ícone e cor próprios — dá pra achar pelo formato. */
const TYPE_META: Record<StockLocationType, { label: string; plural: string; icon: React.ElementType; tint: string }> = {
  warehouse: { label: "Almoxarifado", plural: "Almoxarifados", icon: Warehouse, tint: "text-sky-500" },
  kitchen:   { label: "Cozinha",      plural: "Cozinhas",      icon: ChefHat,   tint: "text-orange-500" },
  bar:       { label: "Bar",          plural: "Bares",         icon: Wine,      tint: "text-fuchsia-500" },
  laundry:   { label: "Lavanderia",   plural: "Lavanderias",   icon: Shirt,     tint: "text-cyan-500" },
  cabin:     { label: "Cabana",       plural: "Cabanas",       icon: Home,      tint: "text-emerald-500" },
  staff:     { label: "Colaborador",  plural: "Colaboradores", icon: Users,     tint: "text-violet-500" },
  other:     { label: "Outro",        plural: "Outros",        icon: Package,   tint: "text-muted-foreground" },
};
const GROUP_ORDER: StockLocationType[] = ["warehouse", "kitchen", "bar", "laundry", "other", "staff", "cabin"];

// Tela operacional: o que importa aqui é O QUE TEM, não quanto vale.
// Valor em R$ vive na Visão Geral, em Compras e nos Relatórios.
function StockCard({ s }: { s: StockLocationOverview }) {
  const meta = TYPE_META[s.location.type] ?? TYPE_META.other;
  const Icon = meta.icon;
  const empty = s.productCount === 0;
  return (
    <Link href={`/admin/estoque/locais/${s.location.id}`}
      className={cn(
        "group bg-card border rounded-2xl p-4 flex flex-col gap-2 transition-colors",
        s.belowMinCount > 0 ? "border-amber-500/40 hover:border-amber-500" : "border-border hover:border-primary/50",
      )}>
      <div className="flex items-start gap-2">
        <span className={cn("shrink-0 mt-0.5", meta.tint)}><Icon size={17} /></span>
        <p className="flex-1 font-bold text-foreground text-sm leading-tight">{s.location.name}</p>
        <ChevronRight size={15} className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>

      {s.location.policy === "consume_all" && (
        <span className="self-start text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">
          Ponto de consumo
        </span>
      )}
      {s.location.policy === "consume_categories" && (
        <span className="self-start text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">
          Consumo parcial
        </span>
      )}

      <div>
        <p className={cn("text-lg font-bold tabular-nums leading-none", empty ? "text-muted-foreground" : "text-foreground")}>
          {empty ? "vazio" : <>{s.productCount} <span className="text-sm font-normal text-muted-foreground">item(ns)</span></>}
        </p>
        {!empty && (
          <p className="text-xs text-muted-foreground tabular-nums mt-1">{s.totalUnits} unidades</p>
        )}
      </div>

      {s.belowMinCount > 0 && (
        <p className="text-[11px] font-bold text-amber-500 flex items-center gap-1">
          <AlertTriangle size={11} /> {s.belowMinCount} abaixo do mínimo
        </p>
      )}
    </Link>
  );
}

export default function EstoquesPage() {
  const { currentProperty: property } = useProperty();
  const [stocks, setStocks] = useState<StockLocationOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try { setStocks(await StockClient.locationsOverview(property.id)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? stocks.filter((s) => s.location.name.toLowerCase().includes(term)) : stocks;
  }, [stocks, q]);

  const groups = useMemo(() => GROUP_ORDER
    .map((type) => ({ type, items: filtered.filter((s) => (s.location.type === type)) }))
    .filter((g) => g.items.length > 0), [filtered]);

  const totals = useMemo(() => ({
    units: stocks.reduce((s, x) => s + x.totalUnits, 0),
    below: stocks.reduce((s, x) => s + x.belowMinCount, 0),
  }), [stocks]);

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Warehouse size={22} /> Estoques</h1>
          <p className="text-sm text-muted-foreground">
            {stocks.length} local(is) · {totals.units} unidades em estoque
            {totals.below > 0 && <span className="text-amber-500 font-bold"> · {totals.below} item(ns) no mínimo</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/estoque/movimentacoes"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-secondary text-foreground hover:bg-secondary/70">
            <ArrowLeftRight size={16} /> Movimentar
          </Link>
          <Link href="/admin/estoque/configuracoes"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90">
            <Plus size={16} /> Novo local
          </Link>
        </div>
      </header>

      <div className="relative mb-5 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className="field-input w-full pl-9" placeholder="Buscar estoque…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-16 text-center">
          {q ? "Nenhum estoque com esse nome." : "Nenhum local cadastrado ainda."}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map(({ type, items }) => {
            const meta = TYPE_META[type];
            const Icon = meta.icon;
            // Listas longas (cabanas, colaboradores) começam recolhidas para não
            // afogar os almoxarifados, que é o que se olha todo dia.
            const collapsible = items.length > 6;
            const open = openGroups[type] ?? !collapsible;
            const shown = collapsible && !open ? items.slice(0, 4) : items;
            const groupBelow = items.reduce((s, x) => s + x.belowMinCount, 0);

            return (
              <section key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={meta.tint}><Icon size={14} /></span>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {items.length === 1 ? meta.label : meta.plural} · {items.length}
                  </h2>
                  {groupBelow > 0 && (
                    <span className="text-[11px] font-bold text-amber-500 flex items-center gap-1">
                      <AlertTriangle size={11} /> {groupBelow}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {shown.map((s) => <StockCard key={s.location.id} s={s} />)}
                  {collapsible && !open && (
                    <button onClick={() => setOpenGroups({ ...openGroups, [type]: true })}
                      className="bg-card border border-border border-dashed rounded-2xl p-4 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                      <span className="text-lg font-bold tabular-nums">+{items.length - shown.length}</span>
                      <span className="text-xs font-bold">ver todos</span>
                    </button>
                  )}
                </div>
                {collapsible && open && (
                  <button onClick={() => setOpenGroups({ ...openGroups, [type]: false })}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground mt-2">
                    Recolher {meta.plural.toLowerCase()}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
