// src/components/admin/HousekeepingChecklistModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { X, CheckCircle2, Save, ClipboardCheck, AlertCircle } from "lucide-react";
import { HousekeepingTask } from "@/types/aura";
import { HousekeepingService } from "@/services/housekeeping-service";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: HousekeepingTask | null;
  cabinName: string;
  onComplete: () => void;
}

export function HousekeepingChecklistModal({ isOpen, onClose, task, cabinName, onComplete }: ChecklistModalProps) {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetchingTemplate, setFetchingTemplate] = useState(false);
  const [checklist, setChecklist] = useState<{ id: string; label: string; checked: boolean; source?: 'global' | 'cabin' | 'stay' }[]>([]);
  const [observations, setObservations] = useState("");

  useEffect(() => {
    if (isOpen && task) {
      setObservations(task.observations || "");
      
      if (task.checklist && task.checklist.length > 0) {
        setChecklist(task.checklist);
      } else {
        fetchDynamicChecklist();
      }
    }
  }, [isOpen, task]);

  // A mágica acontece aqui: O sistema agrupa 3 fontes diferentes de tarefas
  const fetchDynamicChecklist = async () => {
    if (!task) return;
    setFetchingTemplate(true);
    try {
      let combinedChecklist: any[] = [];

      // 1. A Camada Global (O Padrão da Pousada)
      const templates = await HousekeepingService.getChecklistTemplates(task.propertyId);
      const activeTemplate = templates.find((t: any) => t.type === task.type);
      
      if (activeTemplate && activeTemplate.items) {
        combinedChecklist.push(...activeTemplate.items.map((i: any) => ({ 
          id: i.id, label: i.label, checked: false, source: 'global' 
        })));
      }

      // 2. A Camada da Cabana (Tarefas exclusivas desta unidade, ex: Ofurô)
      if (task.cabinId) {
        const cabinSnap = await getDoc(doc(db, "properties", task.propertyId, "cabins", task.cabinId));
        if (cabinSnap.exists()) {
          const cabinData = cabinSnap.data();
          if (cabinData.housekeepingItems && cabinData.housekeepingItems.length > 0) {
            combinedChecklist.push(...cabinData.housekeepingItems.map((i: any) => ({ 
              id: i.id, label: i.label, checked: false, source: 'cabin' 
            })));
          }
        }
      }

      // 3. A Camada da Estadia (Pedidos especiais da recepção para este hóspede)
      if (task.stayId && !task.stayId.includes("MOCK")) {
        const staySnap = await getDoc(doc(db, "properties", task.propertyId, "stays", task.stayId));
        if (staySnap.exists()) {
          const stayData = staySnap.data();
          if (stayData.housekeepingItems && stayData.housekeepingItems.length > 0) {
            combinedChecklist.push(...stayData.housekeepingItems.map((i: any) => ({ 
              id: i.id, label: i.label, checked: false, source: 'stay' 
            })));
          }
        }
      }

      // Fallback de segurança se tudo estiver vazio
      if (combinedChecklist.length === 0) {
        combinedChecklist.push({ id: 'fallback-1', label: 'Limpeza padrão concluída', checked: false, source: 'global' });
      }

      setChecklist(combinedChecklist);
    } catch (error) {
      console.error("Erro ao montar checklist", error);
    } finally {
      setFetchingTemplate(false);
    }
  };

  if (!isOpen || !task) return null;

  const toggleCheck = (id: string) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await HousekeepingService.finishTask(
        task.propertyId,
        task.id,
        checklist,
        observations,
        userData?.id || "unknown",
        userData?.fullName || "Camareira"
      );
      toast.success("Limpeza finalizada e enviada para conferência!");
      onComplete(); 
      onClose(); 
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar o checklist.");
    } finally {
      setLoading(false);
    }
  };

  const allChecked = checklist.every(item => item.checked);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border border-border w-full max-w-lg rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        <div className="p-6 border-b border-border bg-secondary/50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
              <ClipboardCheck className="text-primary" /> 
              Finalizar Limpeza
            </h2>
            <p className="text-xs text-muted-foreground mt-1 font-bold uppercase tracking-wider">
              {cabinName} • {task.type === 'turnover' ? 'Faxina de Troca' : 'Arrumação Diária'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh] custom-scrollbar">
          
          {fetchingTemplate ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Checklist de Tarefas</h3>
              {checklist.map((item) => (
                <label 
                  key={item.id} 
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all",
                    item.checked ? "bg-primary/5 border-primary/30" : "bg-background border-border hover:border-primary/50"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                    item.checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 bg-background"
                  )}>
                    {item.checked && <CheckCircle2 size={14} strokeWidth={3} />}
                  </div>
                  
                  <input type="checkbox" className="sr-only" checked={item.checked} onChange={() => toggleCheck(item.id)} />
                  
                  <div className="flex-1 flex flex-col gap-1">
                    <span className={cn("text-sm font-medium transition-all select-none", item.checked ? "text-foreground line-through opacity-70" : "text-foreground")}>
                      {item.label}
                    </span>
                    
                    {/* AS ETIQUETAS VISUAIS DE ORIGEM */}
                    {item.source === 'cabin' && (
                      <span className="w-fit text-[9px] font-black uppercase bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-md">Padrão desta Cabana</span>
                    )}
                    {item.source === 'stay' && (
                      <span className="w-fit text-[9px] font-black uppercase bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-md">Pedido do Hóspede</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-4 border-t border-border">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Observações (Opcional)</h3>
            <textarea 
              value={observations}
              onChange={e => setObservations(e.target.value)}
              placeholder="Ex: Lençol manchado, lâmpada queimada..."
              className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-sm resize-none h-24 custom-scrollbar text-foreground"
            />
          </div>

          {!allChecked && checklist.length > 0 && !fetchingTemplate && (
            <div className="flex items-center gap-2 p-3 bg-orange-500/10 text-orange-600 rounded-xl text-xs font-bold">
              <AlertCircle size={16} /> Faltam itens no checklist. Tem certeza que terminou?
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border bg-secondary/30 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 font-bold text-xs uppercase text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button 
            onClick={handleSave} 
            disabled={loading || fetchingTemplate}
            className="px-6 py-3 bg-primary text-primary-foreground font-bold text-xs uppercase rounded-xl hover:opacity-90 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {loading ? "Salvando..." : <><Save size={16}/> Enviar p/ Governanta</>}
          </button>
        </div>

      </div>
    </div>
  );
}
