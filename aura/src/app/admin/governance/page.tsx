// src/app/admin/governance/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { HousekeepingService } from "@/services/housekeeping-service";
import { CabinService } from "@/services/cabin-service";
import { StructureService } from "@/services/structure-service";
import { StaffService } from "@/services/staff-service";
import { HousekeepingTask, Cabin, Staff, Structure } from "@/types/aura";
import { HousekeepingChecklistModal } from "@/components/admin/HousekeepingChecklistModal";
import { HousekeepingTaskManagerModal } from "@/components/admin/HousekeepingTaskManagerModal";
import { ChecklistSettingsModal } from "@/components/admin/ChecklistSettingsModal";
import { MinibarModal } from "@/components/admin/MinibarModal";
import { MaidMobileApp } from "@/components/admin/MaidMobileApp";
import { StaffMobileHub } from "@/components/admin/StaffMobileHub";
import {
  Sparkles, Clock, CheckCircle2, AlertCircle,
  Coffee, ArrowRight, ClipboardCheck, Plus, UserPlus, Settings2, Edit3, MessageSquare, Archive, Calendar as CalendarIcon, X, Moon, LayoutDashboard, Smartphone
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function GovernancePage() {
  const { currentProperty: property, loading: isLoading } = useProperty();
  const { userData } = useAuth();

  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [structures, setStructures] = useState<Record<string, Structure>>({});
  const [maids, setMaids] = useState<Staff[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [govMode, setGovMode] = useState<'admin' | 'maid' | null>(null);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<HousekeepingTask | null>(null);
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

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

  if (userData?.role === 'governance' && govMode === null) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-black tracking-tight text-foreground">Olá, {userData.fullName.split(' ')[0]}!</h1>
            <p className="text-sm text-muted-foreground font-medium">Como você vai trabalhar hoje?</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setGovMode('admin')}
              className="flex flex-col items-center gap-4 p-6 bg-card border-2 border-border hover:border-primary rounded-3xl shadow-sm hover:shadow-md transition-all group"
            >
              <div className="p-4 bg-primary/10 rounded-2xl group-hover:bg-primary/20 transition-colors">
                <LayoutDashboard size={28} className="text-primary" />
              </div>
              <div className="text-center">
                <p className="font-black text-sm text-foreground">Gestão</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">Kanban</p>
              </div>
            </button>
            <button
              onClick={() => setGovMode('maid')}
              className="flex flex-col items-center gap-4 p-6 bg-card border-2 border-border hover:border-teal-500 rounded-3xl shadow-sm hover:shadow-md transition-all group"
            >
              <div className="p-4 bg-teal-500/10 rounded-2xl group-hover:bg-teal-500/20 transition-colors">
                <Smartphone size={28} className="text-teal-500" />
              </div>
              <div className="text-center">
                <p className="font-black text-sm text-foreground">Campo</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">Mobile</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
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
      // Como é a atribuição rápida do select, substituímos qualquer array existente por este único ID
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

  const handleCreateMockTask = async () => {
    try {
      const cabinKeys = Object.keys(cabins);
      if (cabinKeys.length === 0) return toast.error("Cadastre uma cabana primeiro.");

      const randomCabinId = cabinKeys[Math.floor(Math.random() * cabinKeys.length)];

      await HousekeepingService.createTask(
        property.id,
        {
          propertyId: property.id,
          cabinId: randomCabinId,
          stayId: "TESTE-MOCK",
          type: 'turnover',
          status: 'pending',
          assignedTo: [],
          checklist: [],
        } as any,
        userData?.id || "unknown",
        userData?.fullName || "Admin"
      );

      toast.success("Tarefa de Turnover gerada!");
    } catch (e) {
      toast.error("Erro ao gerar tarefa.");
    }
  };

  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'paused');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const waitingTasks = tasks.filter(t => t.status === 'waiting_conference');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const skippedTasks = tasks.filter(t => t.status === 'skipped');

  // Funcionalidade de Arquivo (Últimos 7 dias)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentCompletedTasks = completedTasks.filter(t => {
    const dateStr = t.finishedAt || t.updatedAt || t.createdAt;
    if (!dateStr) return false;
    return new Date(dateStr) >= sevenDaysAgo;
  });

  const KanbanColumn = ({ title, icon: Icon, colorClass, items }: { title: string, icon: any, colorClass: string, items: HousekeepingTask[] }) => (
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
            // DEFESA CONTRA DADOS ANTIGOS: Garante que assignedTo é um array antes de mapear
            const safeAssignedArray = Array.isArray(task.assignedTo)
              ? task.assignedTo
              : (typeof task.assignedTo === 'string' ? [task.assignedTo] : []);

            const assignedNames = safeAssignedArray.length > 0
              ? safeAssignedArray.map(id => maids.find(m => m.id === id)?.fullName.split(' ')[0]).filter(Boolean).join(', ')
              : "Ninguém";

            return (
              <div key={task.id} className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-4 hover:border-primary/50 transition-colors group relative">

                <button
                  onClick={() => { setSelectedTask(task); setIsManagerOpen(true); }}
                  className="absolute top-4 right-4 p-2 bg-secondary text-muted-foreground hover:text-primary rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Edit3 size={16} />
                </button>

                <div className="flex justify-between items-start">
                  <div className="pr-10">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">
                      {task.structureId ? 'Limpeza de Estrutura' : task.type === 'turnover' ? 'Faxina de Troca' : 'Arrumação Diária'}
                    </p>
                    <h4 className="font-bold text-lg text-foreground leading-none">
                      {task.structureId ? (structures[task.structureId]?.name || "Estrutura Excluída") : (cabins[task.cabinId!]?.name || "Cabana Excluída")}
                    </h4>
                  </div>
                  {task.structureId ? <Sparkles size={16} className="text-purple-500 shrink-0" /> : task.type === 'turnover' ? <AlertCircle size={16} className="text-orange-500 shrink-0" /> : <Coffee size={16} className="text-blue-500 shrink-0" />}
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
                          <option value="" disabled>Delegar para...</option>
                          {maids.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
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

                  {task.status === 'waiting_conference' && (userData?.role === 'super_admin' || userData?.role === 'admin' || userData?.role === 'governance') && (
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

  return (
    <div className="h-full flex flex-col space-y-4 md:space-y-6 p-4 md:p-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quadro de Governança</h1>
          <p className="text-sm text-muted-foreground mt-1">Sincronizado em tempo real com a equipe de campo.</p>
        </div>
        <div className="flex gap-3">
          {(userData?.role === 'super_admin' || userData?.role === 'admin' || userData?.role === 'governance') && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 py-2 bg-secondary text-foreground rounded-xl text-xs font-bold uppercase hover:bg-accent transition-all border border-border flex items-center gap-2 shadow-sm"
            >
              <Settings2 size={14} /> Procedimentos
            </button>
          )}

          <button onClick={() => setIsArchiveOpen(true)} className="hidden md:flex flex-row px-4 py-2 bg-secondary text-foreground rounded-xl text-xs font-bold uppercase hover:bg-accent transition-all border border-border items-center gap-2 shadow-sm">
            <Archive size={14} /> Arquivo
          </button>

          <button onClick={() => { setSelectedTask(null); setIsManagerOpen(true); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase hover:opacity-90 transition-all shadow-sm flex items-center gap-2">
            <Plus size={14} /> Nova Tarefa
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-6 h-full min-w-max pb-4">
          <KanbanColumn title="A Fazer" icon={ClipboardCheck} colorClass="text-zinc-500" items={pendingTasks} />
          <KanbanColumn title="Limpando" icon={Sparkles} colorClass="text-blue-500" items={inProgressTasks} />
          <KanbanColumn title="Conferência" icon={AlertCircle} colorClass="text-orange-500" items={waitingTasks} />
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
      <HousekeepingChecklistModal isOpen={isChecklistOpen} onClose={() => setIsChecklistOpen(false)} task={selectedTask} cabinName={selectedTask ? (selectedTask.structureId ? structures[selectedTask.structureId]?.name : cabins[selectedTask.cabinId || ""]?.name || "") : ""} onComplete={() => { }} />
      <MinibarModal isOpen={isMinibarOpen} onClose={() => setIsMinibarOpen(false)} task={selectedTask} cabinName={selectedTask ? (selectedTask.structureId ? structures[selectedTask.structureId]?.name : cabins[selectedTask.cabinId || ""]?.name || "") : ""} />

      <HousekeepingTaskManagerModal
        isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)}
        propertyId={property.id} task={selectedTask} cabins={cabins} structures={structures} maids={maids}
      />

      {/* MODAL DE ARQUIVO (últimos 7 dias) */}
      {isArchiveOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border w-full max-w-3xl rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <header className="p-6 border-b border-border flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-black uppercase text-foreground tracking-tighter flex items-center gap-2">
                  <Archive size={20} className="text-muted-foreground" />
                  Arquivo de Governança
                </h2>
                <p className="text-xs text-muted-foreground font-medium mt-1">
                  Atividades de limpeza concluídas na última semana.
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
                            {task.structureId ? (structures[task.structureId]?.name || "Estrutura") : (cabins[task.cabinId!]?.name || "Cabana")}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                          {task.structureId ? 'Estrutura' : task.type === 'turnover' ? 'Faxina de Troca' : 'Arrumação Diária'}
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded font-bold uppercase">
                            Liberado
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                            <CalendarIcon size={10} />
                            {task.finishedAt ? new Date(task.finishedAt).toLocaleDateString('pt-BR') : ''}
                          </span>
                          <span className="text-[10px] text-foreground/50 font-bold uppercase">• Resp: {assignedNames}</span>
                        </div>
                      </div>
                    </div>
                  )
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
