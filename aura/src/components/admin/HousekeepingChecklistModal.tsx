// src/components/admin/HousekeepingChecklistModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { X, CheckCircle2, Save, ClipboardCheck, AlertCircle } from "lucide-react";
import { HousekeepingTask } from "@/types/aura";
import { HousekeepingService } from "@/services/housekeeping-service";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: HousekeepingTask | null;
  cabinName: string;
  onComplete: () => void;
}

// Checklists Padrões caso a tarefa venha vazia (para testes)
const defaultTurnover = [
  { id: '1', label: 'Retirar lixo e inspecionar esquecimentos', checked: false },
  { id: '2', label: 'Trocar todo o enxoval (cama e banho)', checked: false },
  { id: '3', label: 'Higienizar banheiro e repor amenidades', checked: false },
  { id: '4', label: 'Varrer, passar pano e tirar pó geral', checked: false },
  { id: '5', label: 'Conferir funcionamento de luzes e ar condicionado', checked: false },
];

const defaultDaily = [
  { id: '1', label: 'Arrumar a cama', checked: false },
  { id: '2', label: 'Retirar lixo do banheiro', checked: false },
  { id: '3', label: 'Trocar toalhas de banho (se estiverem no chão)', checked: false },
  { id: '4', label: 'Varrer área central da cabana', checked: false },
];

export function HousekeepingChecklistModal({ isOpen, onClose, task, cabinName, onComplete }: ChecklistModalProps) {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState<{ id: string; label: string; checked: boolean }[]>([]);
  const [observations, setObservations] = useState("");

  useEffect(() => {
    if (isOpen && task) {
      setObservations(task.observations || "");
      
      // Se a tarefa já tem um checklist salvo, usamos ele. Se não, geramos um padrão baseado no tipo.
      if (task.checklist && task.checklist.length > 0) {
        setChecklist(task.checklist);
      } else {
        setChecklist(task.type === 'turnover' ? [...defaultTurnover] : [...defaultDaily]);
      }
    }
  }, [isOpen, task]);

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
      onComplete(); // Atualiza o Kanban
      onClose(); // Fecha o Modal
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar o checklist.");
    } finally {
      setLoading(false);
    }
  };

  const allChecked = checklist.every(item => item.checked);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border border-border w-full max-w-lg rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* HEADER */}
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

        {/* BODY */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh] custom-scrollbar">
          
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
                <span className={cn(
                  "text-sm font-medium transition-all select-none",
                  item.checked ? "text-foreground line-through opacity-70" : "text-foreground"
                )}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-2 pt-4 border-t border-border">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Observações (Opcional)</h3>
            <textarea 
              value={observations}
              onChange={e => setObservations(e.target.value)}
              placeholder="Ex: Lençol manchado, lâmpada queimada..."
              className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-sm resize-none h-24 custom-scrollbar text-foreground"
            />
          </div>

          {!allChecked && (
            <div className="flex items-center gap-2 p-3 bg-orange-500/10 text-orange-600 rounded-xl text-xs font-bold">
              <AlertCircle size={16} /> Faltam itens no checklist. Tem certeza que terminou?
            </div>
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
            {loading ? "Salvando..." : <><Save size={16}/> Enviar p/ Governanta</>}
          </button>
        </div>

      </div>
    </div>
  );
}