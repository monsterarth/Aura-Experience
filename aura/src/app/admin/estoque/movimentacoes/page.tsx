// src/app/admin/estoque/movimentacoes/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { StockClient } from "@/lib/stock-client";
import { StockProduct, StockLocation, StockMovement, StockMovementType, StockLossType, StockStaffOption, StockCabinOption } from "@/types/aura";
import StockLocationPicker from "@/components/admin/StockLocationPicker";
import StaffSelect from "@/components/admin/StaffSelect";
import BatchMovementModal from "@/components/admin/BatchMovementModal";
import ProductDetailModal from "@/components/admin/ProductDetailModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Loader2, ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, Repeat, SlidersHorizontal, AlertOctagon, Save, Layers, History } from "lucide-react";

const TYPES: { value: StockMovementType; label: string; icon: React.ElementType; color: string }[] = [
  { value: "entry", label: "Entrada", icon: ArrowDownToLine, color: "text-emerald-500" },
  { value: "exit", label: "Saída", icon: ArrowUpFromLine, color: "text-orange-500" },
  { value: "transfer", label: "Transferência", icon: Repeat, color: "text-blue-500" },
  { value: "adjustment", label: "Ajuste", icon: SlidersHorizontal, color: "text-violet-500" },
  { value: "loss", label: "Perda", icon: AlertOctagon, color: "text-red-500" },
];
const LOSS_TYPES: { value: StockLossType; label: string }[] = [
  { value: "expiry", label: "Vencimento" }, { value: "damage", label: "Quebra/Danificação" },
  { value: "handling", label: "Manipulação" }, { value: "other", label: "Outros" },
];

interface MovForm {
  productId: string; type: StockMovementType; quantity: string; unitCost: string;
  fromLocationId: string; toLocationId: string; lossType: StockLossType; notes: string;
  expiryDate: string; batchCode: string;
  // cabana, quando a origem/destino é uma cabana (o local é resolvido no servidor)
  fromCabinId: string; toCabinId: string;
  // colaborador, quando o local escolhido é do tipo 'staff'
  fromStaffId: string; toStaffId: string;
  responsibleId: string;   // quem responde pela ação; default = usuário logado
}
const emptyMov: MovForm = {
  productId: "", type: "entry", quantity: "", unitCost: "",
  fromLocationId: "", toLocationId: "", lossType: "expiry", notes: "",
  expiryDate: "", batchCode: "", fromCabinId: "", toCabinId: "",
  fromStaffId: "", toStaffId: "", responsibleId: "",
};


export default function EstoqueMovimentacoesPage() {
  const { currentProperty: property } = useProperty();
  const { userData } = useAuth();
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [staffOptions, setStaffOptions] = useState<StockStaffOption[]>([]);
  const [cabinOptions, setCabinOptions] = useState<StockCabinOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<MovForm>(emptyMov);
  const [saving, setSaving] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  // "Estoque principal" (Configurações → Parâmetros): origem padrão da transferência.
  const [defaultLocationId, setDefaultLocationId] = useState("");
  // true assim que o usuário mexe na Origem — trava o autofill do local padrão (ver efeito abaixo).
  const originTouchedRef = useRef(false);

  const loadStatic = useCallback(async () => {
    if (!property?.id) return;
    const [prods, locs, staff, cabins, settings] = await Promise.all([
      StockClient.products(property.id), StockClient.locations(property.id),
      StockClient.movementStaff(property.id), StockClient.cabinOptions(property.id),
      StockClient.settings(property.id),
    ]);
    setProducts(prods.filter((p) => p.active)); setLocations(locs.filter((l) => l.active));
    setStaffOptions(staff); setCabinOptions(cabins);
    setDefaultLocationId(settings.defaultLocationId ?? "");
  }, [property?.id]);

  const loadMovements = useCallback(async () => {
    if (!property?.id) return;
    try { setMovements(await StockClient.movements(property.id, 80)); }
    finally { setLoading(false); }
  }, [property?.id]);

  // Prefill vindo da página de um estoque ("dar saída daqui" / "movimentar para cá").
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from"), to = params.get("to");
    if (!from && !to) return;
    setForm((f) => ({
      ...f,
      type: from ? "exit" : "entry",
      fromLocationId: from ?? f.fromLocationId,
      toLocationId: to ?? f.toLocationId,
    }));
  }, []);

  /**
   * Transferência quase sempre sai do estoque principal, então a origem já vem
   * preenchida. Roda também quando o parâmetro chega depois da tela e a cada
   * lançamento novo (o submit limpa o formulário mantendo o tipo).
   *
   * `originTouchedRef` evita que este preenchimento automático compita com o
   * usuário: o StockLocationPicker zera fromLocationId/fromCabinId por um
   * instante ao entrar no "modo cabana" (passo 2 do seletor) — sem a trava,
   * esse vazio momentâneo era interpretado como "origem em branco" e o efeito
   * recolocava o local padrão, fechando o seletor de cabana antes da escolha.
   */
  useEffect(() => {
    if (!defaultLocationId || originTouchedRef.current) return;
    setForm((f) => (f.type === "transfer" && !f.fromLocationId && !f.fromCabinId)
      ? { ...f, fromLocationId: defaultLocationId } : f);
  }, [defaultLocationId, form.type]);

  useEffect(() => {
    if (!property?.id) return;
    loadStatic(); loadMovements();
    const channel = supabase
      .channel(`stock_mov_${property.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements", filter: `propertyId=eq.${property.id}` }, () => loadMovements())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [property?.id, loadStatic, loadMovements]);

  const showFrom = form.type === "exit" || form.type === "loss" || form.type === "transfer";
  const showTo = form.type === "entry" || form.type === "transfer" || form.type === "adjustment";
  const showCost = form.type === "entry";
  const selectedProduct = products.find((p) => p.id === form.productId);
  const showExpiry = form.type === "entry" && !!selectedProduct?.trackExpiry;

  // Responsável: começa no usuário logado e pode ser trocado. O logado entra na
  // lista mesmo se não for da propriedade (super admin), senão o select fica vazio.
  const responsibleOptions = React.useMemo(() => {
    if (!userData?.id || staffOptions.some((s) => s.id === userData.id)) return staffOptions;
    return [{ id: userData.id, name: userData.fullName, role: userData.role }, ...staffOptions];
  }, [staffOptions, userData?.id, userData?.fullName, userData?.role]);
  const responsibleId = form.responsibleId || userData?.id || "";

  const locationOf = (id: string) => locations.find((l) => l.id === id);
  // Locais do tipo "Colaboradores" pedem um segundo select: quem recebeu/devolveu.
  const askFromStaff = showFrom && locationOf(form.fromLocationId)?.type === "staff";
  const askToStaff = showTo && locationOf(form.toLocationId)?.type === "staff";

  const submit = async () => {
    if (!property?.id) return;
    if (!form.productId) { toast.error("Selecione o produto."); return; }
    const qty = Number(form.quantity);
    if (!qty || (form.type !== "adjustment" && qty <= 0)) { toast.error("Quantidade inválida."); return; }
    if (showFrom && !form.fromLocationId && !form.fromCabinId) { toast.error("Selecione o local (ou a cabana) de origem."); return; }
    if (showTo && !form.toLocationId && !form.toCabinId) { toast.error("Selecione o local (ou a cabana) de destino."); return; }
    if (askFromStaff && !form.fromStaffId) { toast.error("Selecione o colaborador de origem."); return; }
    if (askToStaff && !form.toStaffId) { toast.error("Selecione o colaborador de destino."); return; }

    const payload = {
      propertyId: property.id,
      productId: form.productId,
      type: form.type,
      quantity: qty,
      unitCost: showCost ? Number(form.unitCost || 0) : undefined,
      fromLocationId: showFrom ? form.fromLocationId || undefined : undefined,
      toLocationId: showTo ? form.toLocationId || undefined : undefined,
      fromCabinId: showFrom ? form.fromCabinId || undefined : undefined,
      toCabinId: showTo ? form.toCabinId || undefined : undefined,
      fromStaffId: askFromStaff ? form.fromStaffId : undefined,
      toStaffId: askToStaff ? form.toStaffId : undefined,
      responsibleId: responsibleId || undefined,
      lossType: form.type === "loss" ? form.lossType : undefined,
      expiryDate: showExpiry ? (form.expiryDate || undefined) : undefined,
      batchCode: showExpiry ? (form.batchCode || undefined) : undefined,
      notes: form.notes || undefined,
      referenceType: "manual" as const,
    };

    const send = async (allowNegative: boolean) => {
      await StockClient.registerMovement({ ...payload, allowNegative });
      toast.success(allowNegative ? "Registrada — estoque ficou negativo." : "Movimentação registrada.");
      // Mantém tipo e responsável: quem lança em nome de outro costuma lançar vários seguidos.
      originTouchedRef.current = false;
      setForm({ ...emptyMov, type: form.type, responsibleId: form.responsibleId });
    };

    setSaving(true);
    try {
      await send(false);
    } catch (e) {
      const err = e as Error & { code?: string; available?: number; resulting?: number };
      if (err.code === "NEGATIVE_STOCK") {
        const ok = window.confirm(
          `⚠️ Estoque insuficiente neste local.\n\n` +
          `Disponível: ${err.available}\nMovimentação: ${qty}\nSaldo final: ${err.resulting} (negativo)\n\n` +
          `Deseja registrar mesmo assim, deixando o estoque negativo?`
        );
        if (ok) {
          try { await send(true); } catch (e2) { toast.error((e2 as Error).message); }
        }
      } else {
        toast.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  /** Estorna um lote inteiro gerando movimentações inversas — nada é apagado. */
  const revertBatch = async (batchRef: string) => {
    if (!property?.id) return;
    const count = movements.filter((m) => m.batchRef === batchRef).length;
    if (!confirm(
      `Estornar este lote?\n\n${count} movimentação(ões) visível(is) neste lote receberão uma movimentação inversa. ` +
      `Nada é apagado do histórico — o estorno entra como lançamento novo.`
    )) return;
    setSaving(true);
    try {
      const r = await StockClient.revertBatch(property.id, batchRef);
      await loadMovements();
      toast.success(`${r.reverted} movimentação(ões) estornada(s).`);
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const typeMeta = (t: StockMovementType) => TYPES.find((x) => x.value === t)!;
  const fmtDate = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><ArrowLeftRight size={22} /> Movimentações</h1>
          <p className="text-sm text-muted-foreground">Entradas, saídas, transferências, ajustes e perdas.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/estoque/movimentacoes/historico"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-secondary text-foreground hover:bg-secondary/70">
            <History size={16} /> Histórico
          </Link>
          <button onClick={() => setBatchOpen(true)} disabled={products.length === 0 || locations.length === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-secondary text-foreground hover:bg-secondary/70 disabled:opacity-50">
            <Layers size={16} /> Lançar em lote
          </button>
        </div>
      </header>

      {productId && property && (
        <ProductDetailModal propertyId={property.id} productId={productId} onClose={() => setProductId(null)} />
      )}

      {batchOpen && property && (
        <BatchMovementModal
          propertyId={property.id} products={products} locations={locations}
          cabins={cabinOptions} staff={responsibleOptions} defaultResponsibleId={responsibleId}
          defaultLocationId={defaultLocationId}
          onClose={() => setBatchOpen(false)} onSaved={loadMovements}
        />
      )}

      {products.length === 0 || locations.length === 0 ? (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 rounded-2xl p-4 text-sm mb-6">
          Cadastre ao menos um <b>produto</b> e um <b>local</b> antes de movimentar o estoque.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-5 mb-8">
          {/* Seletor de tipo */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.value} onClick={() => setForm({ ...form, type: t.value })}
                  className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors",
                    form.type === t.value ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground")}>
                  <Icon size={15} className={form.type === t.value ? "" : t.color} /> {t.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="field-label">Produto</label>
              <select className="field-input w-full" value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                <option value="">Selecione…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
              </select>
            </div>

            <div>
              <label className="field-label">{form.type === "adjustment" ? "Quantidade (+/−)" : "Quantidade"}</label>
              <input type="number" className="field-input w-full" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
            </div>
            {showCost && (
              <div>
                <label className="field-label">Custo unitário (R$)</label>
                <input type="number" className="field-input w-full" value={form.unitCost}
                  onChange={(e) => setForm({ ...form, unitCost: e.target.value })} placeholder="0,00" />
              </div>
            )}
            {showExpiry && (
              <>
                <div>
                  <label className="field-label">Validade</label>
                  <input type="date" className="field-input w-full" value={form.expiryDate}
                    onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Lote (opcional)</label>
                  <input className="field-input w-full" value={form.batchCode}
                    onChange={(e) => setForm({ ...form, batchCode: e.target.value })} placeholder="Código do lote" />
                </div>
              </>
            )}
            {showFrom && (
              <div>
                <label className="field-label">Origem</label>
                <StockLocationPicker locations={locations} cabins={cabinOptions} cabinLabel="Cabana de origem"
                  value={{ locationId: form.fromLocationId, cabinId: form.fromCabinId }}
                  onChange={(p) => {
                    originTouchedRef.current = true;
                    setForm({ ...form, fromLocationId: p.locationId, fromCabinId: p.cabinId, fromStaffId: "" });
                  }} />
              </div>
            )}
            {askFromStaff && (
              <div>
                <label className="field-label">Colaborador (origem)</label>
                <StaffSelect staff={staffOptions} value={form.fromStaffId}
                  onChange={(id) => setForm({ ...form, fromStaffId: id })} />
              </div>
            )}
            {showTo && (
              <div>
                <label className="field-label">Destino</label>
                <StockLocationPicker locations={locations} cabins={cabinOptions}
                  value={{ locationId: form.toLocationId, cabinId: form.toCabinId }}
                  onChange={(p) => setForm({ ...form, toLocationId: p.locationId, toCabinId: p.cabinId, toStaffId: "" })} />
              </div>
            )}
            {askToStaff && (
              <div>
                <label className="field-label">Colaborador</label>
                <StaffSelect staff={staffOptions} value={form.toStaffId}
                  onChange={(id) => setForm({ ...form, toStaffId: id })} />
              </div>
            )}
            {form.type === "loss" && (
              <div>
                <label className="field-label">Tipo de perda</label>
                <select className="field-input w-full" value={form.lossType}
                  onChange={(e) => setForm({ ...form, lossType: e.target.value as StockLossType })}>
                  {LOSS_TYPES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="field-label">Responsável</label>
              <StaffSelect staff={responsibleOptions} value={responsibleId}
                onChange={(id) => setForm({ ...form, responsibleId: id })} />
            </div>
            <div>
              <label className="field-label">Observações</label>
              <input className="field-input w-full" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opcional" />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button onClick={submit} disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Registrar
            </button>
          </div>
        </div>
      )}

      {/* Histórico */}
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Últimas movimentações</h2>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Produto</th>
                <th className="text-right px-4 py-3">Qtd.</th>
                <th className="text-left px-4 py-3">Local</th>
                <th className="text-left px-4 py-3">Responsável</th>
                <th className="text-left px-4 py-3">Observação</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => {
                const meta = typeMeta(m.type);
                const Icon = meta.icon;
                return (
                  <tr key={m.id} onClick={() => m.productId && setProductId(m.productId)}
                    className="border-b border-border/50 last:border-0 hover:bg-secondary/30 cursor-pointer">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(m.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 font-bold", meta.color)}>
                        <Icon size={14} /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {m.product?.name ?? "—"}
                      {m.batchRef && (
                        <button onClick={(e) => { e.stopPropagation(); revertBatch(m.batchRef!); }} disabled={saving}
                          title="Movimentação lançada em lote — clique para estornar o lote inteiro"
                          className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground align-middle">
                          Lote
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{Number(m.quantity)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {m.fromLocation?.name && <span>{m.fromLocation.name}{m.fromStaffName ? ` · ${m.fromStaffName}` : ""}</span>}
                      {m.fromLocation?.name && m.toLocation?.name && <span> → </span>}
                      {m.toLocation?.name && <span>{m.toLocation.name}{m.toStaffName ? ` · ${m.toStaffName}` : ""}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {m.responsibleName ?? m.performedByName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[16rem]">
                      <span className="block truncate" title={m.notes || undefined}>{m.notes || "—"}</span>
                    </td>
                  </tr>
                );
              })}
              {movements.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Nenhuma movimentação ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
