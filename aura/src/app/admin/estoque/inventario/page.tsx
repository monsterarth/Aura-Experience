// src/app/admin/estoque/inventario/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { InventoryCount, InventoryCountStatus, StockCabinOption, StockCategory, StockLocation } from "@/types/aura";
import StockLocationPicker from "@/components/admin/StockLocationPicker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDiscardGuard } from "@/lib/use-discard-guard";
import { Plus, Loader2, Save, X, ClipboardList, Trash2, CheckCircle2, Lock } from "lucide-react";

const STATUS: Record<InventoryCountStatus, { label: string; cls: string }> = {
  open: { label: "Aberto", cls: "bg-secondary text-muted-foreground" },
  counting: { label: "Em contagem", cls: "bg-blue-500/15 text-blue-500" },
  closed: { label: "Fechado", cls: "bg-emerald-500/15 text-emerald-500" },
};

export default function InventarioPage() {
  const { currentProperty: property } = useProperty();
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [cabinOptions, setCabinOptions] = useState<StockCabinOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Só cabana que já tem local: cabana sem local não tem saldo para contar.
  const countableCabins = React.useMemo(() => cabinOptions.filter((c) => c.locationId), [cabinOptions]);
  const cabinOf = (locationId: string) => countableCabins.find((c) => c.locationId === locationId)?.id ?? "";

  const [newForm, setNewForm] = useState<{ locationId: string; scope: string[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const requestCloseNew = useDiscardGuard(newForm, () => setNewForm(null));

  const [detail, setDetail] = useState<InventoryCount | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const [c, l, cat, cabins] = await Promise.all([
        StockClient.inventoryCounts(property.id), StockClient.locations(property.id),
        StockClient.categories(property.id), StockClient.cabinOptions(property.id),
      ]);
      // Ponto de consumo total não tem o que contar (transferir p/ lá já é saída);
      // locais de consumo POR CATEGORIA continuam contáveis (têm saldos isentos).
      setCounts(c); setLocations(l.filter((x) => x.active && x.policy !== "consume_all")); setCategories(cat); setCabinOptions(cabins);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    if (!property?.id) return;
    try {
      const c = await StockClient.inventoryCount(property.id, id);
      setDetail(c);
      const d: Record<string, string> = {};
      for (const it of c.items ?? []) d[it.id] = it.countedQty === null || it.countedQty === undefined ? "" : String(it.countedQty);
      setDraft(d);
    } catch (e) { toast.error((e as Error).message); }
  };

  const create = async () => {
    if (!property?.id || !newForm?.locationId) { toast.error("Selecione um local."); return; }
    setCreating(true);
    try {
      const { id } = await StockClient.createCount(property.id, newForm.locationId, newForm.scope);
      setNewForm(null); await load(); await openDetail(id); toast.success("Inventário aberto.");
    } catch (e) { toast.error((e as Error).message); } finally { setCreating(false); }
  };

  const saveItems = async () => {
    if (!property?.id || !detail) return;
    setBusy(true);
    try {
      const items = (detail.items ?? []).map((it) => ({ id: it.id, countedQty: draft[it.id] === "" || draft[it.id] === undefined ? null : Number(draft[it.id]) }));
      await StockClient.saveCountItems(property.id, detail.id, items);
      await openDetail(detail.id); toast.success("Contagem salva.");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const close = async () => {
    if (!property?.id || !detail) return;
    if (!confirm("Fechar o inventário? As diferenças viram ajustes de estoque e a acuracidade é calculada.")) return;
    setBusy(true);
    try {
      await saveItemsSilent();
      const { accuracy } = await StockClient.closeCount(property.id, detail.id);
      toast.success(`Inventário fechado. Acuracidade ${accuracy}%.`);
      setDetail(null); await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const saveItemsSilent = async () => {
    if (!property?.id || !detail) return;
    const items = (detail.items ?? []).map((it) => ({ id: it.id, countedQty: draft[it.id] === "" || draft[it.id] === undefined ? null : Number(draft[it.id]) }));
    await StockClient.saveCountItems(property.id, detail.id, items);
  };

  const removeCount = async (id: string) => {
    if (!property?.id || !confirm("Excluir este inventário?")) return;
    try { await StockClient.deleteCount(property.id, id); await load(); toast.success("Inventário excluído."); }
    catch (e) { toast.error((e as Error).message); }
  };

  const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
  const editing = detail?.status !== "closed";

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><ClipboardList size={22} /> Inventário</h1>
          <p className="text-sm text-muted-foreground">{counts.length} contagem(ns)</p>
        </div>
        <button onClick={() => setNewForm({ locationId: "", scope: [] })}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90">
          <Plus size={16} /> Novo inventário
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <>
        {/* Mobile: cards */}
        <div className="md:hidden space-y-2.5">
          {counts.map((c) => (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-4">
              <div onClick={() => openDetail(c.id)} className="cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground truncate">{c.location?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(c.startedAt)}</p>
                  </div>
                  <span className={cn("shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md", STATUS[c.status].cls)}>
                    {STATUS[c.status].label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border/60 text-xs">
                  <span className="text-muted-foreground">{c.itemCount ?? 0} item(ns)</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {c.accuracy != null ? `${c.accuracy}% de acuracidade` : "—"}
                  </span>
                </div>
              </div>
              {c.status !== "closed" && (
                <div className="flex justify-end mt-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => removeCount(c.id)} aria-label="Excluir"
                    className="p-2 rounded-lg bg-secondary/60 text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          ))}
          {counts.length === 0 && (
            <div className="bg-card border border-border rounded-2xl px-4 py-12 text-center text-sm text-muted-foreground">Nenhum inventário ainda.</div>
          )}
        </div>

        {/* Desktop: tabela */}
        <div className="hidden md:block bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-3">Aberto em</th>
                <th className="text-left px-4 py-3">Local</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Itens</th>
                <th className="text-right px-4 py-3">Acuracidade</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 cursor-pointer" onClick={() => openDetail(c.id)}>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(c.startedAt)}</td>
                  <td className="px-4 py-3 text-foreground">{c.location?.name ?? "—"}</td>
                  <td className="px-4 py-3"><span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md", STATUS[c.status].cls)}>{STATUS[c.status].label}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.itemCount ?? 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{c.accuracy != null ? `${c.accuracy}%` : "—"}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {c.status !== "closed" && (
                      <div className="flex justify-end"><button onClick={() => removeCount(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button></div>
                    )}
                  </td>
                </tr>
              ))}
              {counts.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Nenhum inventário ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Modal novo inventário */}
      {newForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={requestCloseNew}>
          <div className="bg-card border border-border w-full max-w-md rounded-3xl shadow-2xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold text-foreground">Novo inventário</h2>
              <button onClick={requestCloseNew} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="field-label">Local *</label>
                {/* Com cabanas: contar o enxoval de uma cabana é caso de uso real. Só as que
                    já têm local aparecem — cabana sem local não tem o que contar. */}
                <StockLocationPicker locations={locations} cabins={countableCabins}
                  value={{ locationId: newForm.locationId, cabinId: cabinOf(newForm.locationId) }}
                  onChange={(p) => setNewForm({
                    ...newForm,
                    locationId: p.cabinId
                      ? (countableCabins.find((c) => c.id === p.cabinId)?.locationId ?? "")
                      : p.locationId,
                  })} />
              </div>
              <div>
                <label className="field-label">Categorias (vazio = todas)</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {categories.map((c) => {
                    const on = newForm.scope.includes(c.id);
                    return (
                      <button key={c.id} type="button"
                        onClick={() => setNewForm({ ...newForm, scope: on ? newForm.scope.filter((x) => x !== c.id) : [...newForm.scope, c.id] })}
                        className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold border", on ? "bg-primary/15 border-primary/40 text-foreground" : "bg-secondary border-border text-muted-foreground")}>
                        {c.icon} {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={requestCloseNew} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={create} disabled={creating} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Abrir contagem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detalhe da contagem */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-2xl rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-foreground">Contagem · {detail.location?.name ?? ""}</h2>
                <p className="text-xs text-muted-foreground">
                  {STATUS[detail.status].label}
                  {detail.accuracy != null && <> · acuracidade <b className="text-foreground">{detail.accuracy}%</b></>}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                    <th className="text-left py-2">Produto</th>
                    <th className="text-right py-2">Sistema</th>
                    <th className="text-right py-2">Contado</th>
                    <th className="text-right py-2">Dif.</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.items ?? []).map((it) => {
                    const counted = draft[it.id];
                    const diff = counted === "" || counted === undefined ? null : Number(counted) - Number(it.systemQty);
                    return (
                      <tr key={it.id} className="border-b border-border/40 last:border-0">
                        <td className="py-2 text-foreground">{it.product?.name ?? "—"} <span className="text-xs text-muted-foreground">{it.product?.unit}</span></td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{Number(it.systemQty)}</td>
                        <td className="py-2 text-right">
                          {editing ? (
                            <input type="number" className="field-input w-20 text-right py-1" value={counted ?? ""}
                              onChange={(e) => setDraft({ ...draft, [it.id]: e.target.value })} />
                          ) : <span className="tabular-nums">{it.countedQty ?? "—"}</span>}
                        </td>
                        <td className={cn("py-2 text-right tabular-nums font-bold", diff == null ? "text-muted-foreground" : diff === 0 ? "text-emerald-500" : "text-amber-500")}>
                          {diff == null ? "—" : (diff > 0 ? `+${diff}` : diff)}
                        </td>
                      </tr>
                    );
                  })}
                  {(detail.items ?? []).length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Sem itens no escopo.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {editing && (
              <div className="p-5 border-t border-border flex justify-between gap-2">
                <button onClick={saveItems} disabled={busy} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-secondary text-foreground">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar contagem
                </button>
                <button onClick={close} disabled={busy} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
                  <Lock size={15} /> Fechar e ajustar
                </button>
              </div>
            )}
            {!editing && (
              <div className="p-5 border-t border-border flex items-center justify-center gap-2 text-emerald-500 text-sm font-bold">
                <CheckCircle2 size={16} /> Inventário fechado · acuracidade {detail.accuracy}%
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
