// src/app/admin/maintenance/page.tsx
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
import { Clock, Hammer, AlertCircle, CheckCircle2, PlayCircle, Plus, Edit3, Settings2, Archive, Calendar as CalendarIcon, X, Moon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function MaintenancePage() {
    const { currentProperty: property, loading: isLoading } = useProperty();
    const { userData } = useAuth();

    const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
    const [cabins, setCabins] = useState<Record<string, Cabin>>({});
    const [structures, setStructures] = useState<Record<string, Structure>>({});
    const [technicians, setTechnicians] = useState<any[]>([]); // Using any for Staff to avoid importing type if not exported correctly, though it should be exported
    const [loadingInitial, setLoadingInitial] = useState(true);

    const [isManagerOpen, setIsManagerOpen] = useState(false);
    const [isCompletionOpen, setIsCompletionOpen] = useState(false);
    const [isArchiveOpen, setIsArchiveOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);

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

                // Fetch Staff (Role = maintenance or technician)
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

    // Mobile App View restriction if user is ONLY a technician
    if (userData?.role === 'technician') {
        // We would return a Mobile version here like we did for maids, but for now we let them use the Kanban or build a custom mobile view later.
        // For MVP, we let them view his assigned tasks in a stacked layout.
    }

    const handleStartTask = async (taskId: string) => {
        try {
            await MaintenanceService.startTask(property.id, taskId, userData?.id || "unknown", userData?.fullName || "Técnico");
            toast.success("Manutenção iniciada! Cronômetro rodando.");
        } catch (e) {
            toast.error("Erro ao iniciar a tarefa.");
        }
    };

    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'paused');
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
    const waitingTasks = tasks.filter(t => t.status === 'waiting_conference');
    const completedTasks = tasks.filter(t => t.status === 'completed');

    // Funcionalidade de Arquivo (Últimos 7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentCompletedTasks = completedTasks.filter(t => {
        const dateStr = t.finishedAt || t.updatedAt || t.createdAt;
        if (!dateStr) return false;
        return new Date(dateStr) >= sevenDaysAgo;
    });

    const KanbanColumn = ({ title, icon: Icon, colorClass, items }: { title: string, icon: any, colorClass: string, items: MaintenanceTask[] }) => (
        <div className="flex-1 min-w-[300px] flex flex-col bg-muted/20 border border-border rounded-2xl overflow-hidden">
            <div className={cn("p-4 border-b border-border flex items-center justify-between bg-card", colorClass)}>
                <h3 className="font-bold text-sm uppercase tracking-widest flex items-center gap-2">
                    <Icon size={16} /> {title}
                </h3>
                <span className="bg-background px-2 py-0.5 rounded-full text-xs font-black shadow-sm">{items.length}</span>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
                {items.length === 0 ? (
                    <div className="h-24 border-2 border-dashed border-border rounded-xl flex items-center justify-center text-xs font-bold text-muted-foreground uppercase opacity-50">Vazio</div>
                ) : (
                    items.map(task => {
                        const safeAssignedArray = Array.isArray(task.assignedTo) ? task.assignedTo : [];
                        const isManager = userData?.role === 'admin' || userData?.role === 'super_admin' || userData?.role === 'maintenance';

                        return (
                            <div key={task.id} className={cn(
                                "bg-card border p-4 rounded-xl shadow-sm space-y-4 hover:border-primary/50 transition-colors group relative",
                                task.status === 'paused' ? "border-yellow-400 opacity-75" : "border-border"
                            )}>
                                {task.status === 'paused' && (
                                    <div className="flex items-center gap-2 bg-yellow-500/10 text-yellow-700 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase mb-2">
                                        <Moon size={12} />
                                        DND
                                        {task.pausedUntil && ` — retoma às ${new Date(task.pausedUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                                    </div>
                                )}
                                {isManager && (
                                    <button
                                        onClick={() => { setSelectedTask(task); setIsManagerOpen(true); }}
                                        className="absolute top-4 right-4 p-2 bg-secondary text-muted-foreground hover:text-primary rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Edit3 size={16} />
                                    </button>
                                )}

                                <div className="flex justify-between items-start">
                                    <div className="pr-10">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className={cn(
                                                "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border leading-none pt-1 pb-0.5",
                                                task.priority === 'urgent' ? 'border-red-500/30 text-red-500 bg-red-500/10' :
                                                    task.priority === 'high' ? 'border-orange-500/30 text-orange-500 bg-orange-500/10' :
                                                        task.priority === 'medium' ? 'border-yellow-500/30 text-yellow-600 bg-yellow-500/10' :
                                                            'border-blue-500/30 text-blue-500 bg-blue-500/10'
                                            )}>
                                                {task.priority === 'urgent' ? 'Urgente' : task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Média' : 'Baixa'}
                                            </p>
                                            {task.isRecurring && (
                                                <span className="text-[10px] bg-indigo-500/10 text-indigo-500 px-2 rounded font-bold uppercase py-0.5">Recorrente</span>
                                            )}
                                        </div>
                                        <h4 className="font-bold text-lg text-foreground leading-tight mt-1">{task.title}</h4>
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                                        {task.cabinId && <p className="text-xs font-bold text-primary mt-2">📍 {cabins[task.cabinId]?.name || "Cabana Desconhecida"}</p>}
                                        {task.structureId && <p className="text-xs font-bold text-primary mt-2">📍 {structures[task.structureId]?.name || "Estrutura"} {task.unitId && (structures[task.structureId]?.units?.find(u => u.id === task.unitId)?.name ? ` (${structures[task.structureId]?.units?.find(u => u.id === task.unitId)?.name})` : '')}</p>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {task.status === 'pending' ? (
                                        <div className="flex flex-col gap-2 pt-2 border-t border-border">
                                            <button
                                                onClick={() => handleStartTask(task.id)}
                                                className="w-full flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground font-bold p-3 rounded-xl transition-all text-xs uppercase cursor-pointer"
                                            >
                                                <PlayCircle size={16} /> Iniciar Manutenção
                                            </button>
                                        </div>
                                    ) : task.status === 'in_progress' ? (
                                        <div className="flex flex-col gap-2 pt-2 border-t border-border">
                                            <button
                                                onClick={() => { setSelectedTask(task); setIsCompletionOpen(true); }}
                                                className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold p-3 rounded-xl transition-all text-xs uppercase"
                                            >
                                                <CheckCircle2 size={16} /> Finalizar Tarefa
                                            </button>
                                        </div>
                                    ) : task.status === 'waiting_conference' ? (
                                        <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-xl">
                                            <p className="text-xs text-orange-600 font-bold flex items-center gap-2"><AlertCircle size={14} /> Aguardando Validação</p>
                                            <button
                                                onClick={() => { setSelectedTask(task); setIsCompletionOpen(true); }}
                                                className="w-full mt-2 bg-orange-500 hover:bg-orange-600 text-white font-bold p-2 text-[10px] uppercase tracking-widest rounded-lg"
                                            >
                                                Tratar Problema
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-xl flex justify-between items-center text-green-600 font-bold text-xs uppercase tracking-widest">
                                            Concluído <CheckCircle2 size={14} />
                                        </div>
                                    )}
                                </div>

                                <div className="pt-2 border-t border-border flex items-center justify-between opacity-50 mt-2">
                                    <span className="text-[10px] font-bold uppercase">{task.checklist.length} Subitens</span>
                                    <span className="text-[10px] font-medium">{task.createdAt ? new Date(task.createdAt).toLocaleDateString('pt-BR') : ''}</span>
                                </div>

                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col space-y-4 p-4 md:p-0">

            {/* HEADER */}
            <div className="flex items-center justify-between mt-2 md:mt-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Manutenção de Propriedade</h1>
                    <p className="text-sm text-muted-foreground mt-1 hidden sm:block">
                        Gestão de ordens de serviço e cronograma preventivo.
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setIsArchiveOpen(true)}
                        className="px-4 py-2 bg-secondary text-foreground font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-accent transition-colors flex items-center gap-2 shadow-sm border border-border"
                    >
                        <Archive size={16} /> Arquivo
                    </button>
                    <button
                        onClick={() => { setSelectedTask(null); setIsManagerOpen(true); }}
                        className="px-4 py-2 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2 shadow-sm"
                    >
                        <Plus size={16} /> Nova Tarefa
                    </button>
                </div>
            </div>

            {/* KANBAN BOARD */}
            <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
                <div className="flex gap-4 h-full min-w-max">
                    <KanbanColumn
                        title="Pendentes"
                        icon={Hammer}
                        colorClass="text-foreground"
                        items={pendingTasks}
                    />
                    <KanbanColumn
                        title="Em Andamento"
                        icon={PlayCircle}
                        colorClass="text-primary"
                        items={inProgressTasks}
                    />
                    <KanbanColumn
                        title="Requer Atenção (Incompleto)"
                        icon={AlertCircle}
                        colorClass="text-orange-500"
                        items={waitingTasks}
                    />
                </div>
            </div>

            {/* MODALS */}
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

            {/* MODAL DE ARQUIVO (últimos 7 dias) */}
            {isArchiveOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                    <div className="bg-card border border-border w-full max-w-3xl rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <header className="p-6 border-b border-border flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-xl font-black uppercase text-foreground tracking-tighter flex items-center gap-2">
                                    <Archive size={20} className="text-muted-foreground" />
                                    Arquivo de Manutenção
                                </h2>
                                <p className="text-xs text-muted-foreground font-medium mt-1">
                                    Tarefas finalizadas nos últimos 7 dias.
                                </p>
                            </div>
                            <button onClick={() => setIsArchiveOpen(false)} className="p-2 bg-secondary text-muted-foreground hover:text-foreground rounded-full hover:bg-white/5 transition-colors">
                                <X size={20} />
                            </button>
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
                                                <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded font-bold uppercase">
                                                    Concluído
                                                </span>
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                                                    <CalendarIcon size={10} />
                                                    {task.finishedAt ? new Date(task.finishedAt).toLocaleDateString('pt-BR') : ''}
                                                </span>
                                                {task.cabinId && <span className="text-[10px] text-primary font-bold uppercase">• {cabins[task.cabinId]?.name}</span>}
                                                {task.structureId && <span className="text-[10px] text-primary font-bold uppercase">• {structures[task.structureId]?.name}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <footer className="p-6 border-t border-border shrink-0 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Aura Engine • Auditoria</p>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
}
