// src/app/admin/estoque/fornecedores/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { Supplier } from "@/types/aura";
import { toast } from "sonner";
import { Plus, Loader2, Pencil, Trash2, Save, X, Truck, Mail, Phone } from "lucide-react";

const empty: Partial<Supplier> = { name: "", active: true };

export default function FornecedoresPage() {
  const { currentProperty: property } = useProperty();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<Supplier> | null>(null);
  const [saving, setSaving] = useState(false);

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
    if (!property?.id || !confirm("Remover este fornecedor?")) return;
    try { await StockClient.deleteSupplier(property.id, id); await load(); toast.success("Fornecedor removido."); }
    catch (e) { toast.error((e as Error).message); }
  };

  const setF = (patch: Partial<Supplier>) => setForm((f) => ({ ...(f ?? {}), ...patch }));

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Truck size={22} /> Fornecedores</h1>
          <p className="text-sm text-muted-foreground">{suppliers.length} cadastrado(s)</p>
        </div>
        <button onClick={() => setForm({ ...empty })}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:opacity-90">
          <Plus size={16} /> Novo fornecedor
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
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
                <tr key={s.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
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
                  <td className="px-4 py-3">
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
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setForm(null)}>
          <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-card">
              <h2 className="text-lg font-bold text-foreground">{form.id ? "Editar fornecedor" : "Novo fornecedor"}</h2>
              <button onClick={() => setForm(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="field-label">Nome *</label>
                <input className="field-input w-full" value={form.name ?? ""} autoFocus onChange={(e) => setF({ name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">CNPJ</label>
                  <input className="field-input w-full" value={form.cnpj ?? ""} onChange={(e) => setF({ cnpj: e.target.value })} /></div>
                <div><label className="field-label">Categoria</label>
                  <input className="field-input w-full" placeholder="Ex.: Alimentos" value={form.category ?? ""} onChange={(e) => setF({ category: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">Telefone</label>
                  <input className="field-input w-full" value={form.phone ?? ""} onChange={(e) => setF({ phone: e.target.value })} /></div>
                <div><label className="field-label">E-mail</label>
                  <input className="field-input w-full" value={form.email ?? ""} onChange={(e) => setF({ email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
            <div className="p-5 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-card">
              <button onClick={() => setForm(null)} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
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
