// src/app/admin/estoque/locais/[id]/page.tsx
"use client";

import { Dialog } from "@/components/aura";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { StockClient } from "@/lib/stock-client";
import { StockCategory, StockLocationDetail, StockLocationPolicy, StockLocationType } from "@/types/aura";
import ProductDetailModal from "@/components/admin/ProductDetailModal";
import { toast } from "sonner";
import { PageShell, PageHeader, SkeletonList, useConfirm } from "@/components/aura";
import { cn } from "@/lib/utils";
import {
  Loader2, ArrowLeft, Package, AlertTriangle, Save, X, Pencil, Trash2,
  ArrowUpFromLine, Repeat, Settings2, Home,
} from "lucide-react";

const LOCATION_TYPES: { value: StockLocationType; label: string }[] = [
  { value: "warehouse", label: "Almoxarifado" }, { value: "kitchen", label: "Cozinha" },
  { value: "bar", label: "Bar" }, { value: "laundry", label: "Lavanderia" },
  { value: "cabin", label: "Cabana" }, { value: "staff", label: "Colaboradores" },
  { value: "other", label: "Outro" },
];
const POLICY_OPTIONS: { value: StockLocationPolicy; label: string }[] = [
  { value: "stock", label: "Estoque (controla saldo)" },
  { value: "consume_all", label: "Ponto de consumo (tudo vira saída)" },
  { value: "consume_categories", label: "Ponto de consumo por categoria" },
];

// Tela operacional: saldo, mínimo e histórico. Custo/valor ficam na Visão Geral,
// em Compras e nos Relatórios.
const fmtDate = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Correção de saldo em andamento: a diferença vira um ajuste. */
interface FixDraft { productId: string; name: string; current: number; unit: string; qty: string; reason: string }

export default function EstoqueLocalPage() {
  const { currentProperty: property } = useProperty();
  const confirm = useConfirm();
  const { userData } = useAuth();
  const router = useRouter();
  const locationId = String(useParams()?.id ?? "");

  const [detail, setDetail] = useState<StockLocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fix, setFix] = useState<FixDraft | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [manage, setManage] = useState<{ name: string; type: StockLocationType; active: boolean; policy: StockLocationPolicy; consumeCategoryIds: string[] } | null>(null);
  const [categories, setCategories] = useState<StockCategory[]>([]);

  const load = useCallback(async () => {
    if (!property?.id || !locationId) return;
    try {
      const [d, cats] = await Promise.all([
        StockClient.locationDetail(property.id, locationId),
        StockClient.categories(property.id),
      ]);
      setDetail(d); setCategories(cats);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id, locationId]);

  useEffect(() => { load(); }, [load]);

  const isCabin = !!detail?.location.cabinId;
  const isStaffLocation = detail?.location.type === "staff";

  const saveFix = async () => {
    if (!property?.id || !fix) return;
    const newQuantity = Number(fix.qty);
    if (!Number.isFinite(newQuantity)) { toast.error("Quantidade inválida."); return; }
    if (!fix.reason.trim()) { toast.error("Informe o motivo da correção."); return; }
    setSaving(true);
    try {
      const r = await StockClient.adjustBalance({
        propertyId: property.id, locationId, productId: fix.productId,
        newQuantity, reason: fix.reason, responsibleId: userData?.id ?? null,
      });
      setFix(null); await load();
      toast.success(r.delta === 0 ? "Saldo já estava correto." : `Ajuste de ${r.delta > 0 ? "+" : ""}${r.delta} registrado.`);
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const saveManage = async () => {
    if (!property?.id || !manage || !detail) return;
    if (!manage.name.trim()) { toast.error("Informe o nome do local."); return; }
    setSaving(true);
    try {
      await StockClient.saveLocation({
        propertyId: property.id, id: detail.location.id,
        name: manage.name.trim(), type: manage.type, active: manage.active,
        policy: manage.policy, consumeCategoryIds: manage.consumeCategoryIds,
      });
      setManage(null); await load(); toast.success("Local atualizado.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const removeLocation = async () => {
    if (!property?.id || !detail) return;
    if (!(await confirm({ title: `Excluir o local "${detail.location.name}"?`, confirmLabel: "Excluir", tone: "danger" }))) return;
    setSaving(true);
    try {
      await StockClient.deleteLocation(property.id, detail.location.id);
      toast.success("Local removido.");
      router.push("/admin/estoque/locais");
    } catch (e) { toast.error((e as Error).message); setSaving(false); }
  };

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;
  if (loading) return <SkeletonList rows={5} avatar={false} />;
  if (!detail) return <div className="p-8 text-muted-foreground">Local não encontrado.</div>;

  const movementHref = (side: "from" | "to") =>
    `/admin/estoque/movimentacoes?${side}=${encodeURIComponent(locationId)}`;

  return (
    <PageShell>
      <Link href="/admin/estoque/locais" className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={14} /> Estoques
      </Link>

      <PageHeader
        title={<>{isCabin ? <Home size={22} /> : <Package size={22} />} {detail.location.name}</>}
        subtitle={<>{LOCATION_TYPES.find((t) => t.value === detail.location.type)?.label ?? detail.location.type}
            {detail.location.policy === "consume_all" && " · ponto de consumo"}
            {detail.location.policy === "consume_categories" && ` · ponto de consumo (${(detail.location.consumeCategoryIds ?? []).length} categoria(s))`}
            {isCabin && " · derivado do cadastro de cabanas"}
            {!detail.location.active && " · inativo"}</>}
        actions={(<><div className="flex gap-2">
          <Link href={movementHref("from")}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-secondary text-foreground hover:bg-secondary/70">
            <ArrowUpFromLine size={14} /> Dar saída daqui
          </Link>
          <Link href={movementHref("to")}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-secondary text-foreground hover:bg-secondary/70">
            <Repeat size={14} /> Movimentar para cá
          </Link>
          <button onClick={() => setManage({
            name: detail.location.name, type: detail.location.type, active: detail.location.active,
            policy: detail.location.policy ?? "stock", consumeCategoryIds: detail.location.consumeCategoryIds ?? [],
          })}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-secondary text-foreground hover:bg-secondary/70">
            <Settings2 size={14} /> Gerir local
          </button>
        </div></>)}
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Itens</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{detail.items.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Unidades</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{detail.totals.units}</p>
        </div>
        <div className={cn("bg-card border rounded-2xl p-4", detail.totals.belowMin > 0 ? "border-amber-500/40" : "border-border")}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Abaixo do mínimo</p>
          <p className={cn("text-xl font-bold tabular-nums", detail.totals.belowMin > 0 ? "text-amber-500" : "text-foreground")}>
            {detail.totals.belowMin}
          </p>
        </div>
      </div>

      {/* Conteúdo */}
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">O que tem neste estoque</h2>
      {/* Mobile: cards */}
      <div className="md:hidden space-y-2.5 mb-6">
        {detail.items.map((it) => (
          <div key={it.productId} onClick={() => setProductId(it.productId)}
            className={cn("bg-card border rounded-2xl p-4 cursor-pointer", it.belowMin ? "border-amber-500/40" : "border-border")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-foreground flex items-center gap-1.5">
                  {it.belowMin && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
                  <span className="truncate">{it.name}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{it.categoryName ?? "—"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn("text-lg font-bold tabular-nums leading-none", it.belowMin && "text-amber-500")}>
                  {it.quantity}<span className="text-xs font-normal text-muted-foreground"> {it.unit}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">mín. {Number(it.minStock)}</p>
              </div>
            </div>
            <div className="flex justify-end mt-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setFix({ productId: it.productId, name: it.name, current: it.quantity, unit: it.unit, qty: String(it.quantity), reason: "" })}
                className="px-3 py-1.5 rounded-lg bg-secondary/60 text-xs font-bold text-muted-foreground hover:text-foreground">
                Corrigir saldo
              </button>
            </div>
          </div>
        ))}
        {detail.items.length === 0 && (
          <div className="bg-card border border-border rounded-2xl px-4 py-12 text-center text-sm text-muted-foreground">
            Nenhum produto com saldo neste estoque.
          </div>
        )}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden md:block bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
              <th className="text-left px-4 py-3">Produto</th>
              <th className="text-left px-4 py-3">Categoria</th>
              <th className="text-right px-4 py-3">Saldo</th>
              <th className="text-right px-4 py-3">Mínimo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((it) => (
              <tr key={it.productId} onClick={() => setProductId(it.productId)}
                className="border-b border-border/50 last:border-0 hover:bg-secondary/30 cursor-pointer">
                <td className="px-4 py-3 text-foreground">
                  {it.belowMin && <AlertTriangle size={13} className="inline mr-1.5 text-amber-500" />}
                  {it.name} <span className="text-xs text-muted-foreground">{it.unit}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{it.categoryName ?? "—"}</td>
                <td className={cn("px-4 py-3 text-right tabular-nums font-medium", it.belowMin && "text-amber-500")}>{it.quantity}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs">{Number(it.minStock)}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setFix({ productId: it.productId, name: it.name, current: it.quantity, unit: it.unit, qty: String(it.quantity), reason: "" })}
                    className="p-1.5 text-muted-foreground hover:text-foreground" title="Corrigir saldo">
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {detail.items.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Nenhum produto com saldo neste estoque.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {detail.totals.belowMin > 0 && (
        <p className="text-xs text-muted-foreground -mt-4 mb-6">
          O estoque mínimo é definido por produto (global), não por local — aqui ele serve como referência.
        </p>
      )}

      {/* Histórico do local */}
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Movimentações deste local</h2>
        <Link href={`/admin/estoque/movimentacoes/historico?locationId=${encodeURIComponent(locationId)}`}
          className="text-xs font-bold text-muted-foreground hover:text-foreground">
          Ver histórico completo →
        </Link>
      </div>
      {/* Mobile: cards */}
      <div className="md:hidden space-y-2.5">
        {detail.movements.map((m) => {
          const consumedHere = m.toLocationId === locationId && (m.type === "exit" || m.type === "loss");
          const returnedFromHere = m.fromLocationId === locationId && m.type === "entry";
          const neutral = consumedHere || returnedFromHere;
          const entering = !neutral && m.toLocationId === locationId;
          return (
            <div key={m.id} onClick={() => m.productId && setProductId(m.productId)}
              className="bg-card border border-border rounded-2xl p-4 cursor-pointer">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-bold text-foreground truncate">{m.product?.name ?? "—"}</p>
                <p className={cn("text-base font-bold tabular-nums shrink-0",
                  neutral ? "text-muted-foreground" : entering ? "text-emerald-500" : "text-orange-500")}>
                  {neutral ? "" : entering ? "+" : "−"}{Math.abs(Number(m.quantity))}
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {consumedHere
                  ? `consumo — ${m.fromLocation?.name ? `de ${m.fromLocation.name}` : "no setor"}`
                  : returnedFromHere
                    ? `devolução — ${m.toLocation?.name ? `para ${m.toLocation.name}` : "ao estoque"}`
                    : entering
                      ? (m.fromLocation?.name ? `de ${m.fromLocation.name}` : "entrada")
                      : (m.toLocation?.name ? `para ${m.toLocation.name}` : "saída")}
              </p>
              <div className="flex items-center justify-between gap-3 mt-2 text-[11px] text-muted-foreground">
                <span className="truncate">{m.responsibleName ?? m.performedByName ?? "—"}</span>
                <span className="shrink-0">{fmtDate(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
        {detail.movements.length === 0 && (
          <div className="bg-card border border-border rounded-2xl px-4 py-12 text-center text-sm text-muted-foreground">
            Sem movimentações neste local.
          </div>
        )}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden md:block bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-left px-4 py-3">Produto</th>
              <th className="text-right px-4 py-3">Qtd.</th>
              <th className="text-left px-4 py-3">Sentido</th>
              <th className="text-left px-4 py-3">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {detail.movements.map((m) => {
              // Numa saída convertida (ponto de consumo) o toLocationId é só a
              // ANOTAÇÃO do setor — nenhum saldo entrou aqui. O mesmo vale para
              // a devolução (entrada em outro estoque com este setor de origem).
              const consumedHere = m.toLocationId === locationId && (m.type === "exit" || m.type === "loss");
              const returnedFromHere = m.fromLocationId === locationId && m.type === "entry";
              const neutral = consumedHere || returnedFromHere;
              const entering = !neutral && m.toLocationId === locationId;
              return (
                <tr key={m.id} onClick={() => m.productId && setProductId(m.productId)}
                  className="border-b border-border/50 last:border-0 hover:bg-secondary/30 cursor-pointer">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{fmtDate(m.createdAt)}</td>
                  <td className="px-4 py-3 text-foreground">{m.product?.name ?? "—"}</td>
                  <td className={cn("px-4 py-3 text-right tabular-nums font-medium",
                    neutral ? "text-muted-foreground" : entering ? "text-emerald-500" : "text-orange-500")}>
                    {neutral ? "" : entering ? "+" : "−"}{Math.abs(Number(m.quantity))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {consumedHere
                      ? `consumo — ${m.fromLocation?.name ? `de ${m.fromLocation.name}` : "no setor"}`
                      : returnedFromHere
                        ? `devolução — ${m.toLocation?.name ? `para ${m.toLocation.name}` : "ao estoque"}`
                        : entering
                          ? (m.fromLocation?.name ? `de ${m.fromLocation.name}` : "entrada")
                          : (m.toLocation?.name ? `para ${m.toLocation.name}` : "saída")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{m.responsibleName ?? m.performedByName ?? "—"}</td>
                </tr>
              );
            })}
            {detail.movements.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Sem movimentações neste local.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Ficha do produto — destaca o saldo deste estoque */}
      {productId && (
        <ProductDetailModal propertyId={property.id} productId={productId}
          highlightLocationId={locationId} onClose={() => setProductId(null)} />
      )}

      {/* Correção de saldo */}
      {fix && (
        <Dialog open onClose={() => setFix(null)} presentation="auto" size="md" rawBody hideClose ariaLabel="Corrigir saldo">
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, maxHeight: "100%", overflowY: "auto" }}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-foreground">Corrigir saldo</h2>
                <p className="text-xs text-muted-foreground">{fix.name} · sistema diz {fix.current} {fix.unit}</p>
              </div>
              <button onClick={() => setFix(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="field-label">Quantidade real contada</label>
                <input type="number" className="field-input w-full" value={fix.qty} autoFocus
                  onChange={(e) => setFix({ ...fix, qty: e.target.value })} />
                {Number.isFinite(Number(fix.qty)) && Number(fix.qty) !== fix.current && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Vai gerar um ajuste de{" "}
                    <b className={Number(fix.qty) > fix.current ? "text-emerald-500" : "text-orange-500"}>
                      {Number(fix.qty) > fix.current ? "+" : ""}{Number(fix.qty) - fix.current}
                    </b>{" "}
                    {fix.unit}.
                  </p>
                )}
              </div>
              <div>
                <label className="field-label">Motivo *</label>
                <input className="field-input w-full" value={fix.reason} placeholder="Ex.: contagem física, quebra não registrada"
                  onChange={(e) => setFix({ ...fix, reason: e.target.value })} />
              </div>
              {isStaffLocation && (
                <p className="text-xs text-muted-foreground">
                  Este é um local de colaboradores — a correção fica sem nome de colaborador.
                </p>
              )}
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setFix(null)} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={saveFix} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Registrar ajuste
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Gerir local */}
      {manage && (
        <Dialog open onClose={() => setManage(null)} presentation="auto" size="md" rawBody hideClose ariaLabel="Gerir local">
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, maxHeight: "100%", overflowY: "auto" }}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold text-foreground">Gerir local</h2>
              <button onClick={() => setManage(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="field-label">Nome</label>
                <input className="field-input w-full" value={manage.name} onChange={(e) => setManage({ ...manage, name: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Tipo</label>
                <select className="field-input w-full" value={manage.type}
                  onChange={(e) => setManage({ ...manage, type: e.target.value as StockLocationType })}>
                  {LOCATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Controle de saldo</label>
                <select className="field-input w-full" value={manage.policy}
                  onChange={(e) => setManage({ ...manage, policy: e.target.value as StockLocationPolicy })}>
                  {POLICY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                {manage.policy === "consume_all" && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Transferir para cá vira <b>Saída (consumo)</b> — o setor não acumula saldo.
                    Patrimônio e bens duráveis continuam transferência normal.
                  </p>
                )}
              </div>
              {manage.policy === "consume_categories" && (
                <div className="flex flex-wrap gap-1.5">
                  {categories.filter((c) => c.appliesTo !== "asset").map((c) => {
                    const sel = manage.consumeCategoryIds.includes(c.id);
                    return (
                      <button key={c.id} type="button"
                        onClick={() => setManage({
                          ...manage,
                          consumeCategoryIds: sel
                            ? manage.consumeCategoryIds.filter((x) => x !== c.id)
                            : [...manage.consumeCategoryIds, c.id],
                        })}
                        className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold border",
                          sel ? "bg-primary/15 border-primary/40 text-foreground" : "bg-secondary border-border text-muted-foreground")}>
                        {c.icon} {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={manage.active} onChange={(e) => setManage({ ...manage, active: e.target.checked })}
                  className="w-4 h-4 accent-primary" />
                <span className="text-sm text-foreground">Local ativo</span>
              </label>
              {isCabin && (
                <p className="text-xs text-muted-foreground">
                  Este local pertence a uma cabana. O vínculo é gerenciado na aba <b>Cabanas</b> das configurações.
                </p>
              )}
            </div>
            <div className="p-5 border-t border-border flex justify-between gap-2">
              <button onClick={removeLocation} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-destructive">
                <Trash2 size={15} /> Excluir
              </button>
              <button onClick={saveManage} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </PageShell>
  );
}
