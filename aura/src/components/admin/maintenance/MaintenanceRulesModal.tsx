"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Edit3, Trash2, RefreshCw, ToggleLeft, ToggleRight, Wrench } from "lucide-react";
import { MaintenanceRule, MaintenanceChecklistItem, Cabin, Structure, Staff } from "@/types/aura";
import { MaintenanceService } from "@/services/maintenance-service";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    cabins: Record<string, Cabin>;
    structures: Record<string, Structure>;
    technicians: Staff[];
}

type LocalType = 'cabin' | 'structure' | 'custom';

const PRIORITY_OPTIONS: { value: MaintenanceRule['priority']; label: string; colorClass: string }[] = [
    { value: 'low',    label: 'Baixa',   colorClass: 'border-blue-500/30 text-blue-500 bg-blue-500/10' },
    { value: 'medium', label: 'Média',   colorClass: 'border-yellow-500/30 text-yellow-600 bg-yellow-500/10' },
    { value: 'high',   label: 'Alta',    colorClass: 'border-orange-500/30 text-orange-500 bg-orange-500/10' },
    { value: 'urgent', label: 'Urgente', colorClass: 'border-red-500/30 text-red-500 bg-red-500/10' },
];

const UNIT_OPTIONS: { value: MaintenanceRule['intervalUnit']; label: string }[] = [
    { value: 'days',   label: 'dia(s)' },
    { value: 'weeks',  label: 'semana(s)' },
    { value: 'months', label: 'mês(es)' },
];

const BLANK_RULE: Partial<MaintenanceRule> = {
    name: '',
    description: '',
    trigger: 'fixed_interval',
    interval: 7,
    intervalUnit: 'days',
    priority: 'medium',
    checklist: [],
    assignedTo: [],
    active: true,
};

export function MaintenanceRulesModal({ isOpen, onClose, propertyId, cabins, structures, technicians }: Props) {
    const { userData } = useAuth();

    const [rules, setRules] = useState<MaintenanceRule[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [editingRule, setEditingRule] = useState<Partial<MaintenanceRule> | null>(null);
    const [localType, setLocalType] = useState<LocalType>('custom');
    const [newChecklistLabel, setNewChecklistLabel] = useState('');

    const loadRules = async () => {
        setLoading(true);
        try {
            const data = await MaintenanceService.getRules(propertyId);
            setRules(data);
        } catch {
            toast.error("Erro ao carregar regras.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) loadRules();
    }, [isOpen, propertyId]);

    const openNew = () => {
        setEditingRule({ ...BLANK_RULE });
        setLocalType('custom');
        setNewChecklistLabel('');
    };

    const openEdit = (rule: MaintenanceRule) => {
        setEditingRule({ ...rule });
        if (rule.cabinId) setLocalType('cabin');
        else if (rule.structureId) setLocalType('structure');
        else setLocalType('custom');
        setNewChecklistLabel('');
    };

    const closeForm = () => {
        setEditingRule(null);
        setNewChecklistLabel('');
    };

    const handleSave = async () => {
        if (!editingRule?.name?.trim()) {
            toast.error("Dê um nome à regra.");
            return;
        }
        if (!editingRule.interval || editingRule.interval < 1) {
            toast.error("O intervalo deve ser de no mínimo 1.");
            return;
        }
        if (localType === 'cabin' && !editingRule.cabinId) {
            toast.error("Selecione uma cabana.");
            return;
        }
        if (localType === 'structure' && !editingRule.structureId) {
            toast.error("Selecione uma estrutura.");
            return;
        }
        if (localType === 'custom' && !editingRule.customLocation?.trim()) {
            toast.error("Informe o local.");
            return;
        }

        const payload: Partial<MaintenanceRule> = {
            ...editingRule,
            cabinId:        localType === 'cabin'     ? editingRule.cabinId     : undefined,
            structureId:    localType === 'structure' ? editingRule.structureId : undefined,
            unitId:         localType === 'structure' ? editingRule.unitId      : undefined,
            customLocation: localType === 'custom'    ? editingRule.customLocation?.trim() : undefined,
        };

        setSaving(true);
        try {
            await MaintenanceService.saveRule(propertyId, payload, userData?.id || 'unknown', userData?.fullName || 'Admin');
            toast.success("Regra salva com sucesso.");
            closeForm();
            await loadRules();
        } catch {
            toast.error("Erro ao salvar regra.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (rule: MaintenanceRule) => {
        if (!confirm(`Excluir a regra "${rule.name}"?`)) return;
        try {
            await MaintenanceService.deleteRule(propertyId, rule.id, userData?.id || 'unknown', userData?.fullName || 'Admin');
            toast.success("Regra excluída.");
            await loadRules();
        } catch {
            toast.error("Erro ao excluir regra.");
        }
    };

    const handleToggle = async (rule: MaintenanceRule) => {
        try {
            await MaintenanceService.toggleRule(propertyId, rule.id, !rule.active, userData?.id || 'unknown', userData?.fullName || 'Admin');
            await loadRules();
        } catch {
            toast.error("Erro ao alterar status da regra.");
        }
    };

    const addChecklistItem = () => {
        if (!newChecklistLabel.trim()) return;
        const item: MaintenanceChecklistItem = { id: uuidv4(), label: newChecklistLabel.trim(), checked: false };
        setEditingRule(prev => ({ ...prev, checklist: [...(prev?.checklist || []), item] }));
        setNewChecklistLabel('');
    };

    const removeChecklistItem = (id: string) => {
        setEditingRule(prev => ({ ...prev, checklist: (prev?.checklist || []).filter(c => c.id !== id) }));
    };

    const toggleTechnician = (techId: string) => {
        setEditingRule(prev => {
            const current = prev?.assignedTo || [];
            const updated = current.includes(techId) ? current.filter(id => id !== techId) : [...current, techId];
            return { ...prev, assignedTo: updated };
        });
    };

    const locationLabel = (rule: MaintenanceRule) => {
        if (rule.cabinId) return cabins[rule.cabinId]?.name || 'Cabana';
        if (rule.structureId) {
            const s = structures[rule.structureId];
            const unit = rule.unitId ? s?.units?.find(u => u.id === rule.unitId) : null;
            return unit ? `${s?.name} — ${unit.name}` : (s?.name || 'Estrutura');
        }
        return rule.customLocation || '—';
    };

    const intervalLabel = (rule: MaintenanceRule) => {
        const unit = UNIT_OPTIONS.find(u => u.value === rule.intervalUnit)?.label || rule.intervalUnit;
        return `A cada ${rule.interval} ${unit}`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div className="bg-card border border-border w-full max-w-2xl rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <header className="p-6 border-b border-border flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-black uppercase text-foreground tracking-tighter flex items-center gap-2">
                            <RefreshCw size={20} className="text-primary" /> Automação de Manutenção
                        </h2>
                        <p className="text-xs text-muted-foreground font-medium mt-1">
                            Defina regras para gerar tarefas recorrentes automaticamente.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-secondary text-muted-foreground hover:text-foreground rounded-full hover:bg-white/5 transition-colors">
                        <X size={20} />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Rules list */}
                    {!editingRule && (
                        <div className="p-6 space-y-4">
                            <button
                                onClick={openNew}
                                className="w-full py-3 border-2 border-dashed border-border rounded-2xl text-xs font-black uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus size={16} /> Nova Regra
                            </button>

                            {loading && (
                                <div className="flex justify-center py-8">
                                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}

                            {!loading && rules.length === 0 && (
                                <div className="text-center py-10 text-muted-foreground">
                                    <Wrench size={36} className="mx-auto mb-3 opacity-20" />
                                    <p className="text-xs font-bold uppercase tracking-widest">Nenhuma regra configurada</p>
                                    <p className="text-xs mt-1 opacity-60">Crie regras para automatizar manutenções periódicas.</p>
                                </div>
                            )}

                            {rules.map(rule => {
                                const priorityOpt = PRIORITY_OPTIONS.find(p => p.value === rule.priority);
                                return (
                                    <div key={rule.id} className={cn("bg-secondary/30 border border-border rounded-2xl p-4 flex items-center gap-4", !rule.active && "opacity-50")}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-bold text-sm text-foreground truncate">{rule.name}</p>
                                                <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0", priorityOpt?.colorClass)}>
                                                    {priorityOpt?.label}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground font-medium">
                                                {intervalLabel(rule)} · {locationLabel(rule)}
                                            </p>
                                            {rule.checklist.length > 0 && (
                                                <p className="text-[10px] text-muted-foreground mt-0.5">{rule.checklist.length} item(s) no checklist</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => handleToggle(rule)}
                                                className={cn("transition-colors", rule.active ? "text-primary hover:text-primary/70" : "text-muted-foreground hover:text-foreground")}
                                                title={rule.active ? "Desativar" : "Ativar"}
                                            >
                                                {rule.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                            </button>
                                            <button
                                                onClick={() => openEdit(rule)}
                                                className="p-1.5 bg-secondary text-muted-foreground hover:text-primary rounded-lg transition-colors"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(rule)}
                                                className="p-1.5 bg-secondary text-muted-foreground hover:text-red-500 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Rule form */}
                    {editingRule && (
                        <div className="p-6 space-y-6">
                            {/* Name */}
                            <div>
                                <label className="field-label">Nome da Regra</label>
                                <input
                                    type="text"
                                    placeholder="Ex.: Limpeza do Filtro da Piscina"
                                    value={editingRule.name || ''}
                                    onChange={e => setEditingRule(prev => ({ ...prev, name: e.target.value }))}
                                    className="field-input"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="field-label">Descrição da Tarefa (opcional)</label>
                                <textarea
                                    placeholder="Detalhe o que deve ser feito..."
                                    value={editingRule.description || ''}
                                    onChange={e => setEditingRule(prev => ({ ...prev, description: e.target.value }))}
                                    rows={2}
                                    className="field-input resize-none"
                                />
                            </div>

                            {/* Interval */}
                            <div>
                                <label className="field-label">Frequência</label>
                                <div className="flex gap-3 items-center">
                                    <span className="text-sm text-muted-foreground font-medium shrink-0">A cada</span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={editingRule.interval || 7}
                                        onChange={e => setEditingRule(prev => ({ ...prev, interval: Math.max(1, parseInt(e.target.value) || 1) }))}
                                        className="field-input w-24 text-center"
                                    />
                                    <select
                                        value={editingRule.intervalUnit || 'days'}
                                        onChange={e => setEditingRule(prev => ({ ...prev, intervalUnit: e.target.value as MaintenanceRule['intervalUnit'] }))}
                                        className="field-input flex-1"
                                    >
                                        {UNIT_OPTIONS.map(u => (
                                            <option key={u.value} value={u.value}>{u.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Location */}
                            <div>
                                <label className="field-label">Local</label>
                                <div className="flex gap-2 mb-3">
                                    {(['cabin', 'structure', 'custom'] as LocalType[]).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setLocalType(type)}
                                            className={cn(
                                                "flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border",
                                                localType === type
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                                            )}
                                        >
                                            {type === 'cabin' ? 'Cabana' : type === 'structure' ? 'Estrutura' : 'Outro Local'}
                                        </button>
                                    ))}
                                </div>

                                {localType === 'cabin' && (
                                    <select
                                        value={editingRule.cabinId || ''}
                                        onChange={e => setEditingRule(prev => ({ ...prev, cabinId: e.target.value, structureId: undefined, unitId: undefined, customLocation: undefined }))}
                                        className="field-input"
                                    >
                                        <option value="" disabled>Selecione uma cabana...</option>
                                        {Object.values(cabins).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                )}

                                {localType === 'structure' && (
                                    <div className="space-y-2">
                                        <select
                                            value={editingRule.structureId || ''}
                                            onChange={e => setEditingRule(prev => ({ ...prev, structureId: e.target.value, unitId: undefined, cabinId: undefined, customLocation: undefined }))}
                                            className="field-input"
                                        >
                                            <option value="" disabled>Selecione uma estrutura...</option>
                                            {Object.values(structures).map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                        {editingRule.structureId && (structures[editingRule.structureId]?.units?.length ?? 0) > 0 && (
                                            <select
                                                value={editingRule.unitId || ''}
                                                onChange={e => setEditingRule(prev => ({ ...prev, unitId: e.target.value || undefined }))}
                                                className="field-input"
                                            >
                                                <option value="">Estrutura inteira (sem unidade específica)</option>
                                                {structures[editingRule.structureId].units!.map(u => (
                                                    <option key={u.id} value={u.id}>{u.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                )}

                                {localType === 'custom' && (
                                    <input
                                        type="text"
                                        placeholder="Ex.: Piscina principal, Gerador, Área de lazer..."
                                        value={editingRule.customLocation || ''}
                                        onChange={e => setEditingRule(prev => ({ ...prev, customLocation: e.target.value, cabinId: undefined, structureId: undefined, unitId: undefined }))}
                                        className="field-input"
                                    />
                                )}
                            </div>

                            {/* Priority */}
                            <div>
                                <label className="field-label">Prioridade</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {PRIORITY_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setEditingRule(prev => ({ ...prev, priority: opt.value }))}
                                            className={cn(
                                                "py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors",
                                                editingRule.priority === opt.value
                                                    ? opt.colorClass
                                                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                                            )}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Checklist */}
                            <div>
                                <label className="field-label">Checklist (opcional)</label>
                                <div className="space-y-2 mb-3">
                                    {(editingRule.checklist || []).map(item => (
                                        <div key={item.id} className="flex items-center gap-2 bg-secondary/50 px-3 py-2 rounded-xl border border-border">
                                            <span className="flex-1 text-sm text-foreground">{item.label}</span>
                                            <button onClick={() => removeChecklistItem(item.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Adicionar item..."
                                        value={newChecklistLabel}
                                        onChange={e => setNewChecklistLabel(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                                        className="field-input flex-1"
                                    />
                                    <button
                                        onClick={addChecklistItem}
                                        className="px-4 py-2 bg-secondary border border-border text-muted-foreground hover:text-primary rounded-xl text-xs font-bold uppercase transition-colors"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Assigned technicians */}
                            {technicians.length > 0 && (
                                <div>
                                    <label className="field-label">Técnicos Padrão (opcional)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {technicians.map(tech => {
                                            const isSelected = (editingRule.assignedTo || []).includes(tech.id);
                                            return (
                                                <button
                                                    key={tech.id}
                                                    onClick={() => toggleTechnician(tech.id)}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border",
                                                        isSelected
                                                            ? "bg-primary text-primary-foreground border-primary"
                                                            : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                                                    )}
                                                >
                                                    {tech.fullName.split(' ')[0]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {editingRule && (
                    <footer className="p-6 border-t border-border flex gap-3 shrink-0">
                        <button
                            onClick={closeForm}
                            className="flex-1 py-3 bg-secondary text-foreground font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-accent transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 py-3 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {saving ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : null}
                            Salvar Regra
                        </button>
                    </footer>
                )}

                {!editingRule && (
                    <footer className="p-6 border-t border-border shrink-0 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Aura Engine • Automação de Manutenção</p>
                    </footer>
                )}
            </div>
        </div>
    );
}
