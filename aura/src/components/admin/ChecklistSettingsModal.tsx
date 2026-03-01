// src/components/admin/ChecklistSettingsModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, Save, FileText, CheckSquare, GripVertical } from "lucide-react";
import { HousekeepingService } from "@/services/housekeeping-service";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";

interface ChecklistSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
}

export function ChecklistSettingsModal({ isOpen, onClose, propertyId }: ChecklistSettingsModalProps) {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'turnover' | 'daily'>('turnover');
  
  // Estrutura do Template
  const [template, setTemplate] = useState<any>({
    id: "",
    type: 'turnover',
    title: "Faxina de Troca (Padrão)",
    items: []
  });

  useEffect(() => {
    if (isOpen && propertyId) {
      loadTemplate(activeTab);
    }
  }, [isOpen, propertyId, activeTab]);

  const loadTemplate = async (type: 'turnover' | 'daily') => {
    setLoading(true);
    try {
      const templates = await HousekeepingService.getChecklistTemplates(propertyId);
      const existing = templates.find((t: any) => t.type === type);
      
      if (existing) {
        setTemplate(existing);
      } else {
        // Se não existir, inicia um vazio para criar
        setTemplate({
          id: "", // Vazio para gerar um novo no backend
          type,
          title: type === 'turnover' ? "Faxina de Troca (Padrão)" : "Arrumação Diária (Padrão)",
          items: [
            { id: uuidv4(), label: "", required: true }
          ]
        });
      }
    } catch (error) {
      toast.error("Erro ao carregar os procedimentos.");
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setTemplate({
      ...template,
      items: [...template.items, { id: uuidv4(), label: "", required: true }]
    });
  };

  const updateItem = (id: string, newLabel: string) => {
    setTemplate({
      ...template,
      items: template.items.map((item: any) => item.id === id ? { ...item, label: newLabel } : item)
    });
  };

  const removeItem = (id: string) => {
    setTemplate({
      ...template,
      items: template.items.filter((item: any) => item.id !== id)
    });
  };

  const handleSave = async () => {
    // Filtra itens vazios antes de salvar
    const cleanItems = template.items.filter((i: any) => i.label.trim() !== "");
    if (cleanItems.length === 0) return toast.error("Adicione pelo menos um item válido.");

    setLoading(true);
    try {
      await HousekeepingService.saveChecklistTemplate(
        propertyId, 
        { ...template, items: cleanItems }, 
        userData?.id || "unknown", 
        userData?.fullName || "Admin"
      );
      toast.success("Procedimentos atualizados com sucesso!");
      onClose();
    } catch (error) {
      toast.error("Erro ao salvar procedimento.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border border-border w-full max-w-2xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* HEADER */}
        <div className="p-6 border-b border-border bg-secondary/50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
              <CheckSquare className="text-primary" /> 
              Procedimentos de Limpeza
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Configure o que as camareiras verão no momento de limpar.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* TABS */}
        <div className="flex border-b border-border bg-card px-6 pt-2 gap-4">
          <button 
            onClick={() => setActiveTab('turnover')}
            className={cn("py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all", activeTab === 'turnover' ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
          >
            Faxina de Troca (Check-out)
          </button>
          <button 
            onClick={() => setActiveTab('daily')}
            className={cn("py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all", activeTab === 'daily' ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
          >
            Arrumação Diária
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh] custom-scrollbar bg-background">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <FileText size={16} /> Itens do Checklist
                </h3>
                <button onClick={addItem} className="text-xs font-bold uppercase text-primary bg-primary/10 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-primary/20">
                  <Plus size={14} /> Adicionar Tarefa
                </button>
              </div>

              <div className="space-y-3">
                {template.items.map((item: any, index: number) => (
                  <div key={item.id} className="flex items-center gap-3 bg-card border border-border p-2 pr-4 rounded-xl shadow-sm group">
                    <div className="p-2 text-muted-foreground/30 cursor-grab active:cursor-grabbing hover:text-foreground">
                      <GripVertical size={16} />
                    </div>
                    <div className="w-6 h-6 rounded-full border-2 border-primary/50 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-black text-primary">{index + 1}</span>
                    </div>
                    <input 
                      value={item.label}
                      onChange={(e) => updateItem(item.id, e.target.value)}
                      placeholder="Ex: Trocar toalhas e lençóis..."
                      className="flex-1 bg-transparent text-sm outline-none text-foreground"
                      autoFocus={item.label === ""}
                    />
                    <button onClick={() => removeItem(item.id)} className="p-2 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}

                {template.items.length === 0 && (
                  <div className="text-center py-10 border-2 border-dashed border-border rounded-xl text-muted-foreground text-sm">
                    Nenhuma tarefa definida. A camareira não terá um checklist para preencher.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-6 border-t border-border bg-secondary/30 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 font-bold text-xs uppercase text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button 
            onClick={handleSave} 
            disabled={loading}
            className="px-6 py-3 bg-primary text-primary-foreground font-bold text-xs uppercase rounded-xl hover:opacity-90 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {loading ? "Salvando..." : <><Save size={16}/> Salvar Padrão</>}
          </button>
        </div>

      </div>
    </div>
  );
}
