// src/app/admin/estoque/configuracoes/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { CabinLinkReport, StockCategory, StockLocation, StockSettings, StockCategoryScope, StockLocationType, StockLocationPolicy } from "@/types/aura";
import StockLocationSelect from "@/components/admin/StockLocationSelect";
import { splitLocations } from "@/lib/stock-locations";
import { useTabParam } from "@/lib/settings-deeplink";
import { toast } from "sonner";
import { PageShell, PageHeader, SkeletonList, useConfirm } from "@/components/aura";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Save, Loader2, Pencil, X, Sparkles, Tag, MapPin, SlidersHorizontal, Home, Link2, AlertTriangle } from "lucide-react";

type Tab = "categorias" | "locais" | "cabanas" | "parametros";

const MATCH_META: Record<string, { label: string; cls: string }> = {
  linked:       { label: "Vinculada",        cls: "bg-emerald-500/15 text-emerald-500" },
  "exact-name": { label: "Nome idêntico",    cls: "bg-blue-500/15 text-blue-500" },
  number:       { label: "Casou pelo número", cls: "bg-amber-500/15 text-amber-500" },
  none:         { label: "Sem candidato",    cls: "bg-secondary text-muted-foreground" },
};

const SCOPE_LABEL: Record<StockCategoryScope, string> = {
  consumable: "Consumível", asset: "Patrimônio", both: "Ambos",
};
const LOCATION_TYPES: { value: StockLocationType; label: string }[] = [
  { value: "warehouse", label: "Almoxarifado" }, { value: "kitchen", label: "Cozinha" },
  { value: "bar", label: "Bar" }, { value: "laundry", label: "Lavanderia" },
  { value: "cabin", label: "Cabanas" }, { value: "staff", label: "Colaboradores" },
  { value: "other", label: "Outro" },
];
const POLICY_OPTIONS: { value: StockLocationPolicy; label: string }[] = [
  { value: "stock", label: "Estoque (controla saldo)" },
  { value: "consume_all", label: "Ponto de consumo (tudo vira saída)" },
  { value: "consume_categories", label: "Ponto de consumo por categoria" },
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
  const confirm = useConfirm();
  // ?tab= vem do hub de configurações (ex.: ?tab=parametros).
  const [tab, setTab] = useState<Tab>(useTabParam(["categorias", "locais", "cabanas", "parametros"] as const, "categorias"));

  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [settings, setSettings] = useState<StockSettings | null>(null);
  const [cabinReport, setCabinReport] = useState<CabinLinkReport | null>(null);
  const [loading, setLoading] = useState(true);
  // Escolha do usuário por cabana: undefined = segue a proposta; "" = não vincular.
  const [cabinChoice, setCabinChoice] = useState<Record<string, string>>({});
  const [renameCabins, setRenameCabins] = useState(false);

  const [catForm, setCatForm] = useState<Partial<StockCategory> | null>(null);
  const [locForm, setLocForm] = useState<Partial<StockLocation> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      const [cats, locs, sett, cabins] = await Promise.all([
        StockClient.categories(property.id),
        StockClient.locations(property.id),
        StockClient.settings(property.id),
        StockClient.cabinLinks(property.id),
      ]);
      setCategories(cats); setLocations(locs); setSettings(sett); setCabinReport(cabins);
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
    if (!property?.id || !(await confirm({ title: "Remover esta categoria?", confirmLabel: "Confirmar", tone: "danger" }))) return;
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
    if (!property?.id || !(await confirm({ title: "Remover este local?", confirmLabel: "Confirmar", tone: "danger" }))) return;
    try { await StockClient.deleteLocation(property.id, id); await load(); toast.success("Local removido."); }
    catch (e) { toast.error((e as Error).message); }
  };

  // Locais derivados de cabana são gerenciados na aba Cabanas, não na lista de locais.
  const { flat: flatLocations, cabinBacked } = React.useMemo(() => splitLocations(locations), [locations]);

  // ── Cabanas × locais ─────────────────────────────────────────────────────────
  /** Local escolhido para uma cabana: a escolha manual vence a proposta. */
  const chosenFor = (cabinId: string, fallback: string | null) =>
    cabinChoice[cabinId] !== undefined ? cabinChoice[cabinId] : (fallback ?? "");

  const applyCabinLinks = async () => {
    if (!property?.id || !cabinReport) return;
    const links = cabinReport.proposals.map((p) => ({
      cabinId: p.cabin.id,
      locationId: chosenFor(p.cabin.id, p.linkedLocationId ?? p.suggestedLocationId) || null,
      rename: renameCabins,
    }));
    const toLink = links.filter((l) => l.locationId).length;
    if (!(await confirm({ title: `Vincular ${toLink} cabana(s) ao seu local de estoque?`, description: "Só o vínculo é gravado — nenhum saldo, produto ou histórico é alterado. Dá para desfazer depois trocando o local para “— não vincular —”.", confirmLabel: "Vincular" }))) return;
    setSaving(true);
    try {
      const r = await StockClient.linkCabins(property.id, links);
      setCabinChoice({});
      await load();
      toast.success(`${r.linked} vinculada(s), ${r.unlinked} desvinculada(s).`);
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  /** Tira o local do grupo "Cabanas" sem apagar nada — para o CABANAS genérico. */
  const retypeToOther = async (loc: { id: string; name: string }) => {
    if (!property?.id) return;
    if (!(await confirm({ title: `Mudar "${loc.name}" para o tipo Outro?`, description: "Ele sai do grupo Cabanas do seletor e continua com todo o saldo e histórico.", confirmLabel: "Mudar" }))) return;
    setSaving(true);
    try {
      await StockClient.saveLocation({ propertyId: property.id, id: loc.id, name: loc.name, type: "other" });
      await load(); toast.success("Local retipado.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
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
    <PageShell>
      <PageHeader
        title="Configurações do Estoque"
        subtitle="Categorias, locais e parâmetros de alerta."
      />

      <div className="flex gap-1 mb-6 bg-secondary/40 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
        {([["categorias", "Categorias", Tag], ["locais", "Locais", MapPin], ["cabanas", "Cabanas", Home], ["parametros", "Parâmetros", SlidersHorizontal]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-colors",
              tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={5} avatar={false} />
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
              <div className="grid grid-cols-1 sm:grid-cols-[60px_1fr_160px] gap-3">
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
              <div className="max-w-sm">
                <label className="field-label">Baixar de (reposição)</label>
                <StockLocationSelect locations={flatLocations} value={catForm.deductLocationId ?? ""}
                  placeholder="— nenhum (sem baixa automática) —"
                  onChange={(id) => setCatForm({ ...catForm, deductLocationId: id || null })} />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Local padrão de onde os produtos desta categoria saem quando o mensageiro entrega uma
                  reposição. Cada produto pode sobrescrever no próprio cadastro.
                </p>
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
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{flatLocations.length} local(is)</span>
            <button onClick={() => setLocForm({ type: "warehouse", active: true })}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:opacity-90">
              <Plus size={14} /> Novo local
            </button>
          </div>

          {locForm && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
                <div><label className="field-label">Nome</label>
                  <input className="field-input w-full" placeholder="Ex.: Almoxarifado Central" value={locForm.name ?? ""}
                    onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} /></div>
                <div><label className="field-label">Tipo</label>
                  <select className="field-input w-full" value={locForm.type ?? "warehouse"}
                    onChange={(e) => setLocForm({ ...locForm, type: e.target.value as StockLocationType })}>
                    {LOCATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select></div>
              </div>
              {locForm.type === "staff" && (
                <p className="text-xs text-muted-foreground">
                  Ao movimentar para este local, o formulário vai pedir <b>qual colaborador</b> recebeu.
                  Basta um local desses (ex.: &quot;COLABORADORES&quot;) — o saldo continua sendo do local,
                  e o nome de quem levou fica no histórico da movimentação.
                </p>
              )}
              <div>
                <label className="field-label">Controle de saldo</label>
                <select className="field-input w-full" value={locForm.policy ?? "stock"}
                  onChange={(e) => setLocForm({ ...locForm, policy: e.target.value as StockLocationPolicy })}>
                  {POLICY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {locForm.policy === "consume_all" && (
                <p className="text-xs text-muted-foreground">
                  Setor que <b>não controla estoque</b> (ex.: refeitório, lavanderia): transferir para cá é
                  registrado como <b>Saída (consumo)</b> — o setor não acumula saldo e o histórico guarda o
                  destino. Exceções que continuam transferência normal: categorias de <b>patrimônio</b> e
                  produtos marcados como <b>bem durável</b>.
                </p>
              )}
              {locForm.policy === "consume_categories" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Transferências <b>destas categorias</b> viram Saída (consumo); as demais mantêm saldo aqui
                    normalmente (ex.: o café controla alimentos, mas consome descartáveis na chegada).
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.filter((c) => c.appliesTo !== "asset").map((c) => {
                      const sel = (locForm.consumeCategoryIds ?? []).includes(c.id);
                      return (
                        <button key={c.id} type="button"
                          onClick={() => setLocForm({
                            ...locForm,
                            consumeCategoryIds: sel
                              ? (locForm.consumeCategoryIds ?? []).filter((x) => x !== c.id)
                              : [...(locForm.consumeCategoryIds ?? []), c.id],
                          })}
                          className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold border",
                            sel ? "bg-primary/15 border-primary/40 text-foreground" : "bg-secondary border-border text-muted-foreground")}>
                          {c.icon} {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
            {flatLocations.map((l) => (
              <div key={l.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
                <MapPin size={16} className="text-muted-foreground" />
                <span className="flex-1 font-medium text-foreground">{l.name}</span>
                {l.policy === "consume_all" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-amber-500/15 text-amber-500">Ponto de consumo</span>
                )}
                {l.policy === "consume_categories" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-amber-500/15 text-amber-500">
                    Consumo parcial ({(l.consumeCategoryIds ?? []).length})
                  </span>
                )}
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-secondary text-muted-foreground">
                  {LOCATION_TYPES.find((t) => t.value === l.type)?.label ?? l.type}
                </span>
                <button onClick={() => setLocForm(l)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                <button onClick={() => deleteLocation(l.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
              </div>
            ))}
            {cabinBacked.length > 0 && (
              <button onClick={() => setTab("cabanas")}
                className="w-full flex items-center gap-3 bg-card border border-border border-dashed rounded-xl px-4 py-3 text-left hover:bg-secondary/30">
                <Home size={16} className="text-muted-foreground" />
                <span className="flex-1 font-medium text-muted-foreground">
                  {cabinBacked.length} local(is) de cabana
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ver na aba Cabanas</span>
              </button>
            )}
            {flatLocations.length === 0 && !locForm && (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum local ainda. Crie ao menos um (ex.: Almoxarifado).</p>
            )}
          </div>
        </section>
      ) : tab === "cabanas" ? (
        <section className="space-y-4">
          <div className="bg-secondary/40 border border-border rounded-2xl p-4 text-sm text-muted-foreground">
            Aqui as cabanas do cadastro são amarradas aos locais de estoque. O sistema <b className="text-foreground">propõe</b> o
            casamento pelo nome/número e você confirma. Confirmar grava <b className="text-foreground">só o vínculo</b> —
            nenhum saldo, produto ou histórico é tocado, e dá para desfazer. Saldo e movimentações aparecem em cada
            linha para você ver o que não é lixo antes de decidir.
          </div>

          {!cabinReport ? (
            <SkeletonList rows={5} avatar={false} />
          ) : (
            <>
              <div className="bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                      <th className="text-left px-4 py-3">Cabana</th>
                      <th className="text-left px-4 py-3">Local proposto</th>
                      <th className="text-left px-4 py-3">Match</th>
                      <th className="text-right px-4 py-3">Saldo</th>
                      <th className="text-right px-4 py-3">Movim.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cabinReport.proposals.map((p) => {
                      const chosen = chosenFor(p.cabin.id, p.linkedLocationId ?? p.suggestedLocationId);
                      const c = chosen ? cabinReport.candidates[chosen] : undefined;
                      const meta = MATCH_META[p.matchKind];
                      // Locais disponíveis: os não vinculados + o que já é desta cabana.
                      const available = Object.values(cabinReport.candidates)
                        .filter((x) => !x.cabinId || x.cabinId === p.cabin.id);
                      return (
                        <tr key={p.cabin.id} className="border-b border-border/50 last:border-0">
                          <td className="px-4 py-3 text-foreground font-medium whitespace-nowrap">{p.cabin.name}</td>
                          <td className="px-4 py-3">
                            <select className="field-input w-full py-1.5 text-xs" value={chosen}
                              onChange={(e) => setCabinChoice({ ...cabinChoice, [p.cabin.id]: e.target.value })}>
                              <option value="">— não vincular —</option>
                              {available.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md whitespace-nowrap", meta.cls)}>{meta.label}</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                            {c ? `${c.totalUnits} un · ${c.balanceRows} item(ns)` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs">{c?.movementCount ?? "—"}</td>
                        </tr>
                      );
                    })}
                    {cabinReport.proposals.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nenhuma cabana cadastrada nesta propriedade.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {cabinReport.unmatched.length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-amber-500" /> Locais de cabana sem cabana correspondente
                  </h3>
                  <div className="space-y-1.5">
                    {cabinReport.unmatched.map((u) => (
                      <div key={u.id} className="flex items-center gap-3 text-sm">
                        <MapPin size={14} className="text-muted-foreground shrink-0" />
                        <span className="flex-1 text-foreground">{u.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {u.totalUnits} un · {u.movementCount} movim.
                        </span>
                        <button onClick={() => retypeToOther(u)} disabled={saving}
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground whitespace-nowrap">
                          Mudar p/ Outro
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Provavelmente o <b>CABANAS</b> genérico e sobras. <b>Não exclua</b>: local com saldo ou histórico guarda
                    dado real. Mudar para o tipo <b>Outro</b> tira ele do grupo Cabanas do seletor sem perder nada — depois
                    dá para transferir o saldo para as cabanas certas com calma e só então desativar.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                  <input type="checkbox" checked={renameCabins} onChange={(e) => setRenameCabins(e.target.checked)}
                    className="w-4 h-4 accent-primary" />
                  Padronizar os nomes para &quot;Cabana N&quot;
                </label>
                <button onClick={applyCabinLinks} disabled={saving || cabinReport.proposals.length === 0}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-50">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Confirmar vínculos
                </button>
              </div>
            </>
          )}
        </section>
      ) : settings ? (
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4 max-w-lg">
          <div>
            <label className="field-label">Estoque principal</label>
            {/* sem cabanas: transferência sai do estoque de cadastro, não de uma cabana */}
            <StockLocationSelect locations={flatLocations} value={settings.defaultLocationId ?? ""}
              placeholder="— (sem padrão)"
              onChange={(id) => setSettings({ ...settings, defaultLocationId: id || null })} />
            <p className="text-[10px] text-muted-foreground mt-1 pl-1">Vem preenchido como origem ao lançar uma transferência. Continua trocável na hora.</p>
          </div>
          <div>
            <label className="field-label">Local de consumo padrão (baixa de Concierge/F&B)</label>
            {/* sem cabanas: rotearia todo o consumo de F&B pelo saldo de uma cabana */}
            <StockLocationSelect locations={flatLocations} value={settings.defaultSaleLocationId ?? ""}
              placeholder="— (sem baixa automática)"
              onChange={(id) => setSettings({ ...settings, defaultSaleLocationId: id || null })} />
          </div>
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
            <span className="text-sm text-foreground">Registrar perda automática ao vencer</span>
          </label>
          <button onClick={saveSettings} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar parâmetros
          </button>
        </section>
      ) : null}
    </PageShell>
  );
}
