// src/app/admin/cabins/minibar/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { CabinService } from "@/services/cabin-service";
import { Cabin, MinibarItem } from "@/types/aura";
import { supabase } from "@/lib/supabase";
import {
  Coffee, Plus, Edit2, Loader2, X, Save, ChevronDown, ChevronRight, Trash2,
  Building2, List
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CabinOverride {
  id: string;
  itemId: string;
  cabinId: string;
  active: boolean;
  price: number | null; // null = use global price
  updatedAt: string;
}

interface GlobalItemForm {
  name: string;
  name_en: string;
  name_es: string;
  price: string;
  active: boolean;
  order: string;
}

const defaultGlobalForm: GlobalItemForm = {
  name: '', name_en: '', name_es: '',
  price: '0', active: true, order: '0',
};

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0', value ? 'bg-primary' : 'bg-secondary border border-border')}
    >
      <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', value ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'catalog' | 'cabins';

export default function MinibarConfigPage() {
  const { currentProperty: property } = useProperty();
  const [tab, setTab] = useState<Tab>('catalog');

  // Global catalog
  const [globalItems, setGlobalItems] = useState<MinibarItem[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [showGlobalForm, setShowGlobalForm] = useState(false);
  const [editingGlobalId, setEditingGlobalId] = useState<string | null>(null);
  const [globalForm, setGlobalForm] = useState<GlobalItemForm>(defaultGlobalForm);
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Cabins
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [loadingCabins, setLoadingCabins] = useState(true);
  const [expandedCabin, setExpandedCabin] = useState<string | null>(null);
  // overrides indexed by cabinId → CabinOverride[]
  const [overridesByCabin, setOverridesByCabin] = useState<Record<string, CabinOverride[]>>({});
  const [loadingOverrides, setLoadingOverrides] = useState<Record<string, boolean>>({});

  // ── Load global items ──────────────────────────────────────────────────────
  const loadGlobal = useCallback(async () => {
    if (!property?.id) return;
    setLoadingGlobal(true);
    try {
      const { data } = await supabase
        .from('minibar_items')
        .select('*')
        .eq('propertyId', property.id)
        .is('cabinId', null)
        .order('order', { ascending: true });
      setGlobalItems((data || []) as MinibarItem[]);
    } finally {
      setLoadingGlobal(false);
    }
  }, [property?.id]);

  // ── Load cabins ────────────────────────────────────────────────────────────
  const loadCabins = useCallback(async () => {
    if (!property?.id) return;
    setLoadingCabins(true);
    try {
      const data = await CabinService.getCabinsByProperty(property.id);
      setCabins(data);
    } finally {
      setLoadingCabins(false);
    }
  }, [property?.id]);

  useEffect(() => {
    if (property?.id) {
      loadGlobal();
      loadCabins();
    }
  }, [property?.id, loadGlobal, loadCabins]);

  // ── Load overrides for a cabin ─────────────────────────────────────────────
  const loadOverrides = async (cabinId: string) => {
    if (overridesByCabin[cabinId]) return;
    setLoadingOverrides(prev => ({ ...prev, [cabinId]: true }));
    try {
      const { data } = await supabase
        .from('minibar_cabin_overrides')
        .select('*')
        .eq('cabinId', cabinId);
      setOverridesByCabin(prev => ({ ...prev, [cabinId]: (data || []) as CabinOverride[] }));
    } finally {
      setLoadingOverrides(prev => ({ ...prev, [cabinId]: false }));
    }
  };

  const toggleCabin = (cabinId: string) => {
    if (expandedCabin === cabinId) {
      setExpandedCabin(null);
    } else {
      setExpandedCabin(cabinId);
      loadOverrides(cabinId);
    }
  };

  // ── Global form handlers ───────────────────────────────────────────────────
  const openGlobalNew = () => {
    setGlobalForm(defaultGlobalForm);
    setEditingGlobalId(null);
    setShowGlobalForm(true);
  };

  const openGlobalEdit = (item: MinibarItem) => {
    setGlobalForm({
      name: item.name,
      name_en: item.name_en || '',
      name_es: item.name_es || '',
      price: String(item.price),
      active: item.active,
      order: String(item.order ?? 0),
    });
    setEditingGlobalId(item.id);
    setShowGlobalForm(true);
  };

  const handleSaveGlobal = async () => {
    if (!property) return;
    if (!globalForm.name.trim()) { toast.error('Nome é obrigatório.'); return; }
    setSavingGlobal(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        propertyId: property.id,
        cabinId: null,
        name: globalForm.name.trim(),
        name_en: globalForm.name_en.trim() || null,
        name_es: globalForm.name_es.trim() || null,
        price: parseFloat(globalForm.price) || 0,
        stock: 0,
        active: globalForm.active,
        order: parseInt(globalForm.order) || 0,
        updatedAt: now,
      };

      if (editingGlobalId) {
        const { error } = await supabase.from('minibar_items').update(payload).eq('id', editingGlobalId);
        if (error) throw error;
        toast.success('Item atualizado.');
      } else {
        const { error } = await supabase.from('minibar_items').insert({ ...payload, id: crypto.randomUUID(), createdAt: now });
        if (error) throw error;
        toast.success('Item criado.');
      }

      setShowGlobalForm(false);
      await loadGlobal();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar item.');
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleDeleteGlobal = async (itemId: string) => {
    try {
      // Remove overrides first
      await supabase.from('minibar_cabin_overrides').delete().eq('itemId', itemId);
      const { error } = await supabase.from('minibar_items').delete().eq('id', itemId);
      if (error) throw error;
      toast.success('Item removido.');
      await loadGlobal();
      // Invalidate all cabin overrides caches
      setOverridesByCabin({});
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao remover item.');
    }
  };

  // ── Override handlers ──────────────────────────────────────────────────────
  const getOverride = (cabinId: string, itemId: string): CabinOverride | undefined =>
    (overridesByCabin[cabinId] || []).find(o => o.itemId === itemId);

  const upsertOverride = async (cabinId: string, itemId: string, patch: Partial<CabinOverride>) => {
    const existing = getOverride(cabinId, itemId);
    const now = new Date().toISOString();

    if (existing) {
      const { error } = await supabase
        .from('minibar_cabin_overrides')
        .update({ ...patch, updatedAt: now })
        .eq('id', existing.id);
      if (error) throw error;
      setOverridesByCabin(prev => ({
        ...prev,
        [cabinId]: prev[cabinId].map(o => o.id === existing.id ? { ...o, ...patch, updatedAt: now } : o),
      }));
    } else {
      const newOverride: CabinOverride = {
        id: crypto.randomUUID(),
        itemId,
        cabinId,
        active: true,
        price: null,
        updatedAt: now,
        ...patch,
      };
      const { error } = await supabase.from('minibar_cabin_overrides').insert(newOverride);
      if (error) throw error;
      setOverridesByCabin(prev => ({
        ...prev,
        [cabinId]: [...(prev[cabinId] || []), newOverride],
      }));
    }
  };

  const handleToggleCabinItem = async (cabinId: string, itemId: string, currentActive: boolean) => {
    try {
      await upsertOverride(cabinId, itemId, { active: !currentActive });
    } catch {
      toast.error('Erro ao atualizar item.');
    }
  };

  const handlePriceOverride = async (cabinId: string, itemId: string, priceStr: string) => {
    const price = priceStr === '' ? null : parseFloat(priceStr);
    try {
      await upsertOverride(cabinId, itemId, { price: isNaN(price as number) ? null : price });
    } catch {
      toast.error('Erro ao atualizar preço.');
    }
  };

  // Effective state for a cabin item (override takes precedence)
  const effectiveActive = (cabinId: string, item: MinibarItem): boolean => {
    const ov = getOverride(cabinId, item.id);
    // If no override yet, item is active by default (inherits global)
    return ov ? ov.active : item.active;
  };

  const effectivePrice = (cabinId: string, item: MinibarItem): number => {
    const ov = getOverride(cabinId, item.id);
    return (ov && ov.price !== null) ? ov.price : item.price;
  };

  const hasCustomPrice = (cabinId: string, itemId: string): boolean => {
    const ov = getOverride(cabinId, itemId);
    return !!(ov && ov.price !== null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/10 rounded-2xl flex items-center justify-center">
            <Coffee size={20} className="text-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground uppercase tracking-wide">Frigobar</h1>
            <p className="text-xs text-muted-foreground">Catálogo global + ajustes por cabana</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('catalog')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all',
            tab === 'catalog' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <List size={13} /> Catálogo Global
        </button>
        <button
          onClick={() => setTab('cabins')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all',
            tab === 'cabins' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Building2 size={13} /> Por Cabana
        </button>
      </div>

      {/* ── TAB: Catálogo Global ── */}
      {tab === 'catalog' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Estes itens são herdados por todas as cabanas. Ajuste preço ou ative/desative individualmente na aba &ldquo;Por Cabana&rdquo;.
            </p>
            <button
              onClick={openGlobalNew}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-xl text-xs font-bold uppercase hover:opacity-90 transition-opacity shrink-0"
            >
              <Plus size={13} /> Novo Item
            </button>
          </div>

          {loadingGlobal ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={22} /></div>
          ) : globalItems.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl text-muted-foreground">
              <Coffee size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Nenhum item no catálogo</p>
              <button onClick={openGlobalNew} className="mt-2 text-xs font-black uppercase text-primary hover:underline">
                + Criar primeiro item
              </button>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {globalItems.map(item => (
                <div key={item.id} className={cn('flex items-center gap-3 px-4 py-3', !item.active && 'opacity-50')}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground font-semibold">R$ {item.price.toFixed(2)}</span>
                      {item.name_en && <span className="text-[10px] text-muted-foreground/60">EN: {item.name_en}</span>}
                      {item.name_es && <span className="text-[10px] text-muted-foreground/60">ES: {item.name_es}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Toggle
                      value={item.active}
                      onChange={async (v) => {
                        await supabase.from('minibar_items').update({ active: v, updatedAt: new Date().toISOString() }).eq('id', item.id);
                        await loadGlobal();
                      }}
                    />
                    <button
                      onClick={() => openGlobalEdit(item)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteGlobal(item.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Por Cabana ── */}
      {tab === 'cabins' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            Ative/desative itens ou sobrescreva o preço para uma cabana específica. Sem ajuste, o item herda o padrão global.
          </p>

          {loadingCabins ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={22} /></div>
          ) : globalItems.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl text-muted-foreground">
              <Coffee size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">Configure o catálogo global primeiro.</p>
            </div>
          ) : cabins.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl text-muted-foreground">
              <p className="text-sm font-medium">Nenhuma cabana cadastrada.</p>
            </div>
          ) : (
            cabins.map(cabin => {
              const isOpen = expandedCabin === cabin.id;
              const isLoadingOv = loadingOverrides[cabin.id];

              return (
                <div key={cabin.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <button
                    onClick={() => toggleCabin(cabin.id)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors"
                  >
                    {isOpen ? <ChevronDown size={15} className="text-primary shrink-0" /> : <ChevronRight size={15} className="text-muted-foreground shrink-0" />}
                    <span className="font-bold text-sm text-foreground flex-1 text-left">{cabin.name}</span>
                    {isOpen && !isLoadingOv && overridesByCabin[cabin.id] !== undefined && (() => {
                      const customCount = (overridesByCabin[cabin.id] || []).filter(o => !o.active || o.price !== null).length;
                      return customCount > 0 ? (
                        <span className="text-[10px] font-bold bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded-full">
                          {customCount} ajuste{customCount > 1 ? 's' : ''}
                        </span>
                      ) : null;
                    })()}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border">
                      {isLoadingOv ? (
                        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-primary" /></div>
                      ) : (
                        <div className="divide-y divide-border/60">
                          {globalItems.map(item => {
                            const active = effectiveActive(cabin.id, item);
                            const price = effectivePrice(cabin.id, item);
                            const customP = hasCustomPrice(cabin.id, item.id);

                            return (
                              <div key={item.id} className={cn('flex items-center gap-3 px-4 py-3', !active && 'opacity-50')}>
                                {/* Active toggle */}
                                <Toggle
                                  value={active}
                                  onChange={() => handleToggleCabinItem(cabin.id, item.id, active)}
                                />

                                {/* Name */}
                                <div className="flex-1 min-w-0">
                                  <p className={cn('text-sm font-semibold', active ? 'text-foreground' : 'text-muted-foreground line-through')}>
                                    {item.name}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Padrão: R$ {item.price.toFixed(2)}
                                  </p>
                                </div>

                                {/* Price override */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] font-bold text-muted-foreground">R$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder={item.price.toFixed(2)}
                                    defaultValue={customP ? price.toFixed(2) : ''}
                                    onBlur={e => handlePriceOverride(cabin.id, item.id, e.target.value)}
                                    className={cn(
                                      'w-20 text-xs font-bold text-right bg-background border rounded-lg px-2 py-1 outline-none focus:border-primary/50 transition-colors',
                                      customP ? 'border-orange-500/40 text-orange-600' : 'border-border text-muted-foreground'
                                    )}
                                  />
                                  {customP && (
                                    <button
                                      onClick={() => handlePriceOverride(cabin.id, item.id, '')}
                                      title="Remover ajuste de preço"
                                      className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                      <X size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Global item form modal ── */}
      {showGlobalForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="font-bold text-sm uppercase tracking-wide">
                {editingGlobalId ? 'Editar Item' : 'Novo Item do Frigobar'}
              </h2>
              <button onClick={() => setShowGlobalForm(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="field-label">Nome (PT) *</label>
                  <input className="field-input" value={globalForm.name} onChange={e => setGlobalForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Água sem gás" />
                </div>
                <div>
                  <label className="field-label">Nome (EN)</label>
                  <input className="field-input" value={globalForm.name_en} onChange={e => setGlobalForm(p => ({ ...p, name_en: e.target.value }))} placeholder="Still water" />
                </div>
                <div>
                  <label className="field-label">Nome (ES)</label>
                  <input className="field-input" value={globalForm.name_es} onChange={e => setGlobalForm(p => ({ ...p, name_es: e.target.value }))} placeholder="Agua sin gas" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Preço padrão (R$)</label>
                  <input type="number" min="0" step="0.01" className="field-input" value={globalForm.price} onChange={e => setGlobalForm(p => ({ ...p, price: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Ordem</label>
                  <input type="number" min="0" className="field-input" value={globalForm.order} onChange={e => setGlobalForm(p => ({ ...p, order: e.target.value }))} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Toggle value={globalForm.active} onChange={v => setGlobalForm(p => ({ ...p, active: v }))} />
                <span className="text-xs font-semibold">{globalForm.active ? 'Ativo por padrão' : 'Inativo por padrão'}</span>
              </div>
            </div>

            <div className="p-5 border-t border-border flex gap-3 justify-end">
              <button onClick={() => setShowGlobalForm(false)} className="px-4 py-2 rounded-xl bg-secondary text-foreground text-xs font-bold uppercase hover:bg-border transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSaveGlobal}
                disabled={savingGlobal}
                className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {savingGlobal ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
