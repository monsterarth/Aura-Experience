// src/app/admin/estoque/compras/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useProperty } from "@/context/PropertyContext";
import { supabase } from "@/lib/supabase";
import { StockClient } from "@/lib/stock-client";
import { Purchase, PurchaseStatus, Supplier, StockLocation, StockProduct } from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, Loader2, Pencil, Trash2, Save, X, ShoppingCart, PackageCheck, Zap, Trash, Paperclip } from "lucide-react";
import { FileUpload } from "@/components/admin/FileUpload";
import { useDiscardGuard } from "@/lib/use-discard-guard";

const STATUS: Record<PurchaseStatus, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-secondary text-muted-foreground" },
  ordered: { label: "Pedida", cls: "bg-blue-500/15 text-blue-500" },
  received: { label: "Recebida", cls: "bg-emerald-500/15 text-emerald-500" },
  cancelled: { label: "Cancelada", cls: "bg-red-500/15 text-red-500" },
};

interface ItemRow { productId: string; quantity: string; unitCost: string; expiryDate: string; batchCode: string; }
const emptyItem: ItemRow = { productId: "", quantity: "", unitCost: "", expiryDate: "", batchCode: "" };
interface RecvRow { itemId: string; name: string; unit: string; trackExpiry: boolean; quantity: number; expiryDate: string; batchCode: string; }
interface PForm {
  id?: string; status: PurchaseStatus; supplierId: string; locationId: string;
  invoiceNumber: string; invoiceUrl: string; orderDate: string; isEmergency: boolean; notes: string; items: ItemRow[];
}
const emptyForm: PForm = {
  status: "draft", supplierId: "", locationId: "", invoiceNumber: "", invoiceUrl: "", orderDate: "",
  isEmergency: false, notes: "", items: [{ ...emptyItem }],
};

export default function ComprasPage() {
  const { currentProperty: property } = useProperty();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<PForm | null>(null);
  const [saving, setSaving] = useState(false);
  const requestClose = useDiscardGuard(form, () => setForm(null));
  const [receiving, setReceiving] = useState<{ purchase: Purchase; rows: RecvRow[] } | null>(null);
  const [receivingBusy, setReceivingBusy] = useState(false);
  const [nota, setNota] = useState<Purchase | null>(null);
  const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

  const loadStatic = useCallback(async () => {
    if (!property?.id) return;
    const [sup, loc, prod] = await Promise.all([
      StockClient.suppliers(property.id), StockClient.locations(property.id), StockClient.products(property.id),
    ]);
    setSuppliers(sup.filter((s) => s.active)); setLocations(loc.filter((l) => l.active)); setProducts(prod.filter((p) => p.active));
  }, [property?.id]);

  const load = useCallback(async () => {
    if (!property?.id) return;
    try { setPurchases(await StockClient.purchases(property.id)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id]);

  useEffect(() => {
    if (!property?.id) return;
    loadStatic(); load();
    const channel = supabase.channel(`purchases_${property.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases", filter: `propertyId=eq.${property.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [property?.id, loadStatic, load]);

  const prodName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

  const openNew = () => setForm({ ...emptyForm, items: [{ ...emptyItem }] });
  const openEdit = (p: Purchase) => setForm({
    id: p.id, status: p.status, supplierId: p.supplierId ?? "", locationId: p.locationId ?? "",
    invoiceNumber: p.invoiceNumber ?? "", invoiceUrl: p.invoiceUrl ?? "", orderDate: p.orderDate ?? "", isEmergency: p.isEmergency, notes: p.notes ?? "",
    items: (p.items ?? []).map((i) => ({ productId: i.productId, quantity: String(i.quantity), unitCost: String(i.unitCost), expiryDate: i.expiryDate ?? "", batchCode: i.batchCode ?? "" })),
  });

  const grandTotal = useMemo(() => {
    if (!form) return 0;
    return form.items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitCost || 0), 0);
  }, [form]);

  const setItem = (idx: number, patch: Partial<ItemRow>) =>
    setForm((f) => f ? { ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) } : f);
  const addItem = () => setForm((f) => f ? { ...f, items: [...f.items, { ...emptyItem }] } : f);
  const removeItem = (idx: number) => setForm((f) => f ? { ...f, items: f.items.filter((_, i) => i !== idx) } : f);

  const save = async () => {
    if (!property?.id || !form) return;
    const items = form.items
      .filter((i) => i.productId && Number(i.quantity) > 0)
      .map((i) => ({ productId: i.productId, quantity: Number(i.quantity), unitCost: Number(i.unitCost || 0), expiryDate: i.expiryDate || null, batchCode: i.batchCode || null }));
    if (items.length === 0) { toast.error("Adicione ao menos um item com quantidade."); return; }
    setSaving(true);
    try {
      await StockClient.savePurchase({
        propertyId: property.id, id: form.id, status: form.status,
        supplierId: form.supplierId || null, locationId: form.locationId || null,
        invoiceNumber: form.invoiceNumber || undefined, invoiceUrl: form.invoiceUrl || undefined,
        orderDate: form.orderDate || null, isEmergency: form.isEmergency, notes: form.notes || undefined, items,
      });
      setForm(null); await load(); toast.success("Compra salva.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const openReceive = (p: Purchase) => {
    if (!p.locationId) { toast.error("Defina o local de recebimento (edite a compra)."); return; }
    const rows: RecvRow[] = (p.items ?? []).map((it) => {
      const prod = products.find((x) => x.id === it.productId);
      return {
        itemId: it.id, name: prod?.name ?? "—", unit: prod?.unit ?? "", trackExpiry: !!prod?.trackExpiry,
        quantity: Number(it.quantity), expiryDate: it.expiryDate ?? "", batchCode: it.batchCode ?? "",
      };
    });
    setReceiving({ purchase: p, rows });
  };

  const setRecvRow = (idx: number, patch: Partial<RecvRow>) =>
    setReceiving((r) => r ? { ...r, rows: r.rows.map((row, i) => i === idx ? { ...row, ...patch } : row) } : r);

  const confirmReceive = async () => {
    if (!property?.id || !receiving) return;
    setReceivingBusy(true);
    try {
      const overrides: Record<string, { expiryDate?: string | null; batchCode?: string | null }> = {};
      for (const r of receiving.rows) {
        if (r.trackExpiry) overrides[r.itemId] = { expiryDate: r.expiryDate || null, batchCode: r.batchCode || null };
      }
      await StockClient.receivePurchase(property.id, receiving.purchase.id, overrides);
      setReceiving(null); await load(); toast.success("Compra recebida — entradas geradas.");
    } catch (e) { toast.error((e as Error).message); } finally { setReceivingBusy(false); }
  };

  const remove = async (p: Purchase) => {
    if (!property?.id || !confirm("Excluir esta compra?")) return;
    try { await StockClient.deletePurchase(property.id, p.id); await load(); toast.success("Compra excluída."); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><ShoppingCart size={22} /> Compras</h1>
          <p className="text-sm text-muted-foreground">{purchases.length} compra(s)</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90">
          <Plus size={16} /> Nova compra
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-3">NF / Fornecedor</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Itens</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Recebimento</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => {
                const st = STATUS[p.status];
                const editable = p.status === "draft" || p.status === "ordered";
                return (
                  <tr key={p.id} onClick={() => setNota(p)} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        {p.isEmergency && <Zap size={13} className="text-amber-500" />}
                        {p.invoiceNumber || "(sem NF)"}
                        {p.invoiceUrl && (
                          <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Ver nota fiscal" className="text-muted-foreground hover:text-primary"><Paperclip size={12} /></a>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{p.supplier?.name ?? "Sem fornecedor"}</div>
                    </td>
                    <td className="px-4 py-3"><span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md", st.cls)}>{st.label}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{p.items?.length ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">R$ {Number(p.totalValue).toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.location?.name ?? "—"}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {editable && (
                          <button onClick={() => openReceive(p)} title="Receber no estoque" className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg"><PackageCheck size={15} /></button>
                        )}
                        {editable && <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>}
                        {p.status !== "received" && <button onClick={() => remove(p)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {purchases.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Nenhuma compra registrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={requestClose}>
          <div className="bg-card border border-border w-full max-w-2xl rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-card z-10">
              <h2 className="text-lg font-bold text-foreground">{form.id ? "Editar compra" : "Nova compra"}</h2>
              <button onClick={requestClose} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">Fornecedor</label>
                  <select className="field-input w-full" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                    <option value="">—</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
                <div><label className="field-label">Local de recebimento</label>
                  <select className="field-input w-full" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                    <option value="">—</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="field-label">Nº da NF</label>
                  <input className="field-input w-full" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} /></div>
                <div><label className="field-label">Data do pedido</label>
                  <input type="date" className="field-input w-full" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} /></div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.isEmergency} onChange={(e) => setForm({ ...form, isEmergency: e.target.checked })} className="w-4 h-4 accent-amber-500" />
                    <span className="text-sm text-foreground flex items-center gap-1"><Zap size={13} className="text-amber-500" /> Emergencial</span>
                  </label>
                </div>
              </div>

              <div><label className="field-label">Nota fiscal (PDF ou imagem)</label>
                <FileUpload value={form.invoiceUrl || undefined} onChange={(url) => setForm({ ...form, invoiceUrl: url })} label="Enviar nota fiscal" />
              </div>

              {/* Itens */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="field-label mb-0">Itens</label>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"><Plus size={13} /> Adicionar item</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_80px_100px_28px] gap-2 items-center">
                      <select className="field-input w-full" value={it.productId} onChange={(e) => setItem(idx, { productId: e.target.value })}>
                        <option value="">Produto…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                      </select>
                      <input type="number" className="field-input w-full" placeholder="Qtd" value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} />
                      <input type="number" className="field-input w-full" placeholder="Custo un." value={it.unitCost} onChange={(e) => setItem(idx, { unitCost: e.target.value })} />
                      <button onClick={() => removeItem(idx)} className="p-1 text-muted-foreground hover:text-destructive"><Trash size={14} /></button>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground pl-1">A validade dos itens perecíveis é informada no <b>recebimento</b>.</p>
                </div>
                <div className="text-right mt-2 text-sm font-bold text-foreground">Total: R$ {grandTotal.toFixed(2)}</div>
              </div>

              <div><label className="field-label">Observações</label>
                <input className="field-input w-full" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
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

      {/* Modal de recebimento — validade é informada aqui (quando a mercadoria chega) */}
      {receiving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-xl rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><PackageCheck size={18} className="text-emerald-500" /> Receber compra</h2>
                <p className="text-xs text-muted-foreground">Entrada em &quot;{receiving.purchase.location?.name ?? ""}&quot;. Informe a validade dos itens perecíveis.</p>
              </div>
              <button onClick={() => setReceiving(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2">
              {receiving.rows.map((r, idx) => (
                <div key={r.itemId} className="border border-border rounded-xl p-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-foreground">{r.name}</span>
                    <span className="text-muted-foreground tabular-nums">{r.quantity} {r.unit}</span>
                  </div>
                  {r.trackExpiry ? (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 shrink-0">Validade</span>
                      <input type="date" className="field-input py-1 text-xs" value={r.expiryDate} onChange={(e) => setRecvRow(idx, { expiryDate: e.target.value })} />
                      <input className="field-input py-1 text-xs flex-1" placeholder="Lote (opcional)" value={r.batchCode} onChange={(e) => setRecvRow(idx, { batchCode: e.target.value })} />
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground mt-1">Sem controle de validade.</p>
                  )}
                </div>
              ))}
              {receiving.rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Compra sem itens.</p>}
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setReceiving(null)} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={confirmReceive} disabled={receivingBusy} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                {receivingBusy ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />} Confirmar entrada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nota de compra (digital) */}
      {nota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setNota(null)}>
          <div className="bg-card border border-border w-full max-w-xl rounded-3xl shadow-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <ShoppingCart size={18} /> Nota de compra{nota.invoiceNumber ? ` · ${nota.invoiceNumber}` : ""}
                  {nota.isEmergency && <Zap size={14} className="text-amber-500" />}
                </h2>
                <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  {nota.supplier?.name ?? "Sem fornecedor"}
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md", STATUS[nota.status].cls)}>{STATUS[nota.status].label}</span>
                </p>
              </div>
              <button onClick={() => setNota(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Local</div><div className="text-foreground">{nota.location?.name ?? "—"}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Pedido</div><div className="text-foreground">{fmtDate(nota.orderDate)}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Recebido</div><div className="text-foreground">{fmtDate(nota.receivedDate)}</div></div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                    <th className="text-left py-2">Item</th>
                    <th className="text-right py-2">Qtd</th>
                    <th className="text-right py-2">Custo un.</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(nota.items ?? []).map((it) => (
                    <tr key={it.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 text-foreground">
                        {it.product?.name ?? "—"}
                        {it.expiryDate && <span className="block text-[10px] text-muted-foreground">val. {fmtDate(it.expiryDate)}{it.batchCode ? ` · lote ${it.batchCode}` : ""}</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums">{Number(it.quantity)} {it.product?.unit}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">R$ {Number(it.unitCost).toFixed(2)}</td>
                      <td className="py-2 text-right tabular-nums">R$ {Number(it.totalCost).toFixed(2)}</td>
                    </tr>
                  ))}
                  {(nota.items ?? []).length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sem itens.</td></tr>}
                </tbody>
              </table>

              <div className="flex justify-between items-center border-t border-border pt-3">
                <span className="text-sm font-bold text-foreground">Total</span>
                <span className="text-lg font-bold tabular-nums text-foreground">R$ {Number(nota.totalValue).toFixed(2)}</span>
              </div>

              {nota.notes && <p className="text-xs text-muted-foreground border-l-2 border-border pl-2">{nota.notes}</p>}

              {nota.invoiceUrl && (
                <a href={nota.invoiceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
                  <Paperclip size={14} /> Ver nota fiscal anexada
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
