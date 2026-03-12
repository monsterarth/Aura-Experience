// src/app/admin/core/concierge/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { ConciergeService } from "@/services/concierge-service";
import { ConciergeItem, ConciergeCategory } from "@/types/aura";
import { ImageUpload } from "@/components/admin/ImageUpload";
import {
  Package, Plus, Edit2, Loader2, ShoppingBag, Eye, EyeOff,
  X, Save
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface ItemForm {
  name: string;
  name_en: string;
  name_es: string;
  description: string;
  description_en: string;
  description_es: string;
  category: ConciergeCategory;
  price: string;
  loss_price: string;
  included_qty: string;
  image_url: string;
  active: boolean;
  order: string;
}

const defaultForm: ItemForm = {
  name: '',
  name_en: '',
  name_es: '',
  description: '',
  description_en: '',
  description_es: '',
  category: 'consumption',
  price: '0',
  loss_price: '',
  included_qty: '0',
  image_url: '',
  active: true,
  order: '0',
};

export default function ConciergeConfigPage() {
  const { currentProperty: property, loading: propLoading } = useProperty();
  const { userData } = useAuth();

  const [items, setItems] = useState<ConciergeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm>(defaultForm);
  const [saving, setSaving] = useState(false);

  const loadItems = async () => {
    if (!property) return;
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase
        .from('concierge_items')
        .select('*')
        .eq('propertyId', property.id)
        .order('order', { ascending: true });
      setItems((data || []) as ConciergeItem[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (property) loadItems();
  }, [property]);

  const openNew = () => {
    setForm(defaultForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (item: ConciergeItem) => {
    setForm({
      name: item.name,
      name_en: item.name_en || '',
      name_es: item.name_es || '',
      description: item.description || '',
      description_en: item.description_en || '',
      description_es: item.description_es || '',
      category: item.category,
      price: String(item.price),
      loss_price: item.loss_price != null ? String(item.loss_price) : '',
      included_qty: String(item.included_qty),
      image_url: item.image_url || '',
      active: item.active,
      order: String(item.order ?? 0),
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!property || !userData) return;
    if (!form.name.trim()) { toast.error('Nome é obrigatório.'); return; }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        name_en: form.name_en.trim() || undefined,
        name_es: form.name_es.trim() || undefined,
        description: form.description.trim() || undefined,
        description_en: form.description_en.trim() || undefined,
        description_es: form.description_es.trim() || undefined,
        category: form.category,
        price: parseFloat(form.price) || 0,
        loss_price: form.loss_price ? parseFloat(form.loss_price) : undefined,
        included_qty: parseInt(form.included_qty) || 0,
        image_url: form.image_url || undefined,
        active: form.active,
        order: parseInt(form.order) || 0,
      };

      if (editingId) {
        await ConciergeService.updateItem(property.id, editingId, payload, userData.id, userData.fullName);
        toast.success('Item atualizado.');
      } else {
        await ConciergeService.createItem(property.id, payload, userData.id, userData.fullName);
        toast.success('Item criado.');
      }

      setShowForm(false);
      setEditingId(null);
      await loadItems();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar item.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: ConciergeItem) => {
    if (!property || !userData) return;
    try {
      await ConciergeService.updateItem(property.id, item.id, { active: !item.active }, userData.id, userData.fullName);
      toast.success(item.active ? 'Item desativado.' : 'Item ativado.');
      await loadItems();
    } catch {
      toast.error('Erro ao atualizar item.');
    }
  };

  if (propLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-muted-foreground text-sm">Selecione uma propriedade.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center">
            <Package size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground uppercase tracking-wide">Catálogo Concierge</h1>
            <p className="text-xs text-muted-foreground">Configure os itens disponíveis para os hóspedes</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide hover:opacity-90 transition-opacity"
        >
          <Plus size={14} />
          Novo Item
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-3xl w-full max-w-2xl my-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="font-bold text-sm uppercase tracking-wide">
                {editingId ? 'Editar Item' : 'Novo Item'}
              </h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Category */}
              <div>
                <label className="field-label">Categoria</label>
                <div className="flex gap-2">
                  {(['consumption', 'loan'] as ConciergeCategory[]).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setForm(prev => ({ ...prev, category: cat }))}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wide transition-all',
                        form.category === cat
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {cat === 'consumption' ? <ShoppingBag size={13} /> : <Package size={13} />}
                      {cat === 'consumption' ? 'Consumo' : 'Empréstimo'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image */}
              <div>
                <label className="field-label">Imagem</label>
                <ImageUpload
                  value={form.image_url}
                  onUploadSuccess={(url) => setForm(prev => ({ ...prev, image_url: url }))}
                  path="concierge-items"
                />
              </div>

              {/* Names */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="field-label">Nome (PT) *</label>
                  <input
                    className="field-input"
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Lenha"
                  />
                </div>
                <div>
                  <label className="field-label">Nome (EN)</label>
                  <input
                    className="field-input"
                    value={form.name_en}
                    onChange={e => setForm(prev => ({ ...prev, name_en: e.target.value }))}
                    placeholder="E.g. Firewood"
                  />
                </div>
                <div>
                  <label className="field-label">Nome (ES)</label>
                  <input
                    className="field-input"
                    value={form.name_es}
                    onChange={e => setForm(prev => ({ ...prev, name_es: e.target.value }))}
                    placeholder="Ej: Leña"
                  />
                </div>
              </div>

              {/* Descriptions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="field-label">Descrição (PT)</label>
                  <textarea
                    className="field-input resize-none"
                    rows={2}
                    value={form.description}
                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="field-label">Descrição (EN)</label>
                  <textarea
                    className="field-input resize-none"
                    rows={2}
                    value={form.description_en}
                    onChange={e => setForm(prev => ({ ...prev, description_en: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="field-label">Descrição (ES)</label>
                  <textarea
                    className="field-input resize-none"
                    rows={2}
                    value={form.description_es}
                    onChange={e => setForm(prev => ({ ...prev, description_es: e.target.value }))}
                  />
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="field-label">Preço (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="field-input"
                    value={form.price}
                    onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))}
                  />
                </div>
                {form.category === 'loan' && (
                  <div>
                    <label className="field-label">Multa Extravio (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="field-input"
                      value={form.loss_price}
                      onChange={e => setForm(prev => ({ ...prev, loss_price: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                )}
                <div>
                  <label className="field-label">Qtd Inclusa</label>
                  <input
                    type="number"
                    min="0"
                    className="field-input"
                    value={form.included_qty}
                    onChange={e => setForm(prev => ({ ...prev, included_qty: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="field-label">Ordem</label>
                  <input
                    type="number"
                    min="0"
                    className="field-input"
                    value={form.order}
                    onChange={e => setForm(prev => ({ ...prev, order: e.target.value }))}
                  />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm(prev => ({ ...prev, active: !prev.active }))}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors',
                    form.active ? 'bg-primary' : 'bg-secondary border border-border'
                  )}
                >
                  <span className={cn(
                    'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    form.active ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
                <span className="text-xs font-semibold text-foreground">
                  {form.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>

            <div className="p-5 border-t border-border flex gap-3 justify-end">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl bg-secondary text-foreground text-xs font-bold uppercase tracking-wide hover:bg-border transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhum item cadastrado</p>
          <p className="text-xs mt-1">Clique em &ldquo;Novo Item&rdquo; para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map(item => (
            <div
              key={item.id}
              className={cn(
                'bg-card border rounded-2xl overflow-hidden transition-all',
                item.active ? 'border-border' : 'border-border/40 opacity-60'
              )}
            >
              <div className="flex items-center gap-3 p-4">
                {item.image_url ? (
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0">
                    <Image src={item.image_url} alt={item.name} fill className="object-cover" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                    {item.category === 'loan' ? (
                      <Package size={22} className="text-muted-foreground" />
                    ) : (
                      <ShoppingBag size={22} className="text-muted-foreground" />
                    )}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                    <span className={cn(
                      'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border shrink-0',
                      item.category === 'loan'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-primary/10 text-primary border-primary/20'
                    )}>
                      {item.category === 'loan' ? 'Empréstimo' : 'Consumo'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    R$ {item.price.toFixed(2)}
                    {item.loss_price ? ` • Multa: R$ ${item.loss_price.toFixed(2)}` : ''}
                    {item.included_qty > 0 ? ` • ${item.included_qty} incluso(s)` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleActive(item)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                    title={item.active ? 'Desativar' : 'Ativar'}
                  >
                    {item.active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                    title="Editar"
                  >
                    <Edit2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
