"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Edit3, Trash2, Zap, LogOut, Sun, Clock, RefreshCw, AlertTriangle, LogIn } from "lucide-react";
import { HousekeepingRule, HousekeepingRuleTrigger, Cabin, Staff, Structure } from "@/types/aura";
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

const TRIGGER_OPTIONS: { value: HousekeepingRuleTrigger; label: string; description: string; icon: React.ReactNode; hasInterval: boolean; hasLocation: boolean; fixedTaskType?: HousekeepingRule['taskType'] }[] = [
  {
    value: 'on_checkout',
    label: 'Checkout',
    description: 'Quando qualquer cabana fizer checkout',
    icon: <LogOut size={14} />,
    hasInterval: false,
    hasLocation: false,
  },
  {
    value: 'on_checkin_day',
    label: 'Dia de Check-in',
    description: 'Cabanas com check-in previsto para hoje — inspeção antes da entrada do hóspede',
    icon: <LogIn size={14} />,
    hasInterval: false,
    hasLocation: false,
  },
  {
    value: 'active_stay_daily',
    label: 'Estadia Ativa (Diário)',
    description: 'Todo dia para cabanas com hóspede ativo',
    icon: <Sun size={14} />,
    hasInterval: false,
    hasLocation: false,
    // sem fixedTaskType — normalmente 'daily', mas admin pode escolher outro tipo
  },
  {
    value: 'stay_duration_days',
    label: 'Duração de Estadia',
    description: 'Após X dias de estadia contínua (ex: troca de roupa a cada 3 dias)',
    icon: <Clock size={14} />,
    hasInterval: true,
    hasLocation: false,
  },
  {
    value: 'fixed_interval_days',
    label: 'Intervalo Fixo',
    description: 'A cada X dias, em um local específico',
    icon: <RefreshCw size={14} />,
    hasInterval: true,
    hasLocation: true,
  },
];

const TASK_TYPE_OPTIONS: { value: HousekeepingRule['taskType']; label: string }[] = [
  { value: 'turnover',     label: 'Faxina de Troca' },
  { value: 'inspection',   label: 'Conferência' },
  { value: 'daily',        label: 'Arrumação' },
  { value: 'linen_change', label: 'Arr. com Troca de Roupa' },
  { value: 'custom',       label: 'Personalizada' },
];

function defaultTaskTypeForTrigger(trigger: HousekeepingRuleTrigger): HousekeepingRule['taskType'] {
  switch (trigger) {
    case 'on_checkout':        return 'turnover';
    case 'on_checkin_day':     return 'inspection';
    case 'active_stay_daily':  return 'daily';
    case 'stay_duration_days': return 'linen_change';
    case 'fixed_interval_days': return 'custom';
  }
}

function emptyForm(): Partial<HousekeepingRule> {
  return {
    trigger: 'on_checkout',
    taskType: 'turnover',
    intervalDays: 3,
    checklist: [],
    assignedTo: [],
    observations: '',
    active: true,
  };
}

function triggerIconColor(trigger: HousekeepingRuleTrigger) {
  switch (trigger) {
    case 'on_checkout':        return 'text-orange-400';
    case 'on_checkin_day':     return 'text-green-400';
    case 'active_stay_daily':  return 'text-blue-400';
    case 'stay_duration_days': return 'text-purple-400';
    case 'fixed_interval_days': return 'text-teal-400';
  }
}

function ruleDescription(rule: HousekeepingRule, cabins: Record<string, Cabin>, structures: Record<string, Structure>): string {
  const taskLabel = TASK_TYPE_OPTIONS.find(t => t.value === rule.taskType)?.label || rule.taskType;
  switch (rule.trigger) {
    case 'on_checkout':    return `Checkout → ${taskLabel}`;
    case 'on_checkin_day': return `Dia de check-in → ${taskLabel}`;
    case 'active_stay_daily': return `Estadia ativa → ${taskLabel} todo dia`;
    case 'stay_duration_days': return `Após ${rule.intervalDays} dia(s) de estadia → ${taskLabel}`;
    case 'fixed_interval_days': {
      const loc = rule.customLocation
        || (rule.structureId ? structures[rule.structureId]?.name : null)
        || (rule.cabinId ? cabins[rule.cabinId]?.name : null)
        || '—';
      return `A cada ${rule.intervalDays} dia(s) · ${loc} → ${taskLabel}`;
    }
  }
}

export function HousekeepingRulesModal({ isOpen, onClose, propertyId, cabins, structures, maids }: Props) {
  const { userData } = useAuth();
  const [rules, setRules] = useState<HousekeepingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<HousekeepingRule | null>(null);
  const [formData, setFormData] = useState<Partial<HousekeepingRule>>(emptyForm());
  const [localType, setLocalType] = useState<LocalType>('cabin');
  const [customLocationInput, setCustomLocationInput] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    loadRules();
  }, [isOpen]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await HousekeepingService.getRules(propertyId);
      setRules(data);
    } catch {
      toast.error("Erro ao carregar regras.");
    } finally {
      setLoading(false);
    }
  };

  const currentTriggerDef = TRIGGER_OPTIONS.find(t => t.value === formData.trigger);

  const openNewForm = () => {
    setEditingRule(null);
    setFormData({ ...emptyForm(), cabinId: Object.keys(cabins)[0] || '' });
    setLocalType('cabin');
    setCustomLocationInput('');
    setNewChecklistItem('');
    setShowForm(true);
  };

  const openEditForm = (rule: HousekeepingRule) => {
    setEditingRule(rule);
    const lt: LocalType = rule.customLocation ? 'custom' : rule.structureId ? 'structure' : 'cabin';
    setLocalType(lt);
    setCustomLocationInput(rule.customLocation || '');
    setFormData({ ...rule });
    setNewChecklistItem('');
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingRule(null);
    setFormData(emptyForm());
    setCustomLocationInput('');
  };

  const handleTriggerChange = (trigger: HousekeepingRuleTrigger) => {
    const def = TRIGGER_OPTIONS.find(t => t.value === trigger)!;
    setFormData(prev => ({
      ...prev,
      trigger,
      taskType: def.fixedTaskType || defaultTaskTypeForTrigger(trigger),
      intervalDays: def.hasInterval ? (prev.intervalDays || 3) : undefined,
    }));
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
          : [...current, maidId],
      };
    });
  };

  const addChecklistItem = () => {
    const label = newChecklistItem.trim();
    if (!label) return;
    setFormData(prev => ({
      ...prev,
      checklist: [...(prev.checklist || []), { id: crypto.randomUUID(), label, checked: false }],
    }));
    setNewChecklistItem('');
  };

  const removeChecklistItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      checklist: (prev.checklist || []).filter(i => i.id !== id),
    }));
  };

  const handleSave = async () => {
    if (!formData.trigger) return toast.error("Selecione um gatilho.");
    if (currentTriggerDef?.hasInterval && (!formData.intervalDays || formData.intervalDays < 1)) {
      return toast.error("Intervalo deve ser de pelo menos 1 dia.");
    }
    if (currentTriggerDef?.hasLocation) {
      if (localType === 'cabin' && !formData.cabinId) return toast.error("Selecione uma cabana.");
      if (localType === 'structure' && !formData.structureId) return toast.error("Selecione uma estrutura.");
      if (localType === 'custom' && !customLocationInput.trim()) return toast.error("Informe o nome do local.");
    }

    setSaving(true);
    try {
      const payload: Partial<HousekeepingRule> = {
        ...formData,
        ...(currentTriggerDef?.hasLocation && localType === 'cabin' ? { structureId: undefined, customLocation: undefined } : {}),
        ...(currentTriggerDef?.hasLocation && localType === 'structure' ? { cabinId: undefined, customLocation: undefined } : {}),
        ...(currentTriggerDef?.hasLocation && localType === 'custom' ? { cabinId: undefined, structureId: undefined, customLocation: customLocationInput.trim() } : {}),
        ...(!currentTriggerDef?.hasLocation ? { cabinId: undefined, structureId: undefined, customLocation: undefined } : {}),
      };
      await HousekeepingService.saveRule(propertyId, payload, userData?.id || "admin", userData?.fullName || "Admin");
      toast.success(editingRule ? "Regra atualizada!" : "Regra criada!");
      cancelForm();
      loadRules();
    } catch {
      toast.error("Erro ao salvar regra.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: HousekeepingRule) => {
    if (!confirm(`Excluir esta regra de automação?`)) return;
    try {
      await HousekeepingService.deleteRule(propertyId, rule.id, userData?.id || "admin", userData?.fullName || "Admin");
      toast.success("Regra excluída.");
      loadRules();
    } catch {
      toast.error("Erro ao excluir regra.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border w-full max-w-2xl rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

        <header className="p-6 border-b border-border flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-black uppercase text-foreground tracking-tighter flex items-center gap-2">
              <Zap size={20} className="text-primary" />
              Regras de Automação
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-1">
              Defina quando e como as tarefas de governança são geradas automaticamente.
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-secondary text-muted-foreground hover:text-foreground rounded-full hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-secondary/20">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {rules.length === 0 && !showForm && (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">Nenhuma regra configurada.</p>
                  <p className="text-xs mt-2 opacity-70">Sem regras ativas, nenhuma tarefa será gerada automaticamente.</p>
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2 text-left">
                    <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-300 font-medium">
                      Crie ao menos as regras <strong>Checkout → Turnover</strong> e <strong>Estadia Ativa → Arrumação</strong> para manter o comportamento padrão.
                    </p>
                  </div>
                </div>
              )}

              {rules.map(rule => {
                const def = TRIGGER_OPTIONS.find(t => t.value === rule.trigger);
                return (
                  <div key={rule.id} className="bg-card border border-border p-4 rounded-xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn("shrink-0", triggerIconColor(rule.trigger))}>
                        {def?.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-foreground truncate">
                          {ruleDescription(rule, cabins, structures)}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-0.5">
                          {def?.label}{' · '}
                          <span className={rule.active ? "text-green-400" : "text-red-400"}>
                            {rule.active ? "Ativa" : "Inativa"}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => openEditForm(rule)}
                        className="p-2 bg-secondary text-muted-foreground hover:text-primary rounded-lg transition-colors"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(rule)}
                        className="p-2 bg-secondary text-muted-foreground hover:text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {showForm && (
                <div className="bg-card border border-primary/30 p-5 rounded-2xl space-y-5">
                  <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    {editingRule ? <Edit3 size={14} /> : <Plus size={14} />}
                    {editingRule ? "Editar Regra" : "Nova Regra"}
                  </h3>

                  {/* Gatilho */}
                  <div className="space-y-2">
                    <p className="field-label">Quando acontecer</p>
                    <div className="grid grid-cols-2 gap-2">
                      {TRIGGER_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => handleTriggerChange(opt.value)}
                          className={cn(
                            "px-3 py-2.5 rounded-xl text-left transition-colors border",
                            formData.trigger === opt.value
                              ? "bg-primary/10 border-primary text-primary"
                              : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={formData.trigger === opt.value ? 'text-primary' : 'text-muted-foreground'}>
                              {opt.icon}
                            </span>
                            <span className="text-xs font-black uppercase tracking-wide">{opt.label}</span>
                          </div>
                          <p className="text-[10px] opacity-60 leading-tight">{opt.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Intervalo (condicional) */}
                  {currentTriggerDef?.hasInterval && (
                    <div className="space-y-2">
                      <p className="field-label">
                        {formData.trigger === 'stay_duration_days' ? 'Disparar após quantos dias de estadia' : 'Repetir a cada'}
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={formData.intervalDays || 1}
                          onChange={e => setFormData(prev => ({ ...prev, intervalDays: parseInt(e.target.value) || 1 }))}
                          className="field-input w-24 text-center"
                        />
                        <span className="text-sm text-muted-foreground font-bold">dias</span>
                      </div>
                    </div>
                  )}

                  {/* Local (só para fixed_interval_days) */}
                  {currentTriggerDef?.hasLocation && (
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
                  )}

                  {/* Tipo de tarefa (só quando não é fixo pelo gatilho) */}
                  {!currentTriggerDef?.fixedTaskType && (
                    <div className="space-y-2">
                      <p className="field-label">Tipo de Tarefa</p>
                      <select
                        value={formData.taskType || 'custom'}
                        onChange={e => setFormData(prev => ({ ...prev, taskType: e.target.value as any }))}
                        className="field-input"
                      >
                        {TASK_TYPE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

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
                      <button onClick={addChecklistItem} className="px-3 py-2 bg-secondary hover:bg-accent text-foreground rounded-xl transition-colors">
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
                      placeholder="Ex: Verificar frigobar antes de iniciar."
                    />
                  </div>

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
                      {saving ? "Salvando..." : editingRule ? "Atualizar" : "Criar Regra"}
                    </button>
                  </div>
                </div>
              )}

              {!showForm && (
                <button
                  onClick={openNewForm}
                  className="w-full py-3 border-2 border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-primary rounded-2xl text-xs font-bold uppercase transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={14} /> Nova Regra
                </button>
              )}
            </>
          )}
        </div>

        <footer className="p-6 border-t border-border shrink-0 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
            Aura Engine · Regras avaliadas no cron às 06:00 e em eventos de checkout
          </p>
        </footer>
      </div>
    </div>
  );
}
