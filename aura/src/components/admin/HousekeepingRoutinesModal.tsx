"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Edit3, Trash2, RefreshCw, Sparkles, Coffee, AlertCircle } from "lucide-react";
import { HousekeepingRoutine, Cabin, Staff, Structure } from "@/types/aura";
import { HousekeepingService } from "@/services/housekeeping-service";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  cabins: Record<string, Cabin>;
  structures: Record<string, Structure>;
  maids: Staff[];
}

type LocalType = 'cabin' | 'structure' | 'custom';

const emptyForm = (): Partial<HousekeepingRoutine> => ({
  type: 'custom',
  intervalDays: 7,
  checklist: [],
  assignedTo: [],
  observations: '',
  active: true,
});

export function HousekeepingRoutinesModal({ isOpen, onClose, propertyId, cabins, structures, maids }: Props) {
  const { userData } = useAuth();
  const [routines, setRoutines] = useState<HousekeepingRoutine[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingRoutine, setEditingRoutine] = useState<HousekeepingRoutine | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [localType, setLocalType] = useState<LocalType>('cabin');
  const [customLocationInput, setCustomLocationInput] = useState('');
  const [formData, setFormData] = useState<Partial<HousekeepingRoutine>>(emptyForm());
  const [newChecklistItem, setNewChecklistItem] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    loadRoutines();
  }, [isOpen]);

  const loadRoutines = async () => {
    setLoading(true);
    try {
      const data = await HousekeepingService.getRoutines(propertyId);
      setRoutines(data);
    } catch {
      toast.error("Erro ao carregar rotinas.");
    } finally {
      setLoading(false);
    }
  };

  const openNewForm = () => {
    setEditingRoutine(null);
    setLocalType('cabin');
    setFormData({ ...emptyForm(), cabinId: Object.keys(cabins)[0] || '' });
    setCustomLocationInput('');
    setNewChecklistItem('');
    setShowForm(true);
  };

  const openEditForm = (routine: HousekeepingRoutine) => {
    setEditingRoutine(routine);
    const lt: LocalType = routine.customLocation ? 'custom' : routine.structureId ? 'structure' : 'cabin';
    setLocalType(lt);
    setCustomLocationInput(routine.customLocation || '');
    setFormData({ ...routine });
    setNewChecklistItem('');
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingRoutine(null);
    setFormData(emptyForm());
    setCustomLocationInput('');
  };

  const handleLocalTypeChange = (t: LocalType) => {
    setLocalType(t);
    if (t === 'cabin') {
      setFormData(prev => ({ ...prev, cabinId: Object.keys(cabins)[0] || '', structureId: undefined, customLocation: undefined }));
    } else if (t === 'structure') {
      setFormData(prev => ({ ...prev, structureId: Object.keys(structures)[0] || '', cabinId: undefined, customLocation: undefined }));
    } else {
      setFormData(prev => ({ ...prev, cabinId: undefined, structureId: undefined, customLocation: '' }));
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

  const addChecklistItem = () => {
    const label = newChecklistItem.trim();
    if (!label) return;
    setFormData(prev => ({
      ...prev,
      checklist: [...(prev.checklist || []), { id: crypto.randomUUID(), label, checked: false }]
    }));
    setNewChecklistItem('');
  };

  const removeChecklistItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      checklist: (prev.checklist || []).filter(i => i.id !== id)
    }));
  };

  const handleSave = async () => {
    if (localType === 'cabin' && !formData.cabinId) return toast.error("Selecione uma cabana.");
    if (localType === 'structure' && !formData.structureId) return toast.error("Selecione uma estrutura.");
    if (localType === 'custom' && !customLocationInput.trim()) return toast.error("Informe o nome do local.");
    if (!formData.intervalDays || formData.intervalDays < 1) return toast.error("Intervalo deve ser de pelo menos 1 dia.");

    setSaving(true);
    try {
      const payload: Partial<HousekeepingRoutine> = {
        ...formData,
        ...(localType === 'cabin' ? { structureId: undefined, customLocation: undefined } : {}),
        ...(localType === 'structure' ? { cabinId: undefined, customLocation: undefined } : {}),
        ...(localType === 'custom' ? { cabinId: undefined, structureId: undefined, customLocation: customLocationInput.trim() } : {}),
      };
      await HousekeepingService.saveRoutine(propertyId, payload, userData?.id || "admin", userData?.fullName || "Admin");
      toast.success(editingRoutine ? "Rotina atualizada!" : "Rotina criada!");
      cancelForm();
      loadRoutines();
    } catch {
      toast.error("Erro ao salvar rotina.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (routine: HousekeepingRoutine) => {
    if (!confirm(`Excluir rotina "${localName(routine)}"?`)) return;
    try {
      await HousekeepingService.deleteRoutine(propertyId, routine.id, userData?.id || "admin", userData?.fullName || "Admin");
      toast.success("Rotina excluída.");
      loadRoutines();
    } catch {
      toast.error("Erro ao excluir rotina.");
    }
  };

  const localName = (r: HousekeepingRoutine) =>
    r.customLocation
      ? r.customLocation
      : r.structureId
        ? (structures[r.structureId]?.name || "Estrutura excluída")
        : (cabins[r.cabinId!]?.name || "Cabana excluída");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border w-full max-w-2xl rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <header className="p-6 border-b border-border flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-black uppercase text-foreground tracking-tighter flex items-center gap-2">
              <RefreshCw size={20} className="text-primary" />
              Rotinas de Limpeza
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-1">
              Tarefas geradas automaticamente em intervalos fixos.
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-secondary text-muted-foreground hover:text-foreground rounded-full hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-secondary/20">

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Lista de rotinas */}
              {routines.length === 0 && !showForm && (
                <div className="text-center py-10 text-muted-foreground">
                  <RefreshCw size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">Nenhuma rotina configurada.</p>
                </div>
              )}

              {routines.map(routine => (
                <div key={routine.id} className="bg-card border border-border p-4 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {routine.customLocation
                      ? <AlertCircle size={16} className="text-zinc-400 shrink-0" />
                      : routine.structureId
                        ? <Sparkles size={16} className="text-purple-500 shrink-0" />
                        : routine.type === 'daily'
                          ? <Coffee size={16} className="text-blue-500 shrink-0" />
                          : <AlertCircle size={16} className="text-orange-500 shrink-0" />
                    }
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">{localName(routine)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-0.5">
                        A cada {routine.intervalDays} dia{routine.intervalDays !== 1 ? 's' : ''}
                        {' · '}
                        {routine.type === 'daily' ? 'Arrumação' : 'Personalizada'}
                        {' · '}
                        {routine.lastTriggeredAt
                          ? `Última: ${new Date(routine.lastTriggeredAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
                          : 'Nunca disparada'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEditForm(routine)}
                      className="p-2 bg-secondary text-muted-foreground hover:text-primary rounded-lg transition-colors"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(routine)}
                      className="p-2 bg-secondary text-muted-foreground hover:text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Formulário inline */}
              {showForm && (
                <div className="bg-card border border-primary/30 p-5 rounded-2xl space-y-5">
                  <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    {editingRoutine ? <Edit3 size={14} /> : <Plus size={14} />}
                    {editingRoutine ? "Editar Rotina" : "Nova Rotina"}
                  </h3>

                  {/* Local */}
                  <div className="space-y-2">
                    <p className="field-label">Local</p>
                    <div className="flex gap-2 mb-3">
                      {([
                        { key: 'cabin', label: 'Cabana' },
                        { key: 'structure', label: 'Estrutura' },
                        { key: 'custom', label: 'Outro Local' },
                      ] as { key: LocalType; label: string }[]).map(t => (
                        <button
                          key={t.key}
                          onClick={() => handleLocalTypeChange(t.key)}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors",
                            localType === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {localType === 'cabin' && (
                      <select
                        value={formData.cabinId || ''}
                        onChange={e => setFormData(prev => ({ ...prev, cabinId: e.target.value }))}
                        className="field-input"
                      >
                        <option value="" disabled>Selecione uma cabana</option>
                        {Object.values(cabins).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                    {localType === 'structure' && (
                      <select
                        value={formData.structureId || ''}
                        onChange={e => setFormData(prev => ({ ...prev, structureId: e.target.value }))}
                        className="field-input"
                      >
                        <option value="" disabled>Selecione uma estrutura</option>
                        {Object.values(structures).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                    {localType === 'custom' && (
                      <input
                        type="text"
                        placeholder="Ex: Recepção, Banheiro Social, Área da Piscina..."
                        value={customLocationInput}
                        onChange={e => setCustomLocationInput(e.target.value)}
                        className="field-input"
                      />
                    )}
                  </div>

                  {/* Tipo + Intervalo */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="field-label">Tipo de Limpeza</p>
                      <select
                        value={formData.type || 'custom'}
                        onChange={e => setFormData(prev => ({ ...prev, type: e.target.value as 'daily' | 'custom' }))}
                        className="field-input"
                      >
                        <option value="daily">Arrumação Diária</option>
                        <option value="custom">Personalizada</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <p className="field-label">Repetir a cada</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={formData.intervalDays || 7}
                          onChange={e => setFormData(prev => ({ ...prev, intervalDays: parseInt(e.target.value) || 1 }))}
                          className="field-input w-20 text-center"
                        />
                        <span className="text-sm text-muted-foreground font-bold">dias</span>
                      </div>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="space-y-2">
                    <p className="field-label">Checklist (opcional)</p>
                    <div className="space-y-1.5">
                      {(formData.checklist || []).map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-secondary/50 px-3 py-2 rounded-lg">
                          <span className="text-xs font-medium text-foreground">{item.label}</span>
                          <button onClick={() => removeChecklistItem(item.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Adicionar item..."
                        value={newChecklistItem}
                        onChange={e => setNewChecklistItem(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
                        className="field-input flex-1 text-sm"
                      />
                      <button
                        onClick={addChecklistItem}
                        className="px-3 py-2 bg-secondary hover:bg-accent text-foreground rounded-xl transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Responsável padrão */}
                  {maids.length > 0 && (
                    <div className="space-y-2">
                      <p className="field-label">Responsável padrão (opcional)</p>
                      <div className="grid grid-cols-2 gap-2">
                        {maids.map(maid => {
                          const selected = (formData.assignedTo || []).includes(maid.id);
                          return (
                            <button
                              key={maid.id}
                              onClick={() => toggleMaid(maid.id)}
                              className={cn(
                                "px-3 py-2 rounded-xl text-xs font-bold uppercase text-left transition-colors border",
                                selected
                                  ? "bg-primary/10 border-primary text-primary"
                                  : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                              )}
                            >
                              {maid.fullName.split(' ')[0]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Observações */}
                  <div className="space-y-2">
                    <p className="field-label">Observações (opcional)</p>
                    <textarea
                      value={formData.observations || ''}
                      onChange={e => setFormData(prev => ({ ...prev, observations: e.target.value }))}
                      rows={2}
                      className="field-input resize-none text-sm"
                      placeholder="Ex: Verificar produtos de limpeza antes de iniciar."
                    />
                  </div>

                  {/* Botões do form */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={cancelForm}
                      className="flex-1 py-2.5 bg-secondary text-foreground text-xs font-bold uppercase rounded-xl hover:bg-accent transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground text-xs font-bold uppercase rounded-xl hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
                    >
                      {saving ? "Salvando..." : editingRoutine ? "Atualizar" : "Criar Rotina"}
                    </button>
                  </div>
                </div>
              )}

              {/* Botão Nova Rotina */}
              {!showForm && (
                <button
                  onClick={openNewForm}
                  className="w-full py-3 border-2 border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-primary rounded-2xl text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Nova Rotina
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="p-6 border-t border-border shrink-0 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
            Aura Engine · Tarefas geradas diariamente pelo cron às 06:00
          </p>
        </footer>
      </div>
    </div>
  );
}
