// src/components/admin/MinibarModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { X, Save, Coffee, Plus, Minus, AlertCircle, ShoppingCart } from "lucide-react";
import { HousekeepingTask } from "@/types/aura";
import { HousekeepingService } from "@/services/housekeeping-service";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MinibarModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: HousekeepingTask | null;
  cabinName: string;
}

// Catálogo Temporário (No futuro virá de uma coleção "Products/Stock" do Firebase)
const MINIBAR_CATALOG = [
  { id: 'agua_sem_gas', name: 'Água sem Gás (500ml)', price: 5.00 },
  { id: 'agua_com_gas', name: 'Água com Gás (500ml)', price: 6.00 },
  { id: 'refrigerante', name: 'Refrigerante Cola (Lata)', price: 8.00 },
  { id: 'heineken', name: 'Cerveja Heineken (Long Neck)', price: 15.00 },
  { id: 'suco_uva', name: 'Suco de Uva Integral', price: 12.00 },
  { id: 'amendoim', name: 'Amendoim Japonês', price: 10.00 },
  { id: 'chocolate', name: 'Barra de Chocolate', price: 14.00 },
];

export function MinibarModal({ isOpen, onClose, task, cabinName }: MinibarModalProps) {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Estado do carrinho: { 'id_do_produto': quantidade }
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isOpen) {
      setCart({}); // Limpa o carrinho toda vez que abre o modal
    }
  }, [isOpen]);

  if (!isOpen || !task) return null;

  // Lógica de + e -
  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      const current = prev[productId] || 0;
      const next = current + delta;
      if (next < 0) return prev; // Não permite negativo
      
      const newCart = { ...prev };
      if (next === 0) {
        delete newCart[productId]; // Limpa do objeto se for 0
      } else {
        newCart[productId] = next;
      }
      return newCart;
    });
  };

  const handleSave = async () => {
    // Se não tiver stayId, é uma tarefa isolada sem hóspede (ex: tarefa manual de teste)
    if (!task.stayId) {
      toast.error("Esta tarefa não está vinculada a uma reserva. O consumo não tem onde ser lançado.");
      return;
    }

    const itemsToSave = Object.keys(cart).map(productId => {
      const product = MINIBAR_CATALOG.find(p => p.id === productId)!;
      const quantity = cart[productId];
      return {
        description: product.name,
        quantity: quantity,
        unitPrice: product.price,
        totalPrice: product.price * quantity,
        category: 'minibar' as const,
        addedBy: userData?.id || "SYSTEM"
      };
    });

    if (itemsToSave.length === 0) {
      toast.info("Nenhum consumo foi adicionado.");
      onClose();
      return;
    }

    setLoading(true);
    try {
      // Salva todos os itens no Folio da Estadia
      await Promise.all(
        itemsToSave.map(item => 
          HousekeepingService.addFolioItem(task.propertyId, task.stayId!, item)
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
              ATENÇÃO: Tarefa sem reserva vinculada. Use isto apenas para teste, os lançamentos não terão onde ser cobrados.
            </div>
          )}

          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Selecione o que o hóspede consumiu:</p>

          {MINIBAR_CATALOG.map((product) => {
            const quantity = cart[product.id] || 0;
            return (
              <div key={product.id} className={cn(
                "flex items-center justify-between p-3 rounded-xl border transition-all",
                quantity > 0 ? "bg-blue-500/5 border-blue-500/30" : "bg-background border-border hover:border-foreground/20"
              )}>
                <span className={cn(
                  "text-sm font-medium",
                  quantity > 0 ? "text-foreground font-bold" : "text-muted-foreground"
                )}>
                  {product.name}
                </span>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => updateQuantity(product.id, -1)}
                    disabled={quantity === 0}
                    className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-destructive hover:text-white transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-4 text-center font-black text-sm">{quantity}</span>
                  <button 
                    onClick={() => updateQuantity(product.id, 1)}
                    className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground hover:bg-blue-500 hover:text-white transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            );
          })}
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
              disabled={loading || (!task.stayId && totalItems > 0)}
              className="px-6 py-3 bg-blue-600 text-white font-bold text-xs uppercase rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? "Lançando..." : <><Save size={16}/> Lançar na Conta</>}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}