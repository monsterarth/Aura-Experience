// src/app/admin/estoque/fornecedores/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { Supplier, SupplierDetail } from "@/types/aura";
import { toast } from "sonner";
import { PageShell, PageHeader, SkeletonList, useConfirm, Dialog, Button } from "@/components/aura";
import { cn } from "@/lib/utils";
import { useDiscardGuard } from "@/lib/use-discard-guard";
import { Plus, Pencil, Trash2, Save, Truck, Mail, Phone, ShoppingCart, MapPin } from "lucide-react";

const PSTATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-secondary text-muted-foreground" },
  ordered: { label: "Pedida", cls: "bg-blue-500/15 text-blue-500" },
  received: { label: "Recebida", cls: "bg-emerald-500/15 text-emerald-500" },
  cancelled: { label: "Cancelada", cls: "bg-red-500/15 text-red-500" },
};

const empty: Partial<Supplier> = { name: "", active: true };

export default function FornecedoresPage() {
  const { currentProperty: property } = useProperty();
  const confirm = useConfirm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<Supplier> | null>(null);
  const [saving, setSaving] = useState(false);
  const requestClose = useDiscardGuard(form, () => setForm(null));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupplierDetail | null>(null);

  const openDetail = async (id: string) => {
    if (!property?.id) return;
    setDetailId(id); setDetail(null);
    try { setDetail(await StockClient.supplierDetail(property.id, id)); }
    catch (e) { toast.error((e as Error).message); }
  };
  const closeDetail = () => { setDetailId(null); setDetail(null); };
  const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

  const load = useCallback(async () => {
    if (!property?.id) return;
    try { setSuppliers(await StockClient.suppliers(property.id)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!property?.id || !form?.name?.trim()) { toast.error("Informe o nome do fornecedor."); return; }
    setSaving(true);
    try {
      await StockClient.saveSupplier({ ...form, propertyId: property.id });
      setForm(null); await load(); toast.success("Fornecedor salvo.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    if (!property?.id || !(await confirm({ title: "Remover este fornecedor?", confirmLabel: "Confirmar", tone: "danger" }))) return;
    try { await StockClient.deleteSupplier(property.id, id); await load(); toast.success("Fornecedor removido."); }
    catch (e) { toast.error((e as Error).message); }
  };

  const setF = (patch: Partial<Supplier>) => setForm((f) => ({ ...(f ?? {}), ...patch }));

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <PageShell>
      <PageHeader
        icon={Truck}
        title="Fornecedores"
        subtitle={<>{suppliers.length} cadastrado(s)</>}
        primaryAction={{ label: "Novo fornecedor", icon: Plus, onClick: () => setForm({ ...empty }) }}
      />

      {loading ? (
        <SkeletonList rows={5} avatar={false} />
      ) : (
        <>
        {/* Mobile: cards */}
        <div className="md:hidden space-y-2.5">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-card border border-border rounded-2xl p-4">
              <div onClick={() => openDetail(s.id)} className="cursor-pointer">
                <p className="font-bold text-foreground truncate">
                  {s.name}{!s.active && <span className="ml-2 text-[10px] uppercase text-muted-foreground">(inativo)</span>}
                </p>
                {s.cnpj && <p className="text-xs text-muted-foreground mt-0.5">{s.cnpj}</p>}
                <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                  {s.phone && <div className="flex items-center gap-1.5"><Phone size={11} />{s.phone}</div>}
                  {s.email && <div className="flex items-center gap-1.5 truncate"><Mail size={11} />{s.email}</div>}
                  {s.paymentTerms && <div className="flex items-center gap-1.5">Pagamento: {s.paymentTerms}</div>}
                </div>
              </div>
              <div className="flex justify-end gap-1.5 mt-3 pt-3 border-t border-border/60" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setForm(s)} aria-label="Editar"
                  className="p-2 rounded-lg bg-secondary/60 text-muted-foreground hover:text-foreground"><Pencil size={15} /></button>
                <button onClick={() => remove(s.id)} aria-label="Remover"
                  className="p-2 rounded-lg bg-secondary/60 text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          {suppliers.length === 0 && (
            <div className="bg-card border border-border rounded-2xl px-4 py-12 text-center text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</div>
          )}
        </div>

        {/* Desktop: tabela */}
        <div className="hidden md:block bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="text-left px-4 py-3">Fornecedor</th>
                <th className="text-left px-4 py-3">Contato</th>
                <th className="text-left px-4 py-3">Pagamento</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} onClick={() => openDetail(s.id)} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{s.name}{!s.active && <span className="ml-2 text-[10px] uppercase text-muted-foreground">(inativo)</span>}</div>
                    {s.cnpj && <div className="text-xs text-muted-foreground">{s.cnpj}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs space-y-0.5">
                    {s.phone && <div className="flex items-center gap-1"><Phone size={11} />{s.phone}</div>}
                    {s.email && <div className="flex items-center gap-1"><Mail size={11} />{s.email}</div>}
                    {!s.phone && !s.email && "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.paymentTerms || "—"}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setForm(s)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                      <button onClick={() => remove(s.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">Nenhum fornecedor cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {form && (
        <Dialog open onClose={requestClose} presentation="auto" size="md" title={form.id ? "Editar fornecedor" : "Novo fornecedor"} footerRow
          footer={(<><Button variant="ghost" onClick={requestClose}>Cancelar</Button><Button variant="primary" icon={Save} loading={saving} loadingText="Salvando…" onClick={save}>Salvar</Button></>)}>
            <div className="space-y-4">
              <div><label className="field-label">Nome *</label>
                <input className="field-input w-full" value={form.name ?? ""} autoFocus onChange={(e) => setF({ name: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="field-label">CNPJ</label>
                  <input className="field-input w-full" value={form.cnpj ?? ""} onChange={(e) => setF({ cnpj: e.target.value })} /></div>
                <div><label className="field-label">Categoria</label>
                  <input className="field-input w-full" placeholder="Ex.: Alimentos" value={form.category ?? ""} onChange={(e) => setF({ category: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="field-label">Telefone</label>
                  <input className="field-input w-full" value={form.phone ?? ""} onChange={(e) => setF({ phone: e.target.value })} /></div>
                <div><label className="field-label">E-mail</label>
                  <input className="field-input w-full" value={form.email ?? ""} onChange={(e) => setF({ email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="field-label">Contato</label>
                  <input className="field-input w-full" value={form.contactPerson ?? ""} onChange={(e) => setF({ contactPerson: e.target.value })} /></div>
                <div><label className="field-label">Condição de pagamento</label>
                  <input className="field-input w-full" placeholder="Ex.: 30 dias" value={form.paymentTerms ?? ""} onChange={(e) => setF({ paymentTerms: e.target.value })} /></div>
              </div>
              <div><label className="field-label">Endereço</label>
                <input className="field-input w-full" value={form.address ?? ""} onChange={(e) => setF({ address: e.target.value })} /></div>
              <div><label className="field-label">Observações</label>
                <textarea className="field-input w-full" rows={2} value={form.notes ?? ""} onChange={(e) => setF({ notes: e.target.value })} /></div>
              {form.id && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active ?? true} onChange={(e) => setF({ active: e.target.checked })} className="w-4 h-4 accent-primary" />
                  <span className="text-sm text-foreground">Ativo</span>
                </label>
              )}
            </div>
        </Dialog>
      )}

      {/* Ficha do fornecedor */}
      {detailId && (
        <Dialog open onClose={closeDetail} presentation="auto" size="lg" icon={Truck} title={detail ? detail.supplier.name : "Fornecedor"} subtitle={detail ? <>{detail.supplier.category || "—"}{detail.supplier.cnpj ? ` · ${detail.supplier.cnpj}` : ""}</> : undefined}>
            {!detail ? (
              <SkeletonList rows={5} avatar={false} />
            ) : (
                <div className="space-y-5">
                  {/* Resumo */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-secondary/40 rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Compras</div>
                      <div className="text-lg font-bold tabular-nums text-foreground">{detail.stats.count}</div>
                    </div>
                    <div className="bg-secondary/40 rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total recebido</div>
                      <div className="text-lg font-bold tabular-nums text-foreground">R$ {Number(detail.stats.totalReceived).toFixed(2)}</div>
                    </div>
                    <div className="bg-secondary/40 rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Última compra</div>
                      <div className="text-lg font-bold text-foreground">{fmtDate(detail.stats.lastPurchaseDate)}</div>
                    </div>
                  </div>

                  {/* Contato */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {detail.supplier.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone size={13} /> {detail.supplier.phone}</div>}
                    {detail.supplier.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail size={13} /> {detail.supplier.email}</div>}
                    {detail.supplier.contactPerson && <div className="text-muted-foreground">Contato: <span className="text-foreground">{detail.supplier.contactPerson}</span></div>}
                    {detail.supplier.paymentTerms && <div className="text-muted-foreground">Pagamento: <span className="text-foreground">{detail.supplier.paymentTerms}</span></div>}
                    {detail.supplier.address && <div className="sm:col-span-2 flex items-center gap-2 text-muted-foreground"><MapPin size={13} /> {detail.supplier.address}</div>}
                  </div>
                  {detail.supplier.notes && <p className="text-xs text-muted-foreground border-l-2 border-border pl-2">{detail.supplier.notes}</p>}

                  {/* Últimas compras */}
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5"><ShoppingCart size={13} /> Últimas compras</h3>
                    {detail.purchases.length ? (
                      <table className="w-full text-sm">
                        <tbody>
                          {detail.purchases.map((p) => {
                            const st = PSTATUS[p.status] ?? { label: p.status, cls: "bg-secondary text-muted-foreground" };
                            return (
                              <tr key={p.id} className="border-b border-border/40 last:border-0">
                                <td className="py-1.5 text-muted-foreground whitespace-nowrap pr-2">{fmtDate(p.createdAt)}</td>
                                <td className="py-1.5 text-foreground pr-2">{p.invoiceNumber || "(sem NF)"}</td>
                                <td className="py-1.5 pr-2"><span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md", st.cls)}>{st.label}</span></td>
                                <td className="py-1.5 text-right tabular-nums text-foreground">R$ {Number(p.totalValue).toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : <p className="text-xs text-muted-foreground">Nenhuma compra com este fornecedor ainda.</p>}
                  </div>
                </div>
            )}
        </Dialog>
      )}
    </PageShell>
  );
}
