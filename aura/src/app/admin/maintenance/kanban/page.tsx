// src/app/admin/maintenance/kanban/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { MaintenanceService } from "@/services/maintenance-service";
import { CabinService } from "@/services/cabin-service";
import { StructureService } from "@/services/structure-service";
import { StaffService } from "@/services/staff-service";
import { MaintenanceTask, Cabin, Structure, Staff } from "@/types/aura";
import { MaintenanceTaskManagerModal } from "@/components/admin/maintenance/MaintenanceTaskManagerModal";
import { MaintenanceCompletionModal } from "@/components/admin/maintenance/MaintenanceCompletionModal";
import { MaintenanceRulesModal } from "@/components/admin/maintenance/MaintenanceRulesModal";
import {
    Hammer, AlertCircle, CheckCircle2, PlayCircle, Plus, Edit3, Archive,
    Calendar as CalendarIcon, X, Moon, ChevronLeft, RefreshCw, CheckSquare,
    Square, CheckCheck, Trash2, Loader2, History
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function MaintenanceKanbanPage() {
    const { currentProperty: property, loading: isLoading } = useProperty();
    const { userData } = useAuth();

    const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
    const [cabins, setCabins] = useState<Record<string, Cabin>>({});
    const [structures, setStructures] = useState<Record<string, Structure>>({});
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [loadingInitial, setLoadingInitial] = useState(true);

    const [isManagerOpen, setIsManagerOpen] = useState(false);
    const [isCompletionOpen, setIsCompletionOpen] = useState(false);
    const [isArchiveOpen, setIsArchiveOpen] = useState(false);
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);
    const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [batchLoading, setBatchLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'pending' | 'in_progress' | 'conference'>('pending');
    const [historyDays, setHistoryDays] = useState<30 | 90 | 180>(30);

    useEffect(() => {
        if (!property) return;

        let unsubscribe: () => void;

        const init = async () => {
            setLoadingInitial(true);
            try {
                const [cabinsData, structuresData] = await Promise.all([
                    CabinService.getCabinsByProperty(property.id),
                    StructureService.getStructures(property.id)
                ]);

                const cabinsDict: Record<string, Cabin> = {};
                cabinsData.forEach(c => cabinsDict[c.id] = c);
                setCabins(cabinsDict);

                const structuresDict: Record<string, Structure> = {};
                structuresData.forEach(s => structuresDict[s.id] = s);
                setStructures(structuresDict);

                const staffData = await StaffService.getStaffByProperty(property.id);
                const techs = staffData.filter((s: Staff) => (s.role === 'maintenance' || s.role === 'technician') && s.active);
                setTechnicians(techs);

                unsubscribe = MaintenanceService.listenToActiveTasks(property.id, (realtimeTasks) => {
                    setTasks(realtimeTasks);
                });

            } catch (error) {
                toast.error("Erro ao conectar base de manutenção.");
            } finally {
                setLoadingInitial(false);
            }
        };

        init();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [property]);

    if (isLoading || loadingInitial) {
        return <div className="flex h-[80vh] items-center justify-center w-full"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
    }

    if (!property) {
        return <div className="flex h-[80vh] items-center justify-center text-muted-foreground">Selecione uma propriedade no menu lateral.</div>;
    }

    if (userData?.role === 'technician') {
        window.location.href = '/maintenance';
        return null;
    }

    const isManager = ['admin', 'super_admin', 'maintenance', 'manager'].includes(userData?.role || '');

    // ── Handlers ───────────────────────────────────────────────────────────────

    const handleStartTask = async (taskId: string) => {
        try {
            await MaintenanceService.startTask(property.id, taskId, userData?.id || "unknown", userData?.fullName || "Técnico");
            toast.success("Manutenção iniciada! Cronômetro rodando.");
        } catch (e) {
            toast.error("Erro ao iniciar a tarefa.");
        }
    };

    const handleConferTask = async (taskId: string, approved: boolean) => {
        try {
            const actorId = userData?.id || "unknown";
            const actorName = userData?.fullName || "Coordenador";
            if (approved) {
                await MaintenanceService.confirmTaskQuality(property.id, taskId, "Aprovado", actorId, actorName);
            } else {
                await MaintenanceService.rollbackTaskStatus(property.id, taskId, "Reprovado na conferência", actorId, actorName);
            }
            toast.success(approved ? "Tarefa aprovada e concluída!" : "Tarefa enviada para retrabalho.");
        } catch (e) {
            toast.error("Erro ao conferir a tarefa.");
        }
    };

    const toggleSelect = (taskId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(taskId) ? next.delete(taskId) : next.add(taskId);
            return next;
        });
    };

    const clearSelection = () => setSelectedIds(new Set());

    const toggleSelectAll = (taskList: MaintenanceTask[]) => {
        const ids = taskList.map(t => t.id);
        const allSelected = ids.every(id => selectedIds.has(id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) ids.forEach(id => next.delete(id));
            else ids.forEach(id => next.add(id));
            return next;
        });
    };

    const handleBatchApprove = async () => {
        if (selectedIds.size === 0) return;
        setBatchLoading(true);
        try {
            const actorId = userData?.id || "unknown";
            const actorName = userData?.fullName || "Admin";
            await Promise.all(
                Array.from(selectedIds).map(id =>
                    MaintenanceService.confirmTaskQuality(property.id, id, "Liberado em lote", actorId, actorName)
                )
            );
            toast.success(`${selectedIds.size} tarefa(s) aprovada(s)!`);
            clearSelection();
        } catch {
            toast.error("Erro ao aprovar em lote.");
        } finally {
            setBatchLoading(false);
        }
    };

    const handleBatchCancel = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Cancelar ${selectedIds.size} tarefa(s) selecionada(s)?`)) return;
        setBatchLoading(true);
        try {
            const actorId = userData?.id || "unknown";
            const actorName = userData?.fullName || "Admin";
            await Promise.all(
                Array.from(selectedIds).map(id =>
                    MaintenanceService.updateTask(property.id, id, { status: 'cancelled' }, actorId, actorName)
                )
            );
            toast.success(`${selectedIds.size} tarefa(s) cancelada(s).`);
            clearSelection();
        } catch {
            toast.error("Erro ao cancelar em lote.");
        } finally {
            setBatchLoading(false);
        }
    };

    // ── Task groups ────────────────────────────────────────────────────────────

    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'paused');
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
    const waitingTasks = tasks.filter(t => t.status === 'waiting_conference');
    const completedTasks = tasks.filter(t => t.status === 'completed');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - historyDays);
    const historyTasks = completedTasks.filter(t => {
        const dateStr = t.finishedAt || t.updatedAt || t.createdAt;
        if (!dateStr) return false;
        return new Date(dateStr) >= cutoff;
    }).sort((a, b) => {
        const da = new Date(a.finishedAt || a.updatedAt || a.createdAt).getTime();
        const db = new Date(b.finishedAt || b.updatedAt || b.createdAt).getTime();
        return db - da;
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentCompletedTasks = completedTasks.filter(t => {
        const dateStr = t.finishedAt || t.updatedAt || t.createdAt;
        if (!dateStr) return false;
        return new Date(dateStr) >= sevenDaysAgo;
    });

    // ── KanbanCard (shared between desktop and mobile column views) ────────────

    const KanbanCard = ({ task }: { task: MaintenanceTask }) => {
        const isSelected = selectedIds.has(task.id);
        const techNames = (task.assignedTo || [])
            .map(id => technicians.find(t => t.id === id)?.fullName?.split(' ')[0])
            .filter(Boolean).join(', ') || 'Sem técnico';

        return (
            <div className={cn(
                "bg-card border p-4 rounded-xl shadow-sm space-y-4 transition-colors group relative",
                isSelected ? "border-primary ring-1 ring-primary/40" :
                    task.status === 'paused' ? "border-yellow-400 opacity-75" : "border-border hover:border-primary/50"
            )}>
                {task.status === 'paused' && (
                    <div className="flex items-center gap-2 bg-yellow-500/10 text-yellow-700 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase mb-2">
                        <Moon size={12} /> DND{task.pausedUntil && ` — retoma às ${new Date(task.pausedUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                )}

                {/* Action buttons */}
                <div className="absolute top-4 right-4 flex items-center gap-1">
                    {isManager && (
                        <button
                            onClick={() => { setSelectedTask(task); setIsManagerOpen(true); }}
                            className="p-1.5 bg-secondary text-muted-foreground hover:text-primary rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Edit3 size={14} />
                        </button>
                    )}
                    <button
                        onClick={() => toggleSelect(task.id)}
                        className={cn("p-1.5 rounded-lg transition-colors", isSelected ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary")}
                    >
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                </div>

                <div className="pr-20">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className={cn(
                            "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border leading-none pt-1 pb-0.5",
                            task.priority === 'urgent' ? 'border-red-500/30 text-red-500 bg-red-500/10' :
                                task.priority === 'high' ? 'border-orange-500/30 text-orange-500 bg-orange-500/10' :
                                    task.priority === 'medium' ? 'border-yellow-500/30 text-yellow-600 bg-yellow-500/10' :
                                        'border-blue-500/30 text-blue-500 bg-blue-500/10'
                        )}>
                            {task.priority === 'urgent' ? 'Urgente' : task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Média' : 'Baixa'}
                        </p>
                        {task.isRecurring && <span className="text-[10px] bg-indigo-500/10 text-indigo-500 px-2 rounded font-bold uppercase py-0.5">Recorrente</span>}
                        {task.recurrenceSourceId && !task.isRecurring && <span className="text-[10px] bg-teal-500/10 text-teal-500 px-2 rounded font-bold uppercase py-0.5 flex items-center gap-1"><RefreshCw size={9} /> Auto</span>}
                    </div>
                    <h4 className="font-bold text-lg text-foreground leading-tight mt-1">{task.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                </div>

                {task.imageUrl && (
                    <button
                        className="relative mt-2 h-20 w-full rounded-lg overflow-hidden border border-border cursor-pointer group/img block text-left"
                        onClick={(e) => { e.stopPropagation(); setEnlargedImage(task.imageUrl!); }}
                    >
                        <Image src={task.imageUrl} alt="Evidência" fill className="object-cover group-hover/img:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-white text-[10px] uppercase font-bold tracking-widest px-2 py-1 border border-white/20 rounded bg-black/40 backdrop-blur-sm">Ampliar</span>
                        </div>
                    </button>
                )}

                {task.cabinId && <p className="text-xs font-bold text-primary">📍 {cabins[task.cabinId]?.name || "Cabana"}</p>}
                {task.structureId && <p className="text-xs font-bold text-primary">📍 {structures[task.structureId]?.name || "Estrutura"}</p>}
                {task.customLocation && <p className="text-xs font-bold text-primary">📍 {task.customLocation}</p>}

                {/* Action footer */}
                <div className="space-y-2">
                    {task.status === 'pending' && (
                        <div className="pt-2 border-t border-border">
                            <button
                                onClick={() => handleStartTask(task.id)}
                                className="w-full flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground font-bold p-3 rounded-xl transition-all text-xs uppercase cursor-pointer"
                            >
                                <PlayCircle size={16} /> Iniciar Manutenção
                            </button>
                        </div>
                    )}
                    {task.status === 'in_progress' && (
                        <div className="pt-2 border-t border-border">
                            <button
                                onClick={() => { setSelectedTask(task); setIsCompletionOpen(true); }}
                                className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold p-3 rounded-xl transition-all text-xs uppercase"
                            >
                                <CheckCircle2 size={16} /> Finalizar Tarefa
                            </button>
                        </div>
                    )}
                    {task.status === 'waiting_conference' && (
                        <div className="pt-2 border-t border-border">
                            {isManager ? (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleConferTask(task.id, false)}
                                        className="flex-1 py-2.5 bg-red-500/10 text-red-600 text-[10px] font-bold uppercase rounded-xl hover:bg-red-500 hover:text-white transition-all"
                                    >
                                        Reprovar
                                    </button>
                                    <button
                                        onClick={() => handleConferTask(task.id, true)}
                                        className="flex-1 py-2.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded-xl hover:opacity-90 transition-all shadow-sm"
                                    >
                                        Aprovar
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-xl">
                                    <p className="text-xs text-orange-600 font-bold flex items-center gap-2"><AlertCircle size={14} /> Aguardando Validação</p>
                                </div>
                            )}
                        </div>
                    )}
                    {task.status === 'completed' && (
                        <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-xl flex justify-between items-center text-green-600 font-bold text-xs uppercase tracking-widest">
                            Concluído <CheckCircle2 size={14} />
                        </div>
                    )}
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between opacity-50">
                    <span className="text-[10px] font-bold uppercase">{task.checklist?.length || 0} Subitens</span>
                    <span className="text-[10px] font-medium">{task.createdAt ? new Date(task.createdAt).toLocaleDateString('pt-BR') : ''}</span>
                </div>
            </div>
        );
    };

    // ── KanbanColumn ───────────────────────────────────────────────────────────

    const KanbanColumn = ({ title, icon: Icon, colorClass, items }: { title: string; icon: any; colorClass: string; items: MaintenanceTask[] }) => {
        const allSelected = items.length > 0 && items.every(t => selectedIds.has(t.id));
        return (
            <div className="flex-1 min-w-[300px] flex flex-col bg-muted/20 border border-border rounded-2xl overflow-hidden">
                <div className={cn("p-4 border-b border-border flex items-center justify-between bg-card", colorClass)}>
                    <h3 className="font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                        <Icon size={16} /> {title}
                    </h3>
                    <div className="flex items-center gap-2">
                        {items.length > 0 && (
                            <button
                                onClick={() => toggleSelectAll(items)}
                                className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors flex items-center gap-1",
                                    allSelected ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                                )}
                            >
                                {allSelected ? <CheckSquare size={12} /> : <Square size={12} />}
                                Todos
                            </button>
                        )}
                        <span className="bg-background px-2 py-0.5 rounded-full text-xs font-black shadow-sm">{items.length}</span>
                    </div>
                </div>
                <div className="p-4 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
                    {items.length === 0 ? (
                        <div className="h-24 border-2 border-dashed border-border rounded-xl flex items-center justify-center text-xs font-bold text-muted-foreground uppercase opacity-50">Vazio</div>
                    ) : (
                        items.map(task => <KanbanCard key={task.id} task={task} />)
                    )}
                </div>
            </div>
        );
    };

    const activeTabItems = activeTab === 'pending' ? pendingTasks : activeTab === 'in_progress' ? inProgressTasks : waitingTasks;

    return (
        <div className="flex flex-col space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 md:mt-0">
                <div className="flex items-center gap-3 min-w-0">
                    <Link href="/admin/maintenance" className="p-2 bg-secondary text-muted-foreground hover:text-foreground rounded-xl border border-border transition-colors shrink-0">
                        <ChevronLeft size={16} />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate">Kanban de Manutenção</h1>
                        <p className="text-sm text-muted-foreground mt-0.5 hidden sm:block">Ordens de serviço em tempo real.</p>
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    {isManager && (
                        <button
                            onClick={() => setIsRulesOpen(true)}
                            className="p-2 md:px-4 md:py-2 bg-secondary text-foreground font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-accent transition-colors flex items-center gap-2 shadow-sm border border-border"
                            title="Automação"
                        >
                            <RefreshCw size={14} /> <span className="hidden md:inline">Automação</span>
                        </button>
                    )}
                    <button
                        onClick={() => setIsHistoryOpen(true)}
                        className="hidden md:flex px-4 py-2 bg-secondary text-foreground font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-accent transition-colors items-center gap-2 shadow-sm border border-border"
                    >
                        <History size={14} /> Histórico
                    </button>
                    <button
                        onClick={() => setIsArchiveOpen(true)}
                        className="hidden md:flex px-4 py-2 bg-secondary text-foreground font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-accent transition-colors items-center gap-2 shadow-sm border border-border"
                    >
                        <Archive size={14} /> Arquivo
                    </button>
                    <button
                        onClick={() => { setSelectedTask(null); setIsManagerOpen(true); }}
                        className="px-3 md:px-4 py-2 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
                    >
                        <Plus size={16} /> <span className="hidden sm:inline">Nova Tarefa</span><span className="sm:hidden">Nova</span>
                    </button>
                </div>
            </div>

            {/* Batch toolbar */}
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-2xl animate-in slide-in-from-top-2 fade-in duration-200">
                    <button onClick={clearSelection} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors">
                        <X size={16} />
                    </button>
                    <span className="text-sm font-black text-primary flex items-center gap-2">
                        <CheckCheck size={16} /> {selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    <div className="flex-1" />
                    {batchLoading ? (
                        <Loader2 size={18} className="animate-spin text-muted-foreground" />
                    ) : (
                        <>
                            <button
                                onClick={handleBatchCancel}
                                className="px-4 py-2 bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white text-xs font-bold uppercase rounded-xl transition-all flex items-center gap-1.5"
                            >
                                <Trash2 size={14} /> Cancelar Tarefas
                            </button>
                            <button
                                onClick={handleBatchApprove}
                                className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 text-xs font-bold uppercase rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                            >
                                <CheckCheck size={14} /> Aprovar Selecionadas
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Kanban — Desktop */}
            <div className="hidden md:flex flex-1 overflow-x-auto pb-4 custom-scrollbar">
                <div className="flex gap-4 h-full min-w-max">
                    <KanbanColumn title="Pendentes" icon={Hammer} colorClass="text-foreground" items={pendingTasks} />
                    <KanbanColumn title="Em Andamento" icon={PlayCircle} colorClass="text-primary" items={inProgressTasks} />
                    <KanbanColumn title="Aguardando Validação" icon={AlertCircle} colorClass="text-orange-500" items={waitingTasks} />
                </div>
            </div>

            {/* Kanban — Mobile (abas) */}
            <div className="md:hidden flex flex-col">
                <div className="flex gap-1 bg-muted/30 p-1 rounded-2xl border border-border shrink-0">
                    {([
                        { key: 'pending', label: 'Pendentes', count: pendingTasks.length, color: 'text-foreground' },
                        { key: 'in_progress', label: 'Em Andamento', count: inProgressTasks.length, color: 'text-primary' },
                        { key: 'conference', label: 'Validação', count: waitingTasks.length, color: 'text-orange-500' },
                    ] as const).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "flex-1 py-2 px-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5",
                                activeTab === tab.key
                                    ? "bg-card shadow-sm text-foreground border border-border"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <span className={activeTab === tab.key ? tab.color : ''}>{tab.label}</span>
                            <span className={cn(
                                "px-1.5 py-0.5 rounded-full text-[9px] font-black",
                                activeTab === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                            )}>{tab.count}</span>
                        </button>
                    ))}
                </div>
                {activeTabItems.length > 0 && (
                    <button
                        onClick={() => toggleSelectAll(activeTabItems)}
                        className={cn(
                            "mt-3 w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 border",
                            activeTabItems.every(t => selectedIds.has(t.id))
                                ? "text-primary bg-primary/10 border-primary/30"
                                : "text-muted-foreground bg-secondary border-border hover:text-foreground"
                        )}
                    >
                        {activeTabItems.every(t => selectedIds.has(t.id)) ? <CheckSquare size={12} /> : <Square size={12} />}
                        {activeTabItems.every(t => selectedIds.has(t.id)) ? 'Desmarcar todos' : 'Selecionar todos'}
                    </button>
                )}
                <div className="mt-4 space-y-4 pb-4">
                    {activeTabItems.length === 0 ? (
                        <div className="h-24 border-2 border-dashed border-border rounded-xl flex items-center justify-center text-xs font-bold text-muted-foreground uppercase opacity-50">Vazio</div>
                    ) : (
                        activeTabItems.map(task => <KanbanCard key={task.id} task={task} />)
                    )}
                </div>
            </div>

            {/* Modals */}
            <MaintenanceTaskManagerModal
                isOpen={isManagerOpen}
                onClose={() => { setIsManagerOpen(false); setSelectedTask(null); }}
                propertyId={property.id}
                task={selectedTask}
                cabins={cabins}
                structures={structures}
                technicians={technicians}
            />
            <MaintenanceCompletionModal
                isOpen={isCompletionOpen}
                onClose={() => { setIsCompletionOpen(false); setSelectedTask(null); }}
                propertyId={property.id}
                task={selectedTask}
                cabins={cabins}
                structures={structures}
            />
            <MaintenanceRulesModal
                isOpen={isRulesOpen}
                onClose={() => setIsRulesOpen(false)}
                propertyId={property.id}
                cabins={cabins}
                structures={structures}
                technicians={technicians}
            />

            {/* Histórico */}
            {isHistoryOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border w-full max-w-3xl rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <header className="p-6 border-b border-border flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-xl font-black uppercase text-foreground tracking-tighter flex items-center gap-2">
                                    <History size={20} className="text-muted-foreground" /> Histórico de Manutenção
                                </h2>
                                <div className="flex gap-2 mt-2">
                                    {([30, 90, 180] as const).map(d => (
                                        <button
                                            key={d}
                                            onClick={() => setHistoryDays(d)}
                                            className={cn(
                                                "text-[10px] font-black uppercase px-2.5 py-1 rounded-lg transition-colors",
                                                historyDays === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {d}d
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setIsHistoryOpen(false)} className="p-2 bg-secondary text-muted-foreground hover:text-foreground rounded-full hover:bg-white/5 transition-colors">
                                <X size={20} />
                            </button>
                        </header>
                        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar bg-secondary/20">
                            {historyTasks.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <History size={40} className="mx-auto mb-4 opacity-20" />
                                    <p className="text-sm font-bold uppercase tracking-widest">Nenhuma OS concluída neste período.</p>
                                </div>
                            ) : (
                                historyTasks.map(task => {
                                    const techNames = (task.assignedTo || [])
                                        .map(id => technicians.find(t => t.id === id)?.fullName?.split(' ')[0])
                                        .filter(Boolean).join(', ') || '—';
                                    const reviewerName = task.conferredBy
                                        ? technicians.find(t => t.id === task.conferredBy)?.fullName?.split(' ')[0] || 'Coord.'
                                        : '—';
                                    return (
                                        <div key={task.id} className="bg-card border border-border p-4 rounded-xl">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <p className="font-bold text-sm text-foreground truncate">{task.title}</p>
                                                        {task.recurrenceSourceId && (
                                                            <span className="text-[9px] bg-teal-500/10 text-teal-500 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1 shrink-0">
                                                                <RefreshCw size={8} /> Auto
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                                                        <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded font-bold uppercase">Concluído</span>
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                                                            <CalendarIcon size={10} />
                                                            {task.finishedAt ? new Date(task.finishedAt).toLocaleDateString('pt-BR') : ''}
                                                        </span>
                                                        {task.cabinId && <span className="text-[10px] text-primary font-bold">📍 {cabins[task.cabinId]?.name}</span>}
                                                        {task.structureId && <span className="text-[10px] text-primary font-bold">📍 {structures[task.structureId]?.name}</span>}
                                                        {task.customLocation && <span className="text-[10px] text-primary font-bold">📍 {task.customLocation}</span>}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right space-y-1">
                                                    <p className="text-[10px] text-muted-foreground font-bold uppercase">Técnico</p>
                                                    <p className="text-xs text-foreground font-bold">{techNames}</p>
                                                    {task.conferredBy && (
                                                        <>
                                                            <p className="text-[10px] text-muted-foreground font-bold uppercase mt-1">Revisado por</p>
                                                            <p className="text-xs text-foreground font-bold">{reviewerName}</p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <footer className="p-6 border-t border-border shrink-0 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Aura Engine • Histórico de Manutenção</p>
                        </footer>
                    </div>
                </div>
            )}

            {/* Arquivo (últimos 7 dias) */}
            {isArchiveOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border w-full max-w-3xl rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <header className="p-6 border-b border-border flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-xl font-black uppercase text-foreground tracking-tighter flex items-center gap-2">
                                    <Archive size={20} className="text-muted-foreground" /> Arquivo de Manutenção
                                </h2>
                                <p className="text-xs text-muted-foreground font-medium mt-1">Tarefas finalizadas nos últimos 7 dias.</p>
                            </div>
                            <button onClick={() => setIsArchiveOpen(false)} className="p-2 bg-secondary text-muted-foreground hover:text-foreground rounded-full hover:bg-white/5 transition-colors"><X size={20} /></button>
                        </header>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-secondary/20">
                            {recentCompletedTasks.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Archive size={40} className="mx-auto mb-4 opacity-20" />
                                    <p className="text-sm font-bold uppercase tracking-widest">Nenhuma OS finalizada esta semana.</p>
                                </div>
                            ) : (
                                recentCompletedTasks.map(task => (
                                    <div key={task.id} className="bg-card border border-border p-4 rounded-xl flex items-center justify-between gap-4">
                                        <div>
                                            <p className="font-bold text-sm">{task.title}</p>
                                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{task.description}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded font-bold uppercase">Concluído</span>
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono"><CalendarIcon size={10} />{task.finishedAt ? new Date(task.finishedAt).toLocaleDateString('pt-BR') : ''}</span>
                                                {task.cabinId && <span className="text-[10px] text-primary font-bold uppercase">• {cabins[task.cabinId]?.name}</span>}
                                                {task.structureId && <span className="text-[10px] text-primary font-bold uppercase">• {structures[task.structureId]?.name}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <footer className="p-6 border-t border-border shrink-0 text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Aura Engine • Auditoria</p></footer>
                    </div>
                </div>
            )}

            {/* Lightbox */}
            {enlargedImage && (
                <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-4" onClick={() => setEnlargedImage(null)}>
                    <button onClick={() => setEnlargedImage(null)} className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full backdrop-blur-md z-10 hover:bg-black/80 transition-colors pointer-events-auto">
                        <X size={24} />
                    </button>
                    <div className="relative w-full h-full max-h-[90vh]">
                        <Image src={enlargedImage} alt="Fullscreen image" fill className="object-contain" />
                    </div>
                </div>
            )}
        </div>
    );
}
