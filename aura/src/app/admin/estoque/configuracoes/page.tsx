// src/app/admin/estoque/configuracoes/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { StockCategory, StockLocation, StockSettings, StockCategoryScope, StockLocationType } from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Save, Loader2, Pencil, X, Sparkles, Tag, MapPin, SlidersHorizontal } from "lucide-react";

type Tab = "categorias" | "locais" | "parametros";

const SCOPE_LABEL: Record<StockCategoryScope, string> = {
  consumable: "Consumível", asset: "Patrimônio", both: "Ambos",
};
const LOCATION_TYPES: { value: StockLocationType; label: string }[] = [
  { value: "warehouse", label: "Almoxarifado" }, { value: "kitchen", label: "Cozinha" },
  { value: "bar", label: "Bar" }, { value: "laundry", label: "Lavanderia" },
  { value: "cabin", label: "Cabana" }, { value: "other", label: "Outro" },
];

const SEED_CATEGORIES: Partial<StockCategory>[] = [
  { icon: "📦", name: "Utensílios hóspedes", appliesTo: "consumable" },
  { icon: "🧹", name: "Produtos de Limpeza", appliesTo: "consumable" },
  { icon: "🛏", name: "Lavanderia", appliesTo: "consumable" },
  { icon: "🧴", name: "Insumos", appliesTo: "consumable" },
  { icon: "🪣", name: "Equipamentos", appliesTo: "asset" },
  { icon: "🍺", name: "Frigobar", appliesTo: "consumable" },
  { icon: "🥖", name: "Alimentos e Bebidas", appliesTo: "consumable" },
  { icon: "🗑", name: "Descartáveis", appliesTo: "consumable" },
];

export default function EstoqueConfigPage() {
  const { currentProperty: property } = useProperty();
  const [tab, setTab] = useState<Tab>("categorias");

  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [settings, setSettings] = useState<StockSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [catForm, setCatForm] = useState<Partial<StockCategory> | null>(null);
  const [locForm, setLocForm] = useState<Partial<StockLocation> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      const [cats, locs, sett] = await Promise.all([
        StockClient.categories(property.id),
        StockClient.locations(property.id),
        StockClient.settings(property.id),
      ]);
      setCategories(cats); setLocations(locs); setSettings(sett);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [property?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Categorias ───────────────────────────────────────────────────────────────
  const saveCategory = async () => {
    if (!property?.id || !catForm?.name?.trim()) { toast.error("Informe o nome da categoria."); return; }
    setSaving(true);
    try {
      await StockClient.saveCategory({ ...catForm, propertyId: property.id });
      setCatForm(null); await load(); toast.success("Categoria salva.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const deleteCategory = async (id: string) => {
    if (!property?.id || !confirm("Remover esta categoria?")) return;
    try { await StockClient.deleteCategory(property.id, id); await load(); toast.success("Categoria removida."); }
    catch (e) { toast.error((e as Error).message); }
  };
  const seedCategories = async () => {
    if (!property?.id) return;
    setSaving(true);
    try {
      for (const c of SEED_CATEGORIES) await StockClient.saveCategory({ ...c, propertyId: property.id });
      await load(); toast.success("Categorias sugeridas criadas.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  // ── Locais ───────────────────────────────────────────────────────────────────
  const saveLocation = async () => {
    if (!property?.id || !locForm?.name?.trim()) { toast.error("Informe o nome do local."); return; }
    setSaving(true);
    try {
      await StockClient.saveLocation({ ...locForm, propertyId: property.id });
      setLocForm(null); await load(); toast.success("Local salvo.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const deleteLocation = async (id: string) => {
    if (!property?.id || !confirm("Remover este local?")) return;
    try { await StockClient.deleteLocation(property.id, id); await load(); toast.success("Local removido."); }
    catch (e) { toast.error((e as Error).message); }
  };

  // ── Parâmetros ───────────────────────────────────────────────────────────────
  const saveSettings = async () => {
    if (!property?.id || !settings) return;
    setSaving(true);
    try {
      await StockClient.saveSettings({ ...settings, propertyId: property.id });
      toast.success("Parâmetros salvos.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Configurações do Estoque</h1>
        <p className="text-sm text-muted-foreground">Categorias, locais e parâmetros de alerta.</p>
      </header>

      <div className="flex gap-1 mb-6 bg-secondary/40 p-1 rounded-xl w-fit">
        {([["categorias", "Categorias", Tag], ["locais", "Locais", MapPin], ["parametros", "Parâmetros", SlidersHorizontal]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors",
              tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : tab === "categorias" ? (
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{categories.length} categoria(s)</span>
            <div className="flex gap-2">
              {categories.length === 0 && (
                <button onClick={seedCategories} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-secondary text-foreground hover:bg-secondary/70">
                  <Sparkles size={14} /> Criar sugeridas
                </button>
              )}
              <button onClick={() => setCatForm({ appliesTo: "consumable", active: true })}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:opacity-90">
                <Plus size={14} /> Nova categoria
              </button>
            </div>
          </div>

          {catForm && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-[60px_1fr_160px] gap-3">
                <div><label className="field-label">Ícone</label>
                  <input className="field-input w-full text-center" placeholder="📦" value={catForm.icon ?? ""}
                    onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} /></div>
                <div><label className="field-label">Nome</label>
                  <input className="field-input w-full" placeholder="Ex.: Produtos de Limpeza" value={catForm.name ?? ""}
                    onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
                <div><label className="field-label">Aplica-se a</label>
                  <select className="field-input w-full" value={catForm.appliesTo ?? "consumable"}
                    onChange={(e) => setCatForm({ ...catForm, appliesTo: e.target.value as StockCategoryScope })}>
                    {Object.entries(SCOPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setCatForm(null)} className="px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"><X size={14} /></button>
                <button onClick={saveCategory} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
                <span className="text-xl w-7 text-center">{c.icon || "📦"}</span>
                <span className="flex-1 font-medium text-foreground">{c.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-secondary text-muted-foreground">{SCOPE_LABEL[c.appliesTo]}</span>
                <button onClick={() => setCatForm(c)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                <button onClick={() => deleteCategory(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
              </div>
            ))}
            {categories.length === 0 && !catForm && (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma categoria ainda.</p>
            )}
          </div>
        </section>
      ) : tab === "locais" ? (
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{locations.length} local(is)</span>
            <button onClick={() => setLocForm({ type: "warehouse", active: true })}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:opacity-90">
              <Plus size={14} /> Novo local
            </button>
          </div>

          {locForm && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-[1fr_200px] gap-3">
                <div><label className="field-label">Nome</label>
                  <input className="field-input w-full" placeholder="Ex.: Almoxarifado Central" value={locForm.name ?? ""}
                    onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} /></div>
                <div><label className="field-label">Tipo</label>
                  <select className="field-input w-full" value={locForm.type ?? "warehouse"}
                    onChange={(e) => setLocForm({ ...locForm, type: e.target.value as StockLocationType })}>
                    {LOCATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select></div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setLocForm(null)} className="px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"><X size={14} /></button>
                <button onClick={saveLocation} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {locations.map((l) => (
              <div key={l.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
                <MapPin size={16} className="text-muted-foreground" />
                <span className="flex-1 font-medium text-foreground">{l.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-secondary text-muted-foreground">
                  {LOCATION_TYPES.find((t) => t.value === l.type)?.label ?? l.type}
                </span>
                <button onClick={() => setLocForm(l)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                <button onClick={() => deleteLocation(l.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
              </div>
            ))}
            {locations.length === 0 && !locForm && (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum local ainda. Crie ao menos um (ex.: Almoxarifado).</p>
            )}
          </div>
        </section>
      ) : settings ? (
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4 max-w-lg">
          <div>
            <label className="field-label">Dias sem giro (alerta de baixa rotatividade)</label>
            <input type="number" className="field-input w-full" value={settings.noTurnoverDays}
              onChange={(e) => setSettings({ ...settings, noTurnoverDays: Number(e.target.value) })} />
          </div>
          <div>
            <label className="field-label">Antecedência do alerta de validade (dias)</label>
            <input type="number" className="field-input w-full" value={settings.expiryAlertLeadDays}
              onChange={(e) => setSettings({ ...settings, expiryAlertLeadDays: Number(e.target.value) })} />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={settings.autoLossOnExpiry}
              onChange={(e) => setSettings({ ...settings, autoLossOnExpiry: e.target.checked })}
              className="w-4 h-4 accent-primary" />
            <span className="text-sm text-foreground">Registrar perda automática ao vencer (Fase 2)</span>
          </label>
          <button onClick={saveSettings} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar parâmetros
          </button>
        </section>
      ) : null}
    </div>
  );
}
