// src/components/admin/HousekeepingTaskManagerModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { X, Save, Trash2, Edit3, MessageSquare, Plus, UserPlus } from "lucide-react";
import { HousekeepingTask, Cabin, Staff } from "@/types/aura";
import { HousekeepingService } from "@/services/housekeeping-service";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TaskManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  task: HousekeepingTask | null; // Se null, é modo de Criação
  cabins: Record<string, Cabin>;
  maids: Staff[];
}

export function HousekeepingTaskManagerModal({ isOpen, onClose, propertyId, task, cabins, maids }: TaskManagerModalProps) {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState<Partial<HousekeepingTask>>({
    type: 'turnover',
    status: 'pending',
    cabinId: '',
    assignedTo: [],
    observations: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (task) {
        setFormData({
          type: task.type,
          status: task.status,
          cabinId: task.cabinId,
          assignedTo: task.assignedTo || [],
          observations: task.observations || ''
        });
      } else {
        setFormData({
          type: 'turnover',
          status: 'pending',
          cabinId: Object.keys(cabins)[0] || '', // Pre-seleciona a primeira cabana
          assignedTo: [],
          observations: ''
        });
      }
    }
  }, [isOpen, task, cabins]);

  if (!isOpen) return null;

  const toggleMaid = (maidId: string) => {
    setFormData(prev => {
      const current = prev.assignedTo || [];
      if (current.includes(maidId)) {
        return { ...prev, assignedTo: current.filter(id => id !== maidId) };
      } else {
        return { ...prev, assignedTo: [...current, maidId] };
      }
    });
  };

  const handleSave = async () => {
    if (!formData.cabinId) return toast.error("Selecione uma acomodação.");

    setLoading(true);
    try {
      if (task) {
        // Modo Edição
        await HousekeepingService.updateTask(
          propertyId, task.id, formData, userData?.id || "admin", userData?.fullName || "Admin"
        );
        toast.success("Tarefa atualizada com sucesso!");
      } else {
        // Modo Criação
        await HousekeepingService.createTask(
          propertyId, formData, userData?.id || "admin", userData?.fullName || "Admin"
        );
        toast.success("Nova tarefa criada!");
      }
      onClose();
    } catch (error) {
      toast.error("Erro ao salvar tarefa.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm("Tem certeza que deseja apagar esta tarefa do sistema?")) return;
    setLoading(true);
    try {
      await HousekeepingService.deleteTask(propertyId, task.id, userData?.id || "admin", userData?.fullName || "Admin");
      toast.success("Tarefa deletada.");
      onClose();
    } catch (error) {
      toast.error("Erro ao deletar.");
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!task;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border border-border w-full max-w-xl rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh]">
        
        <div className="p-6 border-b border-border bg-secondary/50 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
              {isEditing ? <Edit3 className="text-primary" /> : <Plus className="text-primary" />}
              {isEditing ? "Gestão da Faxina" : "Criar Tarefa Manual"}
            </h2>
            {isEditing && <p className="text-xs text-muted-foreground font-mono mt-1">ID: {task.id}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1 bg-background">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Acomodação</label>
              <select 
                disabled={isEditing} // Não deixa mudar a cabana depois de criada
                value={formData.cabinId} 
                onChange={e => setFormData({...formData, cabinId: e.target.value})}
                className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none disabled:opacity-50"
              >
                {Object.values(cabins).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Tipo de Limpeza</label>
              <select 
                value={formData.type} 
                onChange={e => setFormData({...formData, type: e.target.value as any})}
                className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none"
              >
                <option value="turnover">Faxina Completa (Troca)</option>
                <option value="daily">Arrumação Diária</option>
              </select>
            </div>
          </div>

          {isEditing && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Status / Progresso</label>
              <select 
                value={formData.status} 
                onChange={e => setFormData({...formData, status: e.target.value as any})}
                className="w-full bg-orange-500/10 text-orange-600 border border-orange-500/30 p-3 rounded-xl font-bold text-sm outline-none"
              >
                <option value="pending">A Fazer (Pendente)</option>
                <option value="in_progress">Em Limpeza (Cronômetro Rodando)</option>
                <option value="waiting_conference">Aguardando Conferência</option>
                <option value="completed">Concluída (Liberada)</option>
              </select>
              <p className="text-[10px] text-muted-foreground">Altere o status para "forçar" a movimentação da tarefa no Kanban.</p>
            </div>
          )}

          <div className="space-y-3 pt-4 border-t border-border">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
              <UserPlus size={14}/> Camareiras Atribuídas
            </label>
            <div className="grid grid-cols-2 gap-2">
              {maids.map(maid => {
                const isSelected = formData.assignedTo?.includes(maid.id);
                return (
                  <button
                    key={maid.id}
                    onClick={() => toggleMaid(maid.id)}
                    className={cn(
                      "p-3 rounded-xl border text-left text-sm font-bold transition-all",
                      isSelected ? "bg-primary/10 border-primary text-primary" : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {maid.fullName.split(' ')[0]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-border">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
              <MessageSquare size={14}/> Observações / Recados
            </label>
            <textarea 
              value={formData.observations}
              onChange={e => setFormData({...formData, observations: e.target.value})}
              placeholder="Notas para a camareira ou observações deixadas por ela..."
              className="w-full bg-secondary border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-sm resize-none h-24 custom-scrollbar text-foreground"
            />
          </div>

        </div>

        <div className="p-6 border-t border-border bg-secondary/30 flex justify-between items-center shrink-0">
          {isEditing ? (
            <button onClick={handleDelete} className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors">
              <Trash2 size={20}/>
            </button>
          ) : <div/>}

          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-3 font-bold text-xs uppercase text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button 
              onClick={handleSave} 
              disabled={loading}
              className="px-6 py-3 bg-primary text-primary-foreground font-bold text-xs uppercase rounded-xl hover:opacity-90 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? "Salvando..." : <><Save size={16}/> Salvar Tarefa</>}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}