// src/app/admin/governance/kanban/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { HousekeepingService } from "@/services/housekeeping-service";
import { CabinService } from "@/services/cabin-service";
import { StructureService } from "@/services/structure-service";
import { StaffService } from "@/services/staff-service";
import { HousekeepingTask, Cabin, Staff, Structure } from "@/types/aura";
import { HousekeepingChecklistModal } from "@/components/admin/HousekeepingChecklistModal";
import { HousekeepingTaskManagerModal } from "@/components/admin/HousekeepingTaskManagerModal";
import { HousekeepingRoutinesModal } from "@/components/admin/HousekeepingRoutinesModal";
import { ChecklistSettingsModal } from "@/components/admin/ChecklistSettingsModal";
import { MinibarModal } from "@/components/admin/MinibarModal";
import { MaidMobileApp } from "@/components/admin/MaidMobileApp";
import { StaffMobileHub } from "@/components/admin/StaffMobileHub";
import {
  Sparkles, Clock, CheckCircle2, AlertCircle,
  Coffee, ArrowRight, ClipboardCheck, Plus, UserPlus, Settings2, Edit3, MessageSquare, Archive, Calendar as CalendarIcon, X, Moon, LayoutDashboard, Smartphone, CheckSquare, Square, CheckCheck, Trash2, Loader2,
  ChevronLeft
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function GovernanceKanbanPage() {
  const router = useRouter();
  const { currentProperty: property, loading: isLoading } = useProperty();
  const { userData } = useAuth();

  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [structures, setStructures] = useState<Record<string, Structure>>({});
  const [maids, setMaids] = useState<Staff[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [govMode, setGovMode] = useState<'admin' | 'maid' | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<HousekeepingTask | null>(null);
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isRoutinesOpen, setIsRoutinesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'in_progress' | 'conference'>('pending');

  const allVisibleIds = (tasks: HousekeepingTask[]) => tasks.map(t => t.id);
  const toggleSelectAll = (taskList: HousekeepingTask[]) => {
    const ids = allVisibleIds(taskList);
    const allSelected = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  useEffect(() => {
    if (!property) return;

    let unsubscribe: () => void;

    const init = async () => {
      setLoadingInitial(true);
      try {
        const [cabinsData, staffData, structuresData] = await Promise.all([
          CabinService.getCabinsByProperty(property.id),
          StaffService.getStaffByProperty(property.id),
          StructureService.getStructures(property.id)
        ]);

        const cabinsDict: Record<string, Cabin> = {};
        cabinsData.forEach(c => cabinsDict[c.id] = c);
        setCabins(cabinsDict);

        const structuresDict: Record<string, Structure> = {};
        structuresData.forEach(s => structuresDict[s.id] = s);
        setStructures(structuresDict);

        setMaids(staffData.filter(s => s.role === 'maid' && s.active));

        unsubscribe = HousekeepingService.listenToActiveTasks(property.id, (realtimeTasks) => {
          setTasks(realtimeTasks);
        });

      } catch (error) {
        toast.error("Erro ao conectar base de governança.");
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

  if (userData?.role === 'maid') {
    return (
      <StaffMobileHub
        propertyId={property.id}
        userData={userData}
        renderTasks={() => (
           <MaidMobileApp
             propertyId={property.id}
             userData={userData}
             tasks={tasks}
             cabins={cabins}
           />
        )}
      />
    );
  }

  // governance role — sem modo selecionado → redirecionar para a página principal
  if (userData?.role === 'governance' && govMode === null) {
    router.push('/admin/governance');
    return null;
  }

  if (userData?.role === 'governance' && govMode === 'maid') {
    return (
      <StaffMobileHub
        propertyId={property.id}
        userData={userData}
        renderTasks={() => (
          <MaidMobileApp
            propertyId={property.id}
            userData={userData}
            tasks={tasks}
            cabins={cabins}
          />
        )}
      />
    );
  }

  const handleAssignTask = async (taskId: string, maidId: string) => {
    if (!maidId) return;
    try {
      await HousekeepingService.assignTask(property.id, taskId, [maidId], userData?.id || "unknown", userData?.fullName || "Admin");
      toast.success("Tarefa delegada com sucesso!");
    } catch (e) {
      toast.error("Erro ao delegar tarefa.");
    }
  };

  const handleStartTask = async (taskId: string) => {
    try {
      await HousekeepingService.startTask(property.id, taskId, userData?.id || "unknown", userData?.fullName || "Camareira");
      toast.success("Limpeza iniciada! Cronômetro rodando.");
    } catch (e) {
      toast.error("Erro ao iniciar a tarefa.");
    }
  };

  const handleArchiveSkipped = async (taskId: string) => {
    try {
      await HousekeepingService.updateTask(property!.id, taskId, { status: 'cancelled' }, userData?.id || "unknown", userData?.fullName || "Admin");
      toast.success("Tarefa arquivada.");
    } catch (e) {
      toast.error("Erro ao arquivar tarefa.");
    }
  };

  const handleConferTask = async (taskId: string, cabinId: string, approved: boolean) => {
    try {
      const actorId = userData?.id || "unknown";
      const actorName = userData?.fullName || "Governanta";
      if (approved) {
        await HousekeepingService.confirmTaskQuality(property.id, taskId, "Aprovado", actorId, actorName);
      } else {
        await HousekeepingService.rollbackTaskStatus(property.id, taskId, "Reprovado na conferência", actorId, actorName);
      }
      toast.success(approved ? "Cabana liberada!" : "Enviada para repasse.");
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

  const handleBatchRelease = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const actorId = userData?.id || "unknown";
      const actorName = userData?.fullName || "Admin";
      await Promise.all(
        Array.from(selectedIds).map(id =>
          HousekeepingService.confirmTaskQuality(property.id, id, "Liberado em lote", actorId, actorName)
        )
      );
      toast.success(`${selectedIds.size} cabana(s) liberada(s)!`);
      clearSelection();
    } catch {
      toast.error("Erro ao liberar em lote.");
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
          HousekeepingService.updateTask(property.id, id, { status: 'cancelled' }, actorId, actorName)
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

  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'paused');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const waitingTasks = tasks.filter(t => t.status === 'waiting_conference');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const skippedTasks = tasks.filter(t => t.status === 'skipped');

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentCompletedTasks = completedTasks.filter(t => {
    const dateStr = t.finishedAt || t.updatedAt || t.createdAt;
    if (!dateStr) return false;
    return new Date(dateStr) >= sevenDaysAgo;
  });

  const KanbanColumn = ({ title, icon: Icon, colorClass, items }: { title: string, icon: any, colorClass: string, items: HousekeepingTask[] }) => {
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
              className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors flex items-center gap-1", allSelected ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary")}
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
          items.map(task => {
            const safeAssignedArray = Array.isArray(task.assignedTo)
              ? task.assignedTo
              : (typeof task.assignedTo === 'string' ? [task.assignedTo] : []);

            const assignedNames = safeAssignedArray.length > 0
              ? safeAssignedArray.map(id => maids.find(m => m.id === id)?.fullName.split(' ')[0]).filter(Boolean).join(', ')
              : "Ninguém";

            const isSelected = selectedIds.has(task.id);

            return (
              <div key={task.id} className={cn("bg-card border p-4 rounded-xl shadow-sm space-y-3 transition-colors group", isSelected ? "border-primary ring-1 ring-primary/40" : "border-border hover:border-primary/50")}>
                {/* Card header: tipo + nome + ações */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {task.structureId ? <Sparkles size={14} className="text-purple-500" /> : task.type === 'turnover' ? <AlertCircle size={14} className="text-orange-500" /> : <Coffee size={14} className="text-blue-500" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-0.5">
                        {task.customLocation ? 'Local Específico' : task.structureId ? 'Limpeza de Estrutura' : task.type === 'turnover' ? 'Faxina de Troca' : 'Arrumação Diária'}
                      </p>
                      <h4 className="font-bold text-base text-foreground leading-none truncate">
                        {task.customLocation || (task.structureId ? (structures[task.structureId]?.name || "Estrutura Excluída") : (cabins[task.cabinId!]?.name || "Cabana Excluída"))}
                      </h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setSelectedTask(task); setIsManagerOpen(true); }}
                      className="p-1.5 bg-secondary text-muted-foreground hover:text-primary rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => toggleSelect(task.id)}
                      className={cn("p-1.5 rounded-lg transition-colors", isSelected ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary")}
                    >
                      {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {(task.status === 'pending' || task.status === 'paused') ? (
                    <div className="flex flex-col gap-3">
                      {task.status === 'paused' && task.paused_until && (
                        <div className="flex items-center gap-2 bg-yellow-500/10 text-yellow-700 px-3 py-2 rounded-lg text-[10px] font-bold uppercase">
                          <Moon size={12} />
                          Não Perturbe — retoma às {new Date(task.paused_until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                      <div className="flex items-center gap-2 bg-secondary/50 p-2 rounded-lg border border-border">
                        <UserPlus size={14} className="text-muted-foreground shrink-0" />
                        <select
                          value={safeAssignedArray[0] || ""}
                          onChange={(e) => handleAssignTask(task.id, e.target.value)}
                          className="w-full bg-transparent text-xs font-bold uppercase outline-none cursor-pointer text-foreground"
                        >
                          <option value="" disabled className="bg-card text-muted-foreground">Delegar para...</option>
                          {maids.map(m => <option key={m.id} value={m.id} className="bg-card text-foreground">{m.fullName}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        {task.type === 'turnover' && (
                          <button onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }} className="flex-1 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-600 hover:text-white text-[10px] font-bold uppercase rounded-lg transition-all flex justify-center items-center gap-1">
                            <Coffee size={12} /> Frigobar
                          </button>
                        )}
                        <button
                          onClick={() => handleStartTask(task.id)}
                          disabled={task.status === 'paused' && !!task.paused_until && new Date(task.paused_until) > new Date()}
                          className="flex-1 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground text-[10px] font-bold uppercase rounded-lg transition-all flex justify-center items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowRight size={12} /> Iniciar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setSelectedTask(task); setIsManagerOpen(true); }}
                      className="w-full text-left text-[10px] text-muted-foreground flex items-center gap-1 bg-secondary/50 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors"
                    >
                      <CheckCircle2 size={12} className="shrink-0" />
                      <span className="truncate">Resp: <strong className="text-foreground">{assignedNames}</strong></span>
                    </button>
                  )}

                  {task.observations && (
                    <div className="text-[10px] text-orange-600 bg-orange-500/10 px-2 py-1.5 rounded-md flex items-start gap-1 line-clamp-2">
                      <MessageSquare size={12} className="shrink-0 mt-0.5" />
                      <span>{task.observations}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-border flex gap-2">
                  {task.status === 'in_progress' && (
                    <>
                      <button onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }} className="flex-1 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-600 hover:text-white text-[10px] font-bold uppercase rounded-lg transition-all flex justify-center items-center gap-1">Frigobar</button>
                      <button onClick={() => { setSelectedTask(task); setIsChecklistOpen(true); }} className="flex-1 py-2 bg-green-600 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-green-700 transition-all flex justify-center items-center gap-1 shadow-sm">Finalizar <ClipboardCheck size={14} /></button>
                    </>
                  )}
                  {task.status === 'waiting_conference' && (userData?.role === 'super_admin' || userData?.role === 'admin' || userData?.role === 'governance' || userData?.role === 'hr') && (
                    <>
                      <button onClick={() => handleConferTask(task.id, task.cabinId || task.structureId!, false)} className="flex-1 py-2 bg-red-500/10 text-red-600 text-[10px] font-bold uppercase rounded-lg hover:bg-red-500 hover:text-white transition-all">Reprovar</button>
                      <button onClick={() => handleConferTask(task.id, task.cabinId || task.structureId!, true)} className="flex-1 py-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded-lg hover:opacity-90 transition-all shadow-sm">Liberar</button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
  };

  return (
    <div className="h-full flex flex-col space-y-4 md:space-y-6 p-4 md:p-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/governance"
            className="p-2 bg-secondary text-muted-foreground hover:text-foreground rounded-xl border border-border transition-colors"
          >
            <ChevronLeft size={16} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kanban de Governança</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Sincronizado em tempo real com a equipe de campo.</p>
          </div>
        </div>
        <div className="flex gap-3">
          {(userData?.role === 'super_admin' || userData?.role === 'admin' || userData?.role === 'governance' || userData?.role === 'hr') && (
            <>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="px-4 py-2 bg-secondary text-foreground rounded-xl text-xs font-bold uppercase hover:bg-accent transition-all border border-border flex items-center gap-2 shadow-sm"
              >
                <Settings2 size={14} /> Procedimentos
              </button>
              <button
                onClick={() => setIsRoutinesOpen(true)}
                className="px-4 py-2 bg-secondary text-foreground rounded-xl text-xs font-bold uppercase hover:bg-accent transition-all border border-border flex items-center gap-2 shadow-sm"
              >
                <CalendarIcon size={14} /> Rotinas
              </button>
            </>
          )}
          <button onClick={() => setIsArchiveOpen(true)} className="hidden md:flex flex-row px-4 py-2 bg-secondary text-foreground rounded-xl text-xs font-bold uppercase hover:bg-accent transition-all border border-border items-center gap-2 shadow-sm">
            <Archive size={14} /> Arquivo
          </button>
          <button onClick={() => { setSelectedTask(null); setIsManagerOpen(true); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase hover:opacity-90 transition-all shadow-sm flex items-center gap-2">
            <Plus size={14} /> Nova Tarefa
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
              <button onClick={handleBatchCancel} className="px-4 py-2 bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white text-xs font-bold uppercase rounded-xl transition-all flex items-center gap-1.5">
                <Trash2 size={14} /> Cancelar Faxinas
              </button>
              <button onClick={handleBatchRelease} className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 text-xs font-bold uppercase rounded-xl transition-all flex items-center gap-1.5 shadow-sm">
                <CheckCheck size={14} /> Liberar Cabanas
              </button>
            </>
          )}
        </div>
      )}

      {/* Kanban — Desktop */}
      <div className="hidden md:flex flex-1 overflow-x-auto">
        <div className="flex gap-6 h-full min-w-max pb-4">
          <KanbanColumn title="A Fazer" icon={ClipboardCheck} colorClass="text-zinc-500" items={pendingTasks} />
          <KanbanColumn title="Limpando" icon={Sparkles} colorClass="text-blue-500" items={inProgressTasks} />
          <KanbanColumn title="Conferência" icon={AlertCircle} colorClass="text-orange-500" items={waitingTasks} />
        </div>
      </div>

      {/* Kanban — Mobile (abas) */}
      <div className="md:hidden flex flex-col flex-1 min-h-0">
        <div className="flex gap-1 bg-muted/30 p-1 rounded-2xl border border-border shrink-0">
          {([
            { key: 'pending', label: 'A Fazer', count: pendingTasks.length, color: 'text-zinc-500' },
            { key: 'in_progress', label: 'Limpando', count: inProgressTasks.length, color: 'text-blue-500' },
            { key: 'conference', label: 'Conferência', count: waitingTasks.length, color: 'text-orange-500' },
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
        {(() => {
          const activeList = activeTab === 'pending' ? pendingTasks : activeTab === 'in_progress' ? inProgressTasks : waitingTasks;
          const allActiveSel = activeList.length > 0 && activeList.every(t => selectedIds.has(t.id));
          return activeList.length > 0 ? (
            <button
              onClick={() => toggleSelectAll(activeList)}
              className={cn("mt-3 w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 border", allActiveSel ? "text-primary bg-primary/10 border-primary/30" : "text-muted-foreground bg-secondary border-border hover:text-foreground")}
            >
              {allActiveSel ? <CheckSquare size={12} /> : <Square size={12} />}
              {allActiveSel ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          ) : null;
        })()}
        <div className="flex-1 overflow-y-auto mt-4 space-y-4 custom-scrollbar pb-4">
          {(activeTab === 'pending' ? pendingTasks : activeTab === 'in_progress' ? inProgressTasks : waitingTasks).length === 0 ? (
            <div className="h-24 border-2 border-dashed border-border rounded-xl flex items-center justify-center text-xs font-bold text-muted-foreground uppercase opacity-50">Vazio</div>
          ) : (
            (activeTab === 'pending' ? pendingTasks : activeTab === 'in_progress' ? inProgressTasks : waitingTasks).map(task => {
              const safeAssignedArray = Array.isArray(task.assignedTo)
                ? task.assignedTo
                : (typeof task.assignedTo === 'string' ? [task.assignedTo] : []);
              const assignedNames = safeAssignedArray.length > 0
                ? safeAssignedArray.map(id => maids.find(m => m.id === id)?.fullName.split(' ')[0]).filter(Boolean).join(', ')
                : "Ninguém";
              const isSelected = selectedIds.has(task.id);

              return (
                <div key={task.id} className={cn("bg-card border p-4 rounded-xl shadow-sm space-y-3 transition-colors group", isSelected ? "border-primary ring-1 ring-primary/40" : "border-border")}>
                  {/* Card header: tipo + nome + ações */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        {task.structureId ? <Sparkles size={14} className="text-purple-500" /> : task.type === 'turnover' ? <AlertCircle size={14} className="text-orange-500" /> : <Coffee size={14} className="text-blue-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-0.5">
                          {task.customLocation ? 'Local Específico' : task.structureId ? 'Limpeza de Estrutura' : task.type === 'turnover' ? 'Faxina de Troca' : 'Arrumação Diária'}
                        </p>
                        <h4 className="font-bold text-base text-foreground leading-none truncate">
                          {task.customLocation || (task.structureId ? (structures[task.structureId]?.name || "Estrutura Excluída") : (cabins[task.cabinId!]?.name || "Cabana Excluída"))}
                        </h4>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => { setSelectedTask(task); setIsManagerOpen(true); }} className="p-1.5 bg-secondary text-muted-foreground hover:text-primary rounded-lg transition-colors">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => toggleSelect(task.id)} className={cn("p-1.5 rounded-lg transition-colors", isSelected ? "text-primary" : "text-muted-foreground hover:text-primary")}>
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(task.status === 'pending' || task.status === 'paused') ? (
                      <div className="flex flex-col gap-3">
                        {task.status === 'paused' && task.paused_until && (
                          <div className="flex items-center gap-2 bg-yellow-500/10 text-yellow-700 px-3 py-2 rounded-lg text-[10px] font-bold uppercase">
                            <Moon size={12} />
                            Não Perturbe — retoma às {new Date(task.paused_until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        <div className="flex items-center gap-2 bg-secondary/50 p-2 rounded-lg border border-border">
                          <UserPlus size={14} className="text-muted-foreground shrink-0" />
                          <select value={safeAssignedArray[0] || ""} onChange={(e) => handleAssignTask(task.id, e.target.value)} className="w-full bg-transparent text-xs font-bold uppercase outline-none cursor-pointer text-foreground">
                            <option value="" disabled className="bg-card text-muted-foreground">Delegar para...</option>
                            {maids.map(m => <option key={m.id} value={m.id} className="bg-card text-foreground">{m.fullName}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          {task.type === 'turnover' && (
                            <button onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }} className="flex-1 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-600 hover:text-white text-[10px] font-bold uppercase rounded-lg transition-all flex justify-center items-center gap-1">
                              <Coffee size={12} /> Frigobar
                            </button>
                          )}
                          <button onClick={() => handleStartTask(task.id)} disabled={task.status === 'paused' && !!task.paused_until && new Date(task.paused_until) > new Date()} className="flex-1 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground text-[10px] font-bold uppercase rounded-lg transition-all flex justify-center items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
                            <ArrowRight size={12} /> Iniciar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setSelectedTask(task); setIsManagerOpen(true); }} className="w-full text-left text-[10px] text-muted-foreground flex items-center gap-1 bg-secondary/50 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors">
                        <CheckCircle2 size={12} className="shrink-0" />
                        <span className="truncate">Resp: <strong className="text-foreground">{assignedNames}</strong></span>
                      </button>
                    )}
                    {task.observations && (
                      <div className="text-[10px] text-orange-600 bg-orange-500/10 px-2 py-1.5 rounded-md flex items-start gap-1 line-clamp-2">
                        <MessageSquare size={12} className="shrink-0 mt-0.5" />
                        <span>{task.observations}</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-3 border-t border-border flex gap-2">
                    {task.status === 'in_progress' && (
                      <>
                        <button onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }} className="flex-1 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-600 hover:text-white text-[10px] font-bold uppercase rounded-lg transition-all flex justify-center items-center gap-1">Frigobar</button>
                        <button onClick={() => { setSelectedTask(task); setIsChecklistOpen(true); }} className="flex-1 py-2 bg-green-600 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-green-700 transition-all flex justify-center items-center gap-1 shadow-sm">Finalizar <ClipboardCheck size={14} /></button>
                      </>
                    )}
                    {task.status === 'waiting_conference' && (userData?.role === 'super_admin' || userData?.role === 'admin' || userData?.role === 'governance' || userData?.role === 'hr') && (
                      <>
                        <button onClick={() => handleConferTask(task.id, task.cabinId || task.structureId!, false)} className="flex-1 py-2 bg-red-500/10 text-red-600 text-[10px] font-bold uppercase rounded-lg hover:bg-red-500 hover:text-white transition-all">Reprovar</button>
                        <button onClick={() => handleConferTask(task.id, task.cabinId || task.structureId!, true)} className="flex-1 py-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded-lg hover:opacity-90 transition-all shadow-sm">Liberar</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Skipped tasks — DND */}
      {skippedTasks.length > 0 && (
        <div className="border border-yellow-500/30 bg-yellow-500/5 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-yellow-700 flex items-center gap-2">
            <Moon size={14} /> Não Realizadas — Recusadas pelo Hóspede ({skippedTasks.length})
          </h3>
          <div className="flex flex-wrap gap-3">
            {skippedTasks.map(task => {
              const cabin = cabins[task.cabinId!];
              const skippedDate = task.skippedAt || task.updatedAt || task.createdAt;
              const dateLabel = skippedDate
                ? new Date(skippedDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                : null;
              const guestFirstName = task.guestName?.split(' ')[0];
              const typeLabel = task.type === 'turnover' ? 'Faxina de troca' : 'Arrumação diária';
              return (
                <div key={task.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 min-w-[260px]">
                  {task.type === 'turnover' ? <AlertCircle size={14} className="text-orange-500 shrink-0" /> : <Coffee size={14} className="text-blue-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-foreground leading-tight">
                      {cabin ? `${cabin.number} — ${guestFirstName || task.guestName || cabin.name}` : (guestFirstName || task.guestName || 'Cabana')}
                    </p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                      {typeLabel}{dateLabel ? ` pulada (${dateLabel})` : ' pulada'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleArchiveSkipped(task.id)}
                    className="shrink-0 text-[9px] bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 px-2 py-1 rounded font-bold uppercase transition-colors"
                  >
                    Arquivar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ChecklistSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} propertyId={property.id} />
      <HousekeepingRoutinesModal isOpen={isRoutinesOpen} onClose={() => setIsRoutinesOpen(false)} propertyId={property.id} cabins={cabins} structures={structures} maids={maids} />
      <HousekeepingChecklistModal isOpen={isChecklistOpen} onClose={() => setIsChecklistOpen(false)} task={selectedTask} cabinName={selectedTask ? (selectedTask.structureId ? structures[selectedTask.structureId]?.name : cabins[selectedTask.cabinId || ""]?.name || "") : ""} onComplete={() => { }} />
      <MinibarModal isOpen={isMinibarOpen} onClose={() => setIsMinibarOpen(false)} task={selectedTask} cabinName={selectedTask ? (selectedTask.structureId ? structures[selectedTask.structureId]?.name : cabins[selectedTask.cabinId || ""]?.name || "") : ""} />
      <HousekeepingTaskManagerModal
        isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)}
        propertyId={property.id} task={selectedTask} cabins={cabins} structures={structures} maids={maids}
      />

      {isArchiveOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border w-full max-w-3xl rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <header className="p-6 border-b border-border flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-black uppercase text-foreground tracking-tighter flex items-center gap-2">
                  <Archive size={20} className="text-muted-foreground" />
                  Arquivo de Governança
                </h2>
                <p className="text-xs text-muted-foreground font-medium mt-1">Atividades de limpeza concluídas na última semana.</p>
              </div>
              <button onClick={() => setIsArchiveOpen(false)} className="p-2 bg-secondary text-muted-foreground hover:text-foreground rounded-full hover:bg-white/5 transition-colors">
                <X size={20} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-secondary/20">
              {recentCompletedTasks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Archive size={40} className="mx-auto mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">Nenhuma limpeza validada esta semana.</p>
                </div>
              ) : (
                recentCompletedTasks.map(task => {
                  const safeAssignedArray = Array.isArray(task.assignedTo)
                    ? task.assignedTo
                    : (typeof task.assignedTo === 'string' ? [task.assignedTo] : []);
                  const assignedNames = safeAssignedArray.length > 0
                    ? safeAssignedArray.map(id => maids.find(m => m.id === id)?.fullName.split(' ')[0]).filter(Boolean).join(', ')
                    : "Ninguém";
                  return (
                    <div key={task.id} className="bg-card border border-border p-4 rounded-xl flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {task.structureId ? <Sparkles size={12} className="text-purple-500" /> : task.type === 'turnover' ? <AlertCircle size={12} className="text-orange-500" /> : <Coffee size={12} className="text-blue-500" />}
                          <p className="font-bold text-sm">
                            {task.customLocation || (task.structureId ? (structures[task.structureId]?.name || "Estrutura") : (cabins[task.cabinId!]?.name || "Cabana"))}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                          {task.structureId ? 'Estrutura' : task.type === 'turnover' ? 'Faxina de Troca' : 'Arrumação Diária'}
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded font-bold uppercase">Liberado</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                            <CalendarIcon size={10} />
                            {task.finishedAt ? new Date(task.finishedAt).toLocaleDateString('pt-BR') : ''}
                          </span>
                          <span className="text-[10px] text-foreground/50 font-bold uppercase">• Resp: {assignedNames}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
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
