// src/components/admin/HousekeepingTaskManagerModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { X, Save, Trash2, Edit3, MessageSquare, Plus, UserPlus } from "lucide-react";
import { HousekeepingTask, Cabin, Staff, Structure } from "@/types/aura";
import { HousekeepingService } from "@/services/housekeeping-service";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TaskManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  task: HousekeepingTask | null;
  cabins: Record<string, Cabin>;
  structures: Record<string, Structure>;
  maids: Staff[];
}

type LocalType = 'cabin' | 'structure' | 'custom';

export function HousekeepingTaskManagerModal({ isOpen, onClose, propertyId, task, cabins, structures, maids }: TaskManagerModalProps) {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [customChecklist, setCustomChecklist] = useState<{ id: string; label: string; checked: boolean }[]>([]);
  const [localType, setLocalType] = useState<LocalType>('cabin');
  const [customLocationInput, setCustomLocationInput] = useState('');

  const [formData, setFormData] = useState<Partial<HousekeepingTask>>({
    type: 'turnover',
    status: 'pending',
    cabinId: '',
    structureId: '',
    unitId: '',
    assignedTo: [],
    observations: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (task) {
        const lt: LocalType = task.customLocation ? 'custom' : task.structureId ? 'structure' : 'cabin';
        setLocalType(lt);
        setCustomLocationInput(task.customLocation || '');
        setFormData({
          type: task.type,
          status: task.status,
          cabinId: task.cabinId || '',
          structureId: task.structureId || '',
          unitId: task.unitId || '',
          customLocation: task.customLocation || '',
          assignedTo: task.assignedTo || [],
          observations: task.observations || ''
        });
        setCustomChecklist(task.checklist || []);
      } else {
        setLocalType('cabin');
        setCustomLocationInput('');
        setFormData({
          type: 'turnover',
          status: 'pending',
          cabinId: Object.keys(cabins)[0] || '',
          structureId: '',
          unitId: '',
          customLocation: '',
          assignedTo: [],
          observations: ''
        });
        setCustomChecklist([]);
      }
    }
  }, [isOpen, task, cabins]);

  if (!isOpen) return null;

  const handleLocalTypeChange = (t: LocalType) => {
    setLocalType(t);
    if (t === 'cabin') {
      setFormData(prev => ({ ...prev, cabinId: Object.keys(cabins)[0] || '', structureId: '', unitId: '', customLocation: '' }));
    } else if (t === 'structure') {
      setFormData(prev => ({ ...prev, structureId: Object.keys(structures)[0] || '', cabinId: '', unitId: '', customLocation: '' }));
    } else {
      setFormData(prev => ({ ...prev, cabinId: '', structureId: '', unitId: '', customLocation: '' }));
      setCustomLocationInput('');
    }
  };

  const toggleMaid = (maidId: string) => {
    setFormData(prev => {
      const current = prev.assignedTo || [];
      return {
        ...prev,
        assignedTo: current.includes(maidId)
          ? current.filter(id => id !== maidId)
          : [...current, maidId]
      };
    });
  };

  const handleSave = async () => {
    if (localType === 'cabin' && !formData.cabinId) return toast.error("Selecione uma acomodação.");
    if (localType === 'structure' && !formData.structureId) return toast.error("Selecione uma estrutura.");
    if (localType === 'custom' && !customLocationInput.trim()) return toast.error("Informe o nome do local.");

    const payload: Partial<HousekeepingTask> = {
      ...formData,
      ...(localType === 'cabin' ? { structureId: undefined, customLocation: undefined } : {}),
      ...(localType === 'structure' ? { cabinId: undefined, customLocation: undefined } : {}),
      ...(localType === 'custom' ? { cabinId: undefined, structureId: undefined, customLocation: customLocationInput.trim() } : {}),
      checklist: formData.type === 'custom' ? customChecklist : (task?.checklist || []),
    };

    setLoading(true);
    try {
      if (task) {
        await HousekeepingService.updateTask(propertyId, task.id, payload, userData?.id || "admin", userData?.fullName || "Admin");
        toast.success("Tarefa atualizada com sucesso!");
      } else {
        await HousekeepingService.createTask(propertyId, { ...payload, checklist: formData.type === 'custom' ? customChecklist : [] }, userData?.id || "admin", userData?.fullName || "Admin");
        toast.success("Nova tarefa criada!");
      }
      onClose();
    } catch {
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
    } catch {
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

          {/* Seleção de local */}
          <div className="space-y-3">
            <div className="flex gap-2">
              {([
                { key: 'cabin', label: 'Cabana' },
                { key: 'structure', label: 'Estrutura' },
                { key: 'custom', label: 'Outro Local' },
              ] as { key: LocalType; label: string }[]).map(t => (
                <button
                  key={t.key}
                  disabled={isEditing}
                  onClick={() => handleLocalTypeChange(t.key)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors disabled:cursor-not-allowed",
                    localType === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {localType === 'cabin' && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Acomodação</label>
                <select
                  disabled={isEditing}
                  value={formData.cabinId}
                  onChange={e => setFormData({ ...formData, cabinId: e.target.value })}
                  className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none disabled:opacity-50"
                >
                  {Object.values(cabins).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {localType === 'structure' && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Estrutura</label>
                  <select
                    disabled={isEditing}
                    value={formData.structureId}
                    onChange={e => setFormData({ ...formData, structureId: e.target.value, unitId: '' })}
                    className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none disabled:opacity-50"
                  >
                    {Object.values(structures).map(s => <option key={s.id} value={s.id}>{s.name} ({s.category})</option>)}
                  </select>
                </div>
                {formData.structureId && structures[formData.structureId]?.units && structures[formData.structureId].units!.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Unidade (Opcional)</label>
                    <select
                      disabled={isEditing}
                      value={formData.unitId || ''}
                      onChange={e => setFormData({ ...formData, unitId: e.target.value })}
                      className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none disabled:opacity-50"
                    >
                      <option value="">Toda a Estrutura (Geral)</option>
                      {structures[formData.structureId].units!.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}

            {localType === 'custom' && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Nome do Local</label>
                <input
                  type="text"
                  disabled={isEditing}
                  placeholder="Ex: Recepção, Banheiro Social, Área da Piscina..."
                  value={customLocationInput}
                  onChange={e => setCustomLocationInput(e.target.value)}
                  className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-primary/50 disabled:opacity-50"
                />
              </div>
            )}
          </div>

          {/* Tipo de limpeza */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Tipo de Limpeza</label>
            <select
              value={formData.type}
              onChange={e => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none"
            >
              <option value="turnover">Faxina Completa (Troca)</option>
              <option value="daily">Arrumação Diária</option>
              <option value="custom">Limpeza Personalizada</option>
            </select>
          </div>

          {formData.type === 'custom' && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex justify-between items-center bg-secondary/20 p-4 border border-border rounded-2xl">
                <div>
                  <h4 className="text-sm font-bold text-foreground">Procedimentos da Limpeza Personalizada</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Defina os itens exatos que a camareira precisa checar para esta tarefa avulsa.</p>
                </div>
                <button type="button" onClick={() => setCustomChecklist(prev => [...prev, { id: crypto.randomUUID(), label: "", checked: false }])} className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-bold text-xs uppercase rounded-xl transition-all flex items-center gap-1.5 shrink-0">
                  <Plus size={16} /> Item
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {customChecklist.map(item => (
                  <div key={item.id} className="flex gap-2 items-center group">
                    <input required value={item.label} onChange={e => setCustomChecklist(prev => prev.map(i => i.id === item.id ? { ...i, label: e.target.value } : i))} className="flex-1 bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground ml-2" placeholder="Ex: Higienizar tapetes..." />
                    <button type="button" onClick={() => setCustomChecklist(prev => prev.filter(i => i.id !== item.id))} className="p-3 text-muted-foreground hover:bg-red-500 hover:border-red-500 hover:text-white border border-transparent rounded-xl transition-colors shrink-0 opacity-50 group-hover:opacity-100">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {customChecklist.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center italic py-2">Nenhum check opcional. Limpeza será geral e livre.</p>
                )}
              </div>
            </div>
          )}

          {isEditing && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Status / Progresso</label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full bg-orange-500/10 text-orange-600 border border-orange-500/30 p-3 rounded-xl font-bold text-sm outline-none"
              >
                <option value="pending">A Fazer (Pendente)</option>
                <option value="in_progress">Em Limpeza (Cronômetro Rodando)</option>
                <option value="waiting_conference">Aguardando Conferência</option>
                <option value="completed">Concluída (Liberada)</option>
              </select>
              <p className="text-[10px] text-muted-foreground">Altere o status para &quot;forçar&quot; a movimentação da tarefa no Kanban.</p>
            </div>
          )}

          <div className="space-y-3 pt-4 border-t border-border">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-2">
              <UserPlus size={14} /> Camareiras Atribuídas
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
              <MessageSquare size={14} /> Observações / Recados
            </label>
            <textarea
              value={formData.observations}
              onChange={e => setFormData({ ...formData, observations: e.target.value })}
              placeholder="Notas para a camareira ou observações deixadas por ela..."
              className="w-full bg-secondary border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-sm resize-none h-24 custom-scrollbar text-foreground"
            />
          </div>

        </div>

        <div className="p-6 border-t border-border bg-secondary/30 flex justify-between items-center shrink-0">
          {isEditing ? (
            <button onClick={handleDelete} className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors">
              <Trash2 size={20} />
            </button>
          ) : <div />}

          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-3 font-bold text-xs uppercase text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-3 bg-primary text-primary-foreground font-bold text-xs uppercase rounded-xl hover:opacity-90 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? "Salvando..." : <><Save size={16} /> Salvar Tarefa</>}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
