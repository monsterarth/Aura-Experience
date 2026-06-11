// src/app/admin/estoque/produtos/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useProperty } from "@/context/PropertyContext";
import { supabase } from "@/lib/supabase";
import { StockClient } from "@/lib/stock-client";
import { StockProduct, StockCategory, StockUnit } from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, Loader2, Pencil, Trash2, Save, X, Package, AlertTriangle, Search } from "lucide-react";

const UNITS: StockUnit[] = ["un", "kg", "g", "L", "ml", "cx", "pct", "par", "rolo"];

const emptyForm: Partial<StockProduct> = {
  name: "", unit: "un", minStock: 0, trackExpiry: false, active: true,
};

export default function EstoqueProdutosPage() {
  const { currentProperty: property } = useProperty();
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Partial<StockProduct> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const [prods, cats] = await Promise.all([
        StockClient.products(property.id),
        StockClient.categories(property.id),
      ]);
      setProducts(prods); setCategories(cats);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [property?.id]);

  useEffect(() => {
    if (!property?.id) return;
    load();
    const channel = supabase
      .channel(`stock_prod_${property.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_balances", filter: `propertyId=eq.${property.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_products", filter: `propertyId=eq.${property.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [property?.id, load]);

  const catName = (id?: string | null) => categories.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q));
  }, [products, search]);

  const lowCount = useMemo(() => products.filter((p) => p.active && (p.totalQuantity ?? 0) < Number(p.minStock)).length, [products]);

  const save = async () => {
    if (!property?.id || !form?.name?.trim()) { toast.error("Informe o nome do produto."); return; }
    setSaving(true);
    try {
      await StockClient.saveProduct({ ...form, propertyId: property.id });
      setForm(null); await load(); toast.success("Produto salvo.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!property?.id || !confirm("Arquivar este produto? O histórico de movimentações é preservado.")) return;
    try { await StockClient.deleteProduct(property.id, id); await load(); toast.success("Produto arquivado."); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Package size={22} /> Estoque</h1>
          <p className="text-sm text-muted-foreground">
            {products.length} produto(s)
            {lowCount > 0 && <span className="text-amber-500 font-bold"> · {lowCount} em estoque mínimo</span>}
          </p>
        </div>
        <button onClick={() => setForm({ ...emptyForm })}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90">
          <Plus size={16} /> Novo produto
        </button>
      </header>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className="field-input w-full pl-9" placeholder="Buscar por nome ou SKU…" value={search}
          onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-3">Produto</th>
                <th className="text-left px-4 py-3">Categoria</th>
                <th className="text-right px-4 py-3">Saldo</th>
                <th className="text-right px-4 py-3">Mínimo</th>
                <th className="text-right px-4 py-3">Custo médio</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const qty = p.totalQuantity ?? 0;
                const low = p.active && qty < Number(p.minStock);
                return (
                  <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {low && <AlertTriangle size={14} className="text-amber-500 shrink-0" />}
                        {p.name}
                        {!p.active && <span className="text-[10px] uppercase text-muted-foreground">(inativo)</span>}
                      </div>
                      {p.sku && <div className="text-xs text-muted-foreground">{p.sku}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{catName(p.categoryId)}</td>
                    <td className={cn("px-4 py-3 text-right font-bold tabular-nums", low ? "text-amber-500" : "text-foreground")}>
                      {qty} <span className="text-xs font-normal text-muted-foreground">{p.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{Number(p.minStock)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {Number(p.averageCost) > 0 ? `R$ ${Number(p.averageCost).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setForm(p)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                        <button onClick={() => remove(p.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {products.length === 0 ? "Nenhum produto cadastrado ainda." : "Nenhum produto encontrado."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de produto */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setForm(null)}>
          <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold text-foreground">{form.id ? "Editar produto" : "Novo produto"}</h2>
              <button onClick={() => setForm(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="field-label">Nome *</label>
                <input className="field-input w-full" value={form.name ?? ""} autoFocus
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Categoria</label>
                  <select className="field-input w-full" value={form.categoryId ?? ""}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}>
                    <option value="">—</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Unidade</label>
                  <select className="field-input w-full" value={form.unit ?? "un"}
                    onChange={(e) => setForm({ ...form, unit: e.target.value as StockUnit })}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="field-label">SKU</label>
                  <input className="field-input w-full" value={form.sku ?? ""}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Estoque mínimo</label>
                  <input type="number" className="field-input w-full" value={form.minStock ?? 0}
                    onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="field-label">Estoque máximo</label>
                  <input type="number" className="field-input w-full" value={form.maxStock ?? ""}
                    onChange={(e) => setForm({ ...form, maxStock: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.trackExpiry ?? false}
                    onChange={(e) => setForm({ ...form, trackExpiry: e.target.checked })} className="w-4 h-4 accent-primary" />
                  <span className="text-sm text-foreground">Controla validade (Fase 2)</span>
                </label>
                {form.id && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.active ?? true}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-primary" />
                    <span className="text-sm text-foreground">Ativo</span>
                  </label>
                )}
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
