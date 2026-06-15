// src/app/admin/patrimonio/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { Asset, AssetStatus, AssetDepreciationMethod, StockCategory, StockLocation, Supplier } from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, Loader2, Pencil, Trash2, Save, X, Landmark, ShieldCheck, Search, FileText, Camera } from "lucide-react";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { FileUpload } from "@/components/admin/FileUpload";
import { useDiscardGuard } from "@/lib/use-discard-guard";

const STATUS: Record<AssetStatus, { label: string; cls: string }> = {
  active: { label: "Ativo", cls: "bg-emerald-500/15 text-emerald-500" },
  maintenance: { label: "Manutenção", cls: "bg-amber-500/15 text-amber-500" },
  inactive: { label: "Inativo", cls: "bg-secondary text-muted-foreground" },
  disposed: { label: "Baixado", cls: "bg-red-500/15 text-red-500" },
  written_off: { label: "Baixa contábil", cls: "bg-red-500/15 text-red-500" },
};
const METHODS: { value: AssetDepreciationMethod; label: string }[] = [
  { value: "linear", label: "Linear" }, { value: "none", label: "Não deprecia" },
];

const empty: Partial<Asset> = {
  name: "", depreciationMethod: "linear", acquisitionCost: 0, residualValue: 0, status: "active",
};

export default function PatrimonioPage() {
  const { currentProperty: property } = useProperty();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Partial<Asset> | null>(null);
  const [saving, setSaving] = useState(false);
  const requestClose = useDiscardGuard(form, () => setForm(null));

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const [a, c, l, s] = await Promise.all([
        StockClient.assets(property.id), StockClient.categories(property.id),
        StockClient.locations(property.id), StockClient.suppliers(property.id),
      ]);
      setAssets(a); setCategories(c); setLocations(l); setSuppliers(s);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id]);

  useEffect(() => { load(); }, [load]);

  const setF = (patch: Partial<Asset>) => setForm((f) => ({ ...(f ?? {}), ...patch }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) =>
      a.name.toLowerCase().includes(q) || (a.assetTag ?? "").toLowerCase().includes(q) || (a.serialNumber ?? "").toLowerCase().includes(q));
  }, [assets, search]);

  const totalBook = useMemo(() => assets.reduce((s, a) => s + Number(a.bookValue ?? 0), 0), [assets]);

  const save = async () => {
    if (!property?.id || !form?.name?.trim()) { toast.error("Informe o nome do ativo."); return; }
    setSaving(true);
    try {
      await StockClient.saveAsset({ ...form, propertyId: property.id });
      setForm(null); await load(); toast.success("Ativo salvo.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    if (!property?.id || !confirm("Remover este ativo do patrimônio?")) return;
    try { await StockClient.deleteAsset(property.id, id); await load(); toast.success("Ativo removido."); }
    catch (e) { toast.error((e as Error).message); }
  };

  const money = (n?: number | null) => `R$ ${Number(n ?? 0).toFixed(2)}`;
  const warrantyActive = (a: Asset) => a.warrantyUntil ? new Date(a.warrantyUntil) >= new Date() : false;

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Landmark size={22} /> Patrimônio</h1>
          <p className="text-sm text-muted-foreground">{assets.length} ativo(s) · valor contábil {money(totalBook)}</p>
        </div>
        <button onClick={() => setForm({ ...empty })} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90">
          <Plus size={16} /> Novo ativo
        </button>
      </header>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className="field-input w-full pl-9" placeholder="Buscar por nome, nº patrimônio ou série…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-3">Ativo</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Aquisição</th>
                <th className="text-right px-4 py-3">Valor contábil</th>
                <th className="text-left px-4 py-3">Garantia</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const st = STATUS[a.status];
                return (
                  <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.assetTag && <span>#{a.assetTag} · </span>}{a.category?.name ?? "Sem categoria"}
                        {a.serialNumber && <span> · SN {a.serialNumber}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md", st.cls)}>{st.label}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(a.acquisitionCost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">{money(a.bookValue)}</td>
                    <td className="px-4 py-3 text-xs">
                      {a.warrantyUntil
                        ? <span className={cn("inline-flex items-center gap-1", warrantyActive(a) ? "text-emerald-500" : "text-muted-foreground")}>
                            <ShieldCheck size={12} /> {new Date(a.warrantyUntil).toLocaleDateString("pt-BR")}
                          </span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setForm(a)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                        <button onClick={() => remove(a.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  {assets.length === 0 ? "Nenhum ativo cadastrado." : "Nenhum ativo encontrado."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={requestClose}>
          <div className="bg-card border border-border w-full max-w-2xl rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-card z-10">
              <h2 className="text-lg font-bold text-foreground">{form.id ? "Editar ativo" : "Novo ativo"}</h2>
              <button onClick={requestClose} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-[1fr_140px] gap-3">
                <div><label className="field-label">Nome *</label>
                  <input className="field-input w-full" value={form.name ?? ""} autoFocus onChange={(e) => setF({ name: e.target.value })} /></div>
                <div><label className="field-label">Nº patrimônio</label>
                  <input className="field-input w-full" value={form.assetTag ?? ""} onChange={(e) => setF({ assetTag: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="field-label">Categoria</label>
                  <select className="field-input w-full" value={form.categoryId ?? ""} onChange={(e) => setF({ categoryId: e.target.value || null })}>
                    <option value="">—</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select></div>
                <div><label className="field-label">Local</label>
                  <select className="field-input w-full" value={form.locationId ?? ""} onChange={(e) => setF({ locationId: e.target.value || null })}>
                    <option value="">—</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select></div>
                <div><label className="field-label">Status</label>
                  <select className="field-input w-full" value={form.status ?? "active"} onChange={(e) => setF({ status: e.target.value as AssetStatus })}>
                    {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                  </select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="field-label">Marca</label>
                  <input className="field-input w-full" value={form.brand ?? ""} onChange={(e) => setF({ brand: e.target.value })} /></div>
                <div><label className="field-label">Modelo</label>
                  <input className="field-input w-full" value={form.model ?? ""} onChange={(e) => setF({ model: e.target.value })} /></div>
                <div><label className="field-label">Nº de série</label>
                  <input className="field-input w-full" value={form.serialNumber ?? ""} onChange={(e) => setF({ serialNumber: e.target.value })} /></div>
              </div>

              {/* Imagens */}
              <div className="border border-border rounded-2xl p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Camera size={13} /> Imagens</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Foto do produto</label>
                    <div className="h-36 rounded-xl overflow-hidden border border-border">
                      <ImageUpload value={form.imageUrl} onUploadSuccess={(url) => setF({ imageUrl: url })} direct maxSizeMb={15} />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Etiqueta de especificações</label>
                    <div className="h-36 rounded-xl overflow-hidden border border-border">
                      <ImageUpload value={form.specImageUrl} onUploadSuccess={(url) => setF({ specImageUrl: url })} direct maxSizeMb={15} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">Fornecedor</label>
                  <select className="field-input w-full" value={form.supplierId ?? ""} onChange={(e) => setF({ supplierId: e.target.value || null })}>
                    <option value="">—</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
                <div><label className="field-label">Data de aquisição</label>
                  <input type="date" className="field-input w-full" value={form.acquisitionDate ?? ""} onChange={(e) => setF({ acquisitionDate: e.target.value || null })} /></div>
              </div>

              {/* Depreciação */}
              <div className="border border-border rounded-2xl p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Depreciação</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="field-label">Custo de aquisição (R$)</label>
                    <input type="number" className="field-input w-full" value={form.acquisitionCost ?? 0} onChange={(e) => setF({ acquisitionCost: Number(e.target.value) })} /></div>
                  <div><label className="field-label">Método</label>
                    <select className="field-input w-full" value={form.depreciationMethod ?? "linear"} onChange={(e) => setF({ depreciationMethod: e.target.value as AssetDepreciationMethod })}>
                      {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select></div>
                </div>
                {form.depreciationMethod !== "none" && (
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="field-label">Vida útil (meses)</label>
                      <input type="number" className="field-input w-full" value={form.usefulLifeMonths ?? ""} onChange={(e) => setF({ usefulLifeMonths: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                    <div><label className="field-label">Valor residual (R$)</label>
                      <input type="number" className="field-input w-full" value={form.residualValue ?? 0} onChange={(e) => setF({ residualValue: Number(e.target.value) })} /></div>
                    <div><label className="field-label">Início depreciação</label>
                      <input type="date" className="field-input w-full" value={form.depreciationStart ?? ""} onChange={(e) => setF({ depreciationStart: e.target.value || null })} /></div>
                  </div>
                )}
                {form.id && form.bookValue != null && (
                  <p className="text-xs text-muted-foreground">Valor contábil atual: <b className="text-foreground">{money(form.bookValue)}</b> · depreciação mensal {money(form.monthlyDepreciation)}</p>
                )}
              </div>

              {/* Garantia (opcional) */}
              <div className="border border-border rounded-2xl p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><ShieldCheck size={13} /> Garantia (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="field-label">Garantia até</label>
                    <input type="date" className="field-input w-full" value={form.warrantyUntil ?? ""} onChange={(e) => setF({ warrantyUntil: e.target.value || null })} /></div>
                  <div><label className="field-label">Garantidor / loja</label>
                    <input className="field-input w-full" value={form.warrantyProvider ?? ""} onChange={(e) => setF({ warrantyProvider: e.target.value })} /></div>
                </div>
                <div><label className="field-label">Observações da garantia</label>
                  <input className="field-input w-full" value={form.warrantyNotes ?? ""} onChange={(e) => setF({ warrantyNotes: e.target.value })} /></div>
              </div>

              {/* Documentos */}
              <div className="border border-border rounded-2xl p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><FileText size={13} /> Documentos</p>
                <div><label className="field-label">Nota fiscal (PDF ou imagem)</label>
                  <FileUpload value={form.invoiceUrl} onChange={(url) => setF({ invoiceUrl: url || undefined })} label="Enviar nota fiscal" />
                </div>
                <div><label className="field-label">Documento de garantia (PDF ou imagem)</label>
                  <FileUpload value={form.warrantyDocUrl} onChange={(url) => setF({ warrantyDocUrl: url || undefined })} label="Enviar documento" />
                </div>
              </div>

              <div><label className="field-label">Observações</label>
                <textarea className="field-input w-full" rows={2} value={form.notes ?? ""} onChange={(e) => setF({ notes: e.target.value })} /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-card">
              <button onClick={requestClose} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
