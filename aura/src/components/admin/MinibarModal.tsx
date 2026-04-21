// src/components/admin/MinibarModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { X, Save, Coffee, Plus, Minus, AlertCircle, ShoppingCart, Loader2, Settings } from "lucide-react";
import { HousekeepingTask, MinibarItem } from "@/types/aura";
import { StayService } from "@/services/stay-service";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MinibarModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: HousekeepingTask | null;
  cabinName: string;
}

export function MinibarModal({ isOpen, onClose, task, cabinName }: MinibarModalProps) {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [items, setItems] = useState<MinibarItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isOpen && task?.cabinId) {
      setCart({});
      fetchItems(task.cabinId, task.propertyId);
    }
  }, [isOpen, task?.cabinId]);

  const fetchItems = async (cabinId: string, propertyId: string) => {
    setLoadingItems(true);
    try {
      // 1. Load global catalog for this property
      const { data: globals, error } = await supabase
        .from('minibar_items')
        .select('*')
        .eq('propertyId', propertyId)
        .is('cabinId', null)
        .eq('active', true)
        .order('order', { ascending: true });
      if (error) throw error;

      // 2. Load cabin-specific overrides
      const { data: overrides } = await supabase
        .from('minibar_cabin_overrides')
        .select('*')
        .eq('cabinId', cabinId);
      const overrideMap: Record<string, { active: boolean; price: number | null }> = {};
      for (const ov of (overrides || [])) {
        overrideMap[ov.itemId] = { active: ov.active, price: ov.price };
      }

      // 3. Merge: filter by effective active, apply override price
      const merged = (globals || [])
        .map((item: MinibarItem) => {
          const ov = overrideMap[item.id];
          const active = ov ? ov.active : item.active;
          const price = (ov && ov.price !== null) ? ov.price : item.price;
          return { ...item, active, price };
        })
        .filter((item: MinibarItem) => item.active);

      setItems(merged);
    } catch {
      toast.error('Erro ao carregar itens do frigobar.');
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  if (!isOpen || !task) return null;

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      const current = prev[itemId] || 0;
      const next = current + delta;
      if (next < 0) return prev;
      const newCart = { ...prev };
      if (next === 0) delete newCart[itemId];
      else newCart[itemId] = next;
      return newCart;
    });
  };

  const handleSave = async () => {
    if (!task.stayId) {
      toast.error("Esta tarefa não está vinculada a uma reserva. O consumo não tem onde ser lançado.");
      return;
    }

    const itemsToSave = Object.keys(cart).map(itemId => {
      const item = items.find(i => i.id === itemId)!;
      const quantity = cart[itemId];
      return {
        description: item.name,
        quantity,
        unitPrice: item.price,
        totalPrice: item.price * quantity,
        category: 'minibar' as const,
        addedBy: userData?.id || "SYSTEM",
      };
    });

    if (itemsToSave.length === 0) {
      toast.info("Nenhum consumo foi adicionado.");
      onClose();
      return;
    }

    setLoading(true);
    try {
      await Promise.all(
        itemsToSave.map(item =>
          StayService.addFolioItemManual(task.propertyId, task.stayId!, item, userData?.id || "SYSTEM", userData?.fullName || "Camareira Aura")
        )
      );
      toast.success(`${itemsToSave.length} item(ns) lançados na conta da cabana!`);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao lançar consumo no frigobar.");
    } finally {
      setLoading(false);
    }
  };

  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border border-border w-full max-w-md rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">

        {/* HEADER */}
        <div className="p-6 border-b border-border bg-secondary/50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
              <Coffee className="text-blue-500" />
              Reposição de Frigobar
            </h2>
            <p className="text-xs text-muted-foreground mt-1 font-bold uppercase tracking-wider">
              {cabinName}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-2 overflow-y-auto max-h-[50vh] custom-scrollbar">
          {!task.stayId && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-500/10 text-red-600 rounded-xl text-xs font-bold leading-tight">
              <AlertCircle size={20} className="shrink-0" />
              ATENÇÃO: Tarefa sem reserva vinculada. Os lançamentos não terão onde ser cobrados.
            </div>
          )}

          {loadingItems ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-blue-500" size={24} />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
              <Settings size={28} className="opacity-40" />
              <p className="text-sm font-medium">Nenhum item configurado</p>
              <p className="text-xs opacity-70">Configure os itens desta cabana em<br />Acomodações → Frigobar.</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Selecione o que o hóspede consumiu:</p>
              {items.map((item) => {
                const quantity = cart[item.id] || 0;
                return (
                  <div key={item.id} className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all",
                    quantity > 0 ? "bg-blue-500/5 border-blue-500/30" : "bg-background border-border hover:border-foreground/20"
                  )}>
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "text-sm font-medium block",
                        quantity > 0 ? "text-foreground font-bold" : "text-muted-foreground"
                      )}>
                        {item.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">R$ {item.price.toFixed(2)}</span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        disabled={quantity === 0}
                        className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-destructive hover:text-white transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-4 text-center font-black text-sm">{quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground hover:bg-blue-500 hover:text-white transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-border bg-secondary/30 flex justify-between items-center gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShoppingCart size={16} />
            <span className="text-xs font-bold uppercase">{totalItems} itens repostos</span>
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-3 font-bold text-xs uppercase text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading || loadingItems || (!task.stayId && totalItems > 0)}
              className="px-6 py-3 bg-blue-600 text-white font-bold text-xs uppercase rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? <><Loader2 size={14} className="animate-spin" /> Lançando...</> : <><Save size={16} /> Lançar na Conta</>}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
