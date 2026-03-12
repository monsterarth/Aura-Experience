import React, { useState, useEffect } from "react";
import { X, Save, Plus, Trash2, CalendarClock, Hammer } from "lucide-react";
import { MaintenanceTask, Cabin, Structure, MaintenanceChecklistItem } from "@/types/aura";
import { MaintenanceService } from "@/services/maintenance-service";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImageUpload } from "@/components/admin/ImageUpload";

interface MaintenanceTaskManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    task: MaintenanceTask | null;
    cabins: Record<string, Cabin>;
    structures: Record<string, Structure>;
    technicians: any[];
    initialCabinId?: string;
    initialExpectedStart?: string;
    initialExpectedEnd?: string;
}

export function MaintenanceTaskManagerModal({ isOpen, onClose, propertyId, task, cabins, structures, technicians, initialCabinId, initialExpectedStart, initialExpectedEnd }: MaintenanceTaskManagerModalProps) {
    const { userData } = useAuth();
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState<Partial<MaintenanceTask>>({
        title: '',
        description: '',
        priority: 'medium',
        status: 'pending',
        cabinId: '',
        structureId: '',
        unitId: '',
        assignedTo: [],
        isRecurring: false,
        recurrenceRule: 'daily',
        blocksCabin: false,
        expectedStart: '',
        expectedEnd: '',
        imageUrl: ''
    });

    const [checklist, setChecklist] = useState<MaintenanceChecklistItem[]>([]);

    useEffect(() => {
        if (isOpen) {
            if (task) {
                setFormData({
                    title: task.title || '',
                    description: task.description || '',
                    priority: task.priority || 'medium',
                    status: task.status || 'pending',
                    cabinId: task.cabinId || '',
                    structureId: task.structureId || '',
                    unitId: task.unitId || '',
                    assignedTo: task.assignedTo || [],
                    isRecurring: task.isRecurring || false,
                    recurrenceRule: task.recurrenceRule || 'daily',
                    blocksCabin: task.blocksCabin || false,
                    expectedStart: task.expectedStart || '',
                    expectedEnd: task.expectedEnd || '',
                    imageUrl: task.imageUrl || ''
                });
                setChecklist(task.checklist || []);
            } else {
                setFormData({
                    title: '',
                    description: '',
                    priority: 'medium',
                    status: 'pending',
                    cabinId: initialCabinId || '',
                    structureId: '',
                    unitId: '',
                    assignedTo: [],
                    isRecurring: false,
                    recurrenceRule: 'daily',
                    blocksCabin: !!(initialExpectedStart && initialExpectedEnd),
                    expectedStart: initialExpectedStart || '',
                    expectedEnd: initialExpectedEnd || '',
                    imageUrl: ''
                });
                setChecklist([]);
            }
        }
    }, [isOpen, task]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title) return toast.error("Preencha o título da tarefa.");

        setLoading(true);
        try {
            const payload = {
                ...formData,
                checklist,
                expectedStart: formData.blocksCabin && formData.expectedStart ? new Date(formData.expectedStart).toISOString() : undefined,
                expectedEnd: formData.blocksCabin && formData.expectedEnd ? new Date(formData.expectedEnd).toISOString() : undefined,
            };

            if (task) {
                await MaintenanceService.updateTask(propertyId, task.id, payload, userData?.id || "admin", userData?.fullName || "Admin");
                toast.success("Tarefa de manutenção atualizada!");
            } else {
                await MaintenanceService.createTask(propertyId, payload, userData?.id || "admin", userData?.fullName || "Admin");
                toast.success("Nova tarefa criada com sucesso!");
            }
            onClose();
        } catch (error) {
            console.error(error);
            toast.error("Erro ao salvar tarefa.");
        } finally {
            setLoading(false);
        }
    };

    const handleAddChecklistItem = () => {
        setChecklist(prev => [...prev, { id: crypto.randomUUID(), label: "", checked: false, assignedTo: [] }]);
    };

    const isEditing = !!task;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-background w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-border flex justify-between items-center bg-card">
                    <div>
                        <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                            {isEditing ? 'Editar Ordem de Serviço' : 'Nova Ordem de Serviço'}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">Defina prioridade, local e cronograma.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                    <form id="maintenance-form" onSubmit={handleSubmit} className="space-y-6">

                        {/* INFORMAÇÕES BÁSICAS */}
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Título da Tarefa</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: Trocar resistência do chuveiro"
                                    className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-primary transition-all mt-1"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Descrição / Detalhes</label>
                                <textarea
                                    rows={2}
                                    placeholder="Instruções adicionais..."
                                    className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none focus:border-primary transition-all mt-1 resize-none"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1 block">Foto / Evidência (Opcional)</label>
                                <div className="h-32 bg-secondary border border-border rounded-xl overflow-hidden relative">
                                    <ImageUpload
                                        value={formData.imageUrl}
                                        onUploadSuccess={(url) => setFormData({ ...formData, imageUrl: url })}
                                    />
                                    {!formData.imageUrl && (
                                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-50">
                                            <span className="text-[10px] font-bold uppercase">Anexar foto do problema</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Prioridade</label>
                                    <select
                                        value={formData.priority}
                                        onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                                        className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none mt-1"
                                    >
                                        <option value="low">Baixa (Manutenção Preventiva)</option>
                                        <option value="medium">Média (Rotina)</option>
                                        <option value="high">Alta (Interfere na Estadia)</option>
                                        <option value="urgent">Urgente (Bloqueante / Risco)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Responsável Principal</label>
                                    <select
                                        value={formData.assignedTo?.[0] || ''}
                                        onChange={e => setFormData({ ...formData, assignedTo: e.target.value ? [e.target.value] : [] })}
                                        className="w-full bg-secondary border border-border p-3 rounded-xl text-sm outline-none mt-1"
                                    >
                                        <option value="">(Em aberto)</option>
                                        {technicians.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* LOCALIZAÇÃO (Cabana vs Estrutura) */}
                        <div className="p-4 bg-muted/30 border border-border rounded-2xl space-y-4">
                            <h3 className="text-sm font-bold flex items-center gap-2"><Hammer size={16} className="text-primary" /> Definir Localização</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Cabana Afetada</label>
                                    <select
                                        value={formData.cabinId || ''}
                                        onChange={e => setFormData({ ...formData, cabinId: e.target.value, structureId: '', unitId: '' })}
                                        className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary mt-1"
                                    >
                                        <option value="">Não é uma cabana</option>
                                        {Object.values(cabins).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Ou Estrutura Afetada</label>
                                    <select
                                        value={formData.structureId || ''}
                                        onChange={e => setFormData({ ...formData, structureId: e.target.value, cabinId: '', unitId: '' })}
                                        className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary mt-1"
                                    >
                                        <option value="">Não é uma estrutura</option>
                                        {Object.values(structures).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {!!formData.structureId && structures[formData.structureId]?.units && structures[formData.structureId].units!.length > 0 && (
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Qual Unidade?</label>
                                    <select
                                        value={formData.unitId || ''}
                                        onChange={e => setFormData({ ...formData, unitId: e.target.value })}
                                        className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary mt-1"
                                    >
                                        <option value="">Toda a Estrutura</option>
                                        {structures[formData.structureId].units!.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* BLOCK SETTINGS */}
                            {(formData.cabinId || formData.structureId) && (
                                <div className="mt-4 pt-4 border-t border-border/50">
                                    <label className="flex items-center gap-2 cursor-pointer w-max mb-3">
                                        <input
                                            type="checkbox"
                                            checked={formData.blocksCabin}
                                            onChange={e => setFormData({ ...formData, blocksCabin: e.target.checked })}
                                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                                        />
                                        <span className="text-sm font-bold text-foreground">Interdita a Acomodação/Estrutura?</span>
                                    </label>

                                    {formData.blocksCabin && (
                                        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest hidden md:block">Início Previsto</label>
                                                <input
                                                    type="datetime-local"
                                                    required={formData.blocksCabin}
                                                    value={formData.expectedStart ? formData.expectedStart.slice(0, 16) : ''}
                                                    onChange={e => setFormData({ ...formData, expectedStart: e.target.value })}
                                                    className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary mt-1"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest hidden md:block">Fim Previsto</label>
                                                <input
                                                    type="datetime-local"
                                                    required={formData.blocksCabin}
                                                    value={formData.expectedEnd ? formData.expectedEnd.slice(0, 16) : ''}
                                                    min={formData.expectedStart ? formData.expectedStart.slice(0, 16) : ''}
                                                    onChange={e => setFormData({ ...formData, expectedEnd: e.target.value })}
                                                    className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary mt-1"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* SUBTAREFAS / CHECKLIST */}
                        <div className="space-y-4 pt-4 border-t border-border">
                            <div className="flex justify-between items-center bg-secondary/20 p-4 border border-border rounded-2xl">
                                <div>
                                    <h4 className="text-sm font-bold text-foreground">Checklist & Subtarefas</h4>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Defina as etapas para essa manutenção. Você pode designar etapas para pessoas específicas.</p>
                                </div>
                                <button type="button" onClick={handleAddChecklistItem} className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-bold text-xs uppercase rounded-xl transition-all flex items-center gap-1.5 shrink-0">
                                    <Plus size={16} /> Subtarefa
                                </button>
                            </div>

                            <div className="space-y-2">
                                {checklist.map(item => (
                                    <div key={item.id} className="flex gap-2 items-center group bg-secondary/30 p-2 rounded-xl border border-transparent hover:border-border transition-all">
                                        <input
                                            required
                                            value={item.label}
                                            onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, label: e.target.value } : i))}
                                            className="flex-1 bg-background border border-border p-2 rounded-lg text-sm outline-none focus:border-primary text-foreground"
                                            placeholder="Nome da etapa..."
                                        />
                                        <select
                                            value={item.assignedTo?.[0] || ''}
                                            onChange={e => setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, assignedTo: e.target.value ? [e.target.value] : [] } : i))}
                                            className="w-48 bg-background border border-border p-2 rounded-lg text-sm outline-none text-muted-foreground"
                                        >
                                            <option value="">Quem fará isso?</option>
                                            {technicians.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                                        </select>
                                        <button type="button" onClick={() => setChecklist(prev => prev.filter(i => i.id !== item.id))} className="p-2 text-muted-foreground hover:bg-red-500 hover:text-white rounded-lg transition-colors shrink-0">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* RECORRÊNCIA */}
                        <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl flex items-center gap-4">
                            <div className="h-10 w-10 bg-indigo-500/10 text-indigo-500 rounded-xl flex items-center justify-center shrink-0">
                                <CalendarClock size={20} />
                            </div>
                            <div className="flex-1 text-sm">
                                <h4 className="font-bold text-foreground">Tarefa Recorrente?</h4>
                                <p className="text-muted-foreground text-[10px]">O sistema criará automaticamente amanhã ou na próxima semana.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={formData.isRecurring} onChange={e => setFormData({ ...formData, isRecurring: e.target.checked })} />
                                    <div className="w-11 h-6 bg-secondary border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                                </label>
                                {formData.isRecurring && (
                                    <select
                                        value={formData.recurrenceRule}
                                        onChange={e => setFormData({ ...formData, recurrenceRule: e.target.value })}
                                        className="bg-background border border-border p-2 rounded-lg text-xs outline-none focus:border-indigo-500"
                                    >
                                        <option value="daily">Diária</option>
                                        <option value="weekly">Semanal</option>
                                        <option value="monthly">Mensal</option>
                                    </select>
                                )}
                            </div>
                        </div>

                    </form>
                </div>

                <div className="p-6 border-t border-border flex justify-end gap-3 bg-card/50">
                    <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-xs text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
                    <button type="submit" form="maintenance-form" disabled={loading} className="px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-xs border border-blue-500 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50">
                        {loading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div> : <Save size={16} />}
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}
