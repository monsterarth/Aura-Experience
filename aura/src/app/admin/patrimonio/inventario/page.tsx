// src/app/admin/patrimonio/inventario/page.tsx
// Conferência física de patrimônio. Estrutura clonada de admin/estoque/inventario,
// com o input de CÓDIGO no lugar do input de quantidade.
//
// O input fica sempre focado: leitores de código de barras USB/Bluetooth se
// apresentam como teclado, digitam o código e mandam Enter — funcionam aqui sem
// nenhuma biblioteca. Quem não tem leitor escaneia o QR com a câmera do celular
// (que abre /p/<code>) ou marca na lista.
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import {
  AssetInventoryCount, AssetInventoryItem, AssetInventoryItemStatus,
  StockCabinOption, StockCategory, StockLocation,
} from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Loader2, Plus, ClipboardCheck, ScanLine, Trash2, CheckCircle2,
  HelpCircle, MapPinned, PackagePlus, ArrowLeft,
} from "lucide-react";
import StockLocationSelect from "@/components/admin/StockLocationSelect";
import PatrimonioTabs from "../PatrimonioTabs";

const ITEM_STATUS: Record<AssetInventoryItemStatus, { label: string; cls: string; icon: React.ElementType }> = {
  pending: { label: "Pendente", cls: "bg-secondary text-muted-foreground", icon: HelpCircle },
  found: { label: "Encontrado", cls: "bg-emerald-500/15 text-emerald-500", icon: CheckCircle2 },
  moved: { label: "Deslocado", cls: "bg-amber-500/15 text-amber-500", icon: MapPinned },
  missing: { label: "Não localizado", cls: "bg-red-500/15 text-red-500", icon: HelpCircle },
  unexpected: { label: "Inesperado", cls: "bg-sky-500/15 text-sky-500", icon: PackagePlus },
};

export default function AssetInventoryPage() {
  const { currentProperty: property } = useProperty();
  const [counts, setCounts] = useState<AssetInventoryCount[]>([]);
  const [active, setActive] = useState<AssetInventoryCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [marking, setMarking] = useState(false);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [cabins, setCabins] = useState<StockCabinOption[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [newCount, setNewCount] = useState<{ locationId: string; cabinId: string; scope: string[] } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const [list, l, cb, cat] = await Promise.all([
        StockClient.assetCounts(property.id),
        StockClient.locations(property.id),
        StockClient.cabinOptions(property.id),
        StockClient.categories(property.id),
      ]);
      setCounts(list); setLocations(l); setCabins(cb); setCategories(cat);
      const open = list.find((c) => c.status !== "closed");
      setActive(open ? await StockClient.assetCount(property.id, open.id) : null);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (active) codeRef.current?.focus(); }, [active]);

  const create = async () => {
    if (!property?.id || !newCount) return;
    setCreating(true);
    try {
      await StockClient.createAssetCount(property.id, {
        locationId: newCount.locationId || null,
        cabinId: newCount.cabinId || null,
        scope: newCount.scope,
      });
      setNewCount(null);
      toast.success("Conferência aberta.");
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setCreating(false); }
  };

  const mark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property?.id || !active || !code.trim()) return;
    setMarking(true);
    try {
      const r = await StockClient.markAssetByCode(property.id, active.id, code.trim());
      const s = ITEM_STATUS[r.status];
      toast.success(`${r.name} — ${s.label.toLowerCase()}`);
      setCode("");
      setActive(await StockClient.assetCount(property.id, active.id));
    } catch (err) { toast.error((err as Error).message); }
    finally { setMarking(false); codeRef.current?.focus(); }
  };

  const setItemStatus = async (item: AssetInventoryItem, status: AssetInventoryItemStatus) => {
    if (!property?.id || !active) return;
    try {
      await StockClient.saveAssetCountItems(property.id, active.id, [{ id: item.id, status }]);
      setActive(await StockClient.assetCount(property.id, active.id));
    } catch (e) { toast.error((e as Error).message); }
  };

  const close = async () => {
    if (!property?.id || !active) return;
    if (!confirm("Fechar a conferência? Os pendentes viram 'não localizado' e os deslocados corrigem o local do ativo.")) return;
    try {
      const r = await StockClient.closeAssetCount(property.id, active.id);
      toast.success(`Conferência fechada · ${r.accuracy}% de acuracidade.`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const removeCount = async (id: string) => {
    if (!property?.id || !confirm("Excluir esta conferência?")) return;
    try { await StockClient.deleteAssetCount(property.id, id); await load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const tally = useMemo(() => {
    const items = active?.items ?? [];
    return {
      total: items.length,
      pending: items.filter((i) => i.status === "pending").length,
      found: items.filter((i) => i.status === "found").length,
      moved: items.filter((i) => i.status === "moved").length,
      unexpected: items.filter((i) => i.status === "unexpected").length,
    };
  }, [active]);

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <Link href="/admin/patrimonio" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={15} /> Patrimônio
      </Link>

      <header className="mb-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><ClipboardCheck size={22} /> Conferência de patrimônio</h1>
        <p className="text-sm text-muted-foreground">
          Percorra o local bipando ou digitando os códigos das plaquetas. O que não for localizado vira divergência.
        </p>
      </header>

      <PatrimonioTabs active="inventario" />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : active ? (
        <div className="mt-5 space-y-5">
          {/* Bipagem */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <p className="text-sm font-bold text-foreground">
                  Conferência em {active.location?.name ?? (active.cabinId ? "cabana" : "toda a propriedade")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tally.found + tally.moved} de {active.expectedCount} localizados · {tally.pending} pendente(s)
                  {tally.unexpected > 0 && <> · {tally.unexpected} inesperado(s)</>}
                </p>
              </div>
              <button onClick={close} className="px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
                Fechar conferência
              </button>
            </div>

            <form onSubmit={mark} className="flex gap-2">
              <div className="relative flex-1">
                <ScanLine size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={codeRef}
                  className="field-input w-full pl-10 font-mono tracking-widest"
                  placeholder="Código da plaqueta ou nº de patrimônio…"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <button type="submit" disabled={marking || !code.trim()} className="px-5 py-2.5 text-sm font-bold rounded-xl bg-secondary text-foreground disabled:opacity-50">
                {marking ? <Loader2 size={15} className="animate-spin" /> : "Marcar"}
              </button>
            </form>
            <p className="text-xs text-muted-foreground mt-2">
              Leitores USB/Bluetooth funcionam direto aqui. Sem leitor, escaneie o QR com a câmera do celular ou marque na lista.
            </p>
          </div>

          {/* Lista */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <ul className="divide-y divide-border/50 max-h-[520px] overflow-y-auto">
              {(active.items ?? []).map((i) => {
                const s = ITEM_STATUS[i.status];
                return (
                  <li key={i.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{i.asset?.name ?? i.assetId}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.asset?.assetTag && <span className="font-mono">#{i.asset.assetTag} · </span>}
                        <span className="font-mono">{i.asset?.publicCode}</span>
                        {i.checkedByName && <> · por {i.checkedByName}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md", s.cls)}>{s.label}</span>
                      {i.status === "pending" ? (
                        <button onClick={() => setItemStatus(i, "found")} className="text-xs font-bold text-primary hover:underline">marcar</button>
                      ) : (
                        <button onClick={() => setItemStatus(i, "pending")} className="text-xs text-muted-foreground hover:text-foreground">desfazer</button>
                      )}
                    </div>
                  </li>
                );
              })}
              {(active.items ?? []).length === 0 && (
                <li className="px-4 py-12 text-center text-muted-foreground">Nenhum ativo no escopo desta conferência.</li>
              )}
            </ul>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          {newCount ? (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <p className="text-sm font-bold text-foreground">Nova conferência</p>
              <div className="grid md:grid-cols-2 gap-3">
                <div><label className="field-label">Local (vazio = toda a propriedade)</label>
                  <StockLocationSelect
                    value={newCount.locationId}
                    onChange={(v) => setNewCount({ ...newCount, locationId: v })}
                    locations={locations}
                    placeholder="Toda a propriedade"
                  /></div>
                <div><label className="field-label">Cabana</label>
                  <select className="field-input w-full" value={newCount.cabinId} onChange={(e) => setNewCount({ ...newCount, cabinId: e.target.value })}>
                    <option value="">—</option>
                    {cabins.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
              </div>
              <div>
                <label className="field-label">Categorias (nenhuma marcada = todas)</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {categories.filter((c) => c.appliesTo !== "consumable").map((c) => {
                    const on = newCount.scope.includes(c.id);
                    return (
                      <button key={c.id}
                        onClick={() => setNewCount({
                          ...newCount,
                          scope: on ? newCount.scope.filter((x) => x !== c.id) : [...newCount.scope, c.id],
                        })}
                        className={cn("px-3 py-1.5 text-xs font-bold rounded-lg border",
                          on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setNewCount(null)} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
                <button onClick={create} disabled={creating} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-60">
                  {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Abrir conferência
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setNewCount({ locationId: "", cabinId: "", scope: [] })}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
              <Plus size={16} /> Nova conferência
            </button>
          )}

          {/* Histórico */}
          <div className="mt-6 bg-card border border-border rounded-2xl overflow-hidden">
            <p className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">Histórico</p>
            <ul className="divide-y divide-border/50">
              {counts.filter((c) => c.status === "closed").map((c) => (
                <li key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-foreground">
                      {c.location?.name ?? "Toda a propriedade"} · {new Date(c.startedAt).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.accuracy}% · {c.foundCount ?? 0} encontrados, {c.movedCount ?? 0} deslocados,
                      {" "}{c.missingCount ?? 0} não localizados, {c.unexpectedCount ?? 0} inesperados · por {c.createdByName}
                    </p>
                  </div>
                  <button onClick={() => removeCount(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                </li>
              ))}
              {counts.filter((c) => c.status === "closed").length === 0 && (
                <li className="px-4 py-10 text-center text-muted-foreground">Nenhuma conferência concluída ainda.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
