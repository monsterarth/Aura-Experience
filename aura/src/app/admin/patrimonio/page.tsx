// src/app/admin/patrimonio/page.tsx
// Lista de ativos. O formulário virou AssetFormModal (compartilhado com a ficha)
// e a exclusão saiu da linha: para tirar um ativo do patrimônio existe a Baixa,
// na ficha — ela preserva a depreciação e o histórico.
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { Asset, AssetStatus, StockCategory, StockLocation, StockStaffOption } from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, Loader2, Landmark, ShieldCheck, Search, ChevronRight, Filter, X } from "lucide-react";
import AssetFormModal, { ASSET_STATUS, EMPTY_ASSET } from "@/components/admin/AssetFormModal";
import PatrimonioTabs from "./PatrimonioTabs";

const money = (n?: number | null) => `R$ ${Number(n ?? 0).toFixed(2)}`;

type WarrantyFilter = "" | "active" | "expiring" | "expired" | "none";

export default function PatrimonioPage() {
  const { currentProperty: property } = useProperty();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [staff, setStaff] = useState<StockStaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<Asset> | null>(null);

  // Filtros. `includeDisposed` é o único que volta ao servidor — o resto é local.
  const [search, setSearch] = useState("");
  const [includeDisposed, setIncludeDisposed] = useState(false);
  const [fStatus, setFStatus] = useState<AssetStatus | "">("");
  const [fCategory, setFCategory] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fCustodian, setFCustodian] = useState("");
  const [fWarranty, setFWarranty] = useState<WarrantyFilter>("");

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const [a, c, l, s] = await Promise.all([
        StockClient.assets(property.id, includeDisposed),
        StockClient.categories(property.id),
        StockClient.locations(property.id),
        StockClient.movementStaff(property.id),
      ]);
      setAssets(a); setCategories(c); setLocations(l); setStaff(s);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id, includeDisposed]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (q && !(
        a.name.toLowerCase().includes(q) ||
        (a.assetTag ?? "").toLowerCase().includes(q) ||
        (a.serialNumber ?? "").toLowerCase().includes(q) ||
        (a.publicCode ?? "").toLowerCase().includes(q)
      )) return false;
      if (fStatus && a.status !== fStatus) return false;
      if (fCategory && a.categoryId !== fCategory) return false;
      if (fLocation && a.locationId !== fLocation) return false;
      if (fCustodian && a.custodianId !== fCustodian) return false;
      if (fWarranty && a.warrantyStatus !== fWarranty) return false;
      return true;
    });
  }, [assets, search, fStatus, fCategory, fLocation, fCustodian, fWarranty]);

  // Total sobre o que está filtrado — inclui a baixa só se o usuário pediu.
  const totalBook = useMemo(
    () => filtered.reduce((s, a) => s + Number(a.bookValue ?? 0), 0),
    [filtered],
  );

  const hasFilters = !!(fStatus || fCategory || fLocation || fCustodian || fWarranty || includeDisposed);
  const clearFilters = () => {
    setFStatus(""); setFCategory(""); setFLocation(""); setFCustodian(""); setFWarranty("");
    setIncludeDisposed(false);
  };

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Landmark size={22} /> Patrimônio</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} ativo(s) · valor contábil {money(totalBook)}
          </p>
        </div>
        <button onClick={() => setForm({ ...EMPTY_ASSET })} className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90">
          <Plus size={16} /> Novo ativo
        </button>
      </header>

      <PatrimonioTabs active="ativos" />

      {/* Busca + filtros */}
      <div className="my-4 space-y-3">
        <div className="relative w-full sm:max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="field-input w-full pl-9" placeholder="Buscar por nome, nº, série ou plaqueta…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Filter size={14} className="hidden sm:block text-muted-foreground" />
          <select className="field-input text-xs py-1.5 w-full sm:w-auto" value={fStatus} onChange={(e) => setFStatus(e.target.value as AssetStatus | "")}>
            <option value="">Todos os status</option>
            {(Object.entries(ASSET_STATUS) as [AssetStatus, { label: string }][]).map(([v, s]) => (
              <option key={v} value={v}>{s.label}</option>
            ))}
          </select>
          <select className="field-input text-xs py-1.5 w-full sm:w-auto" value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.filter((c) => c.appliesTo !== "consumable").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="field-input text-xs py-1.5 w-full sm:w-auto" value={fLocation} onChange={(e) => setFLocation(e.target.value)}>
            <option value="">Todos os locais</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="field-input text-xs py-1.5 w-full sm:w-auto" value={fCustodian} onChange={(e) => setFCustodian(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="field-input text-xs py-1.5 w-full sm:w-auto" value={fWarranty} onChange={(e) => setFWarranty(e.target.value as WarrantyFilter)}>
            <option value="">Garantia: qualquer</option>
            <option value="active">Em garantia</option>
            <option value="expiring">Vencendo (60 dias)</option>
            <option value="expired">Vencida</option>
            <option value="none">Sem garantia</option>
          </select>
          <label className="col-span-2 sm:col-span-1 flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={includeDisposed} onChange={(e) => setIncludeDisposed(e.target.checked)} />
            Incluir baixados
          </label>
          {hasFilters && (
            <button onClick={clearFilters} className="col-span-2 sm:col-span-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <X size={12} /> limpar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <>
        {/* Mobile: cards — a tabela de 7 colunas nao cabe no celular */}
        <div className="md:hidden space-y-2.5">
          {filtered.map((a) => {
            const st = ASSET_STATUS[a.status];
            return (
              <Link key={a.id} href={`/admin/patrimonio/${a.id}`} className="block bg-card border border-border rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground truncate">{a.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {a.assetTag && <span className="font-mono">#{a.assetTag} · </span>}{a.category?.name ?? "Sem categoria"}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md", st.cls)}>{st.label}</span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border/60">
                  <span className="text-xs text-muted-foreground truncate">
                    {a.cabinName ?? a.location?.name ?? "Sem local"}{a.custodianName ? ` · ${a.custodianName}` : ""}
                  </span>
                  <span className="text-sm font-medium text-foreground tabular-nums shrink-0">{money(a.bookValue)}</span>
                </div>
                {a.warrantyUntil && (
                  <span className={cn("mt-2 inline-flex items-center gap-1 text-[11px]",
                    a.warrantyStatus === "active" && "text-emerald-500",
                    a.warrantyStatus === "expiring" && "text-amber-500",
                    a.warrantyStatus === "expired" && "text-muted-foreground",
                  )}>
                    <ShieldCheck size={11} /> Garantia até {new Date(a.warrantyUntil).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div className="bg-card border border-border rounded-2xl px-4 py-12 text-center text-sm text-muted-foreground">
              {assets.length === 0 ? "Nenhum ativo cadastrado." : "Nenhum ativo encontrado com estes filtros."}
            </div>
          )}
        </div>

        {/* Desktop: tabela */}
        <div className="hidden md:block bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-3">Ativo</th>
                <th className="text-left px-4 py-3">Local</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Aquisição</th>
                <th className="text-right px-4 py-3">Valor contábil</th>
                <th className="text-left px-4 py-3">Garantia</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const st = ASSET_STATUS[a.status];
                return (
                  <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <Link href={`/admin/patrimonio/${a.id}`} className="block">
                        <div className="font-medium text-foreground hover:text-primary">{a.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.assetTag && <span className="font-mono">#{a.assetTag} · </span>}{a.category?.name ?? "Sem categoria"}
                          {a.serialNumber && <span> · SN {a.serialNumber}</span>}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {a.cabinName ?? a.location?.name ?? "—"}
                      {a.custodianName && <div className="text-[11px]">{a.custodianName}</div>}
                    </td>
                    <td className="px-4 py-3"><span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md", st.cls)}>{st.label}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(a.acquisitionCost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">{money(a.bookValue)}</td>
                    <td className="px-4 py-3 text-xs">
                      {a.warrantyUntil ? (
                        <span className={cn("inline-flex items-center gap-1",
                          a.warrantyStatus === "active" && "text-emerald-500",
                          a.warrantyStatus === "expiring" && "text-amber-500",
                          a.warrantyStatus === "expired" && "text-muted-foreground",
                        )}>
                          <ShieldCheck size={12} /> {new Date(a.warrantyUntil).toLocaleDateString("pt-BR")}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/patrimonio/${a.id}`} className="flex justify-end text-muted-foreground hover:text-foreground">
                        <ChevronRight size={16} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  {assets.length === 0 ? "Nenhum ativo cadastrado." : "Nenhum ativo encontrado com estes filtros."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {form && (
        <AssetFormModal
          propertyId={property.id}
          initial={form}
          onClose={() => setForm(null)}
          onSaved={async () => { setForm(null); await load(); }}
        />
      )}
    </div>
  );
}
