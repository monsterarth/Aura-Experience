// src/app/admin/governance/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { HousekeepingService } from "@/services/housekeeping-service";
import { CabinService } from "@/services/cabin-service";
import { StaffService } from "@/services/staff-service"; 
import { HousekeepingTask, Cabin, Staff } from "@/types/aura";
import { HousekeepingChecklistModal } from "@/components/admin/HousekeepingChecklistModal";
import { HousekeepingTaskManagerModal } from "@/components/admin/HousekeepingTaskManagerModal";
import { ChecklistSettingsModal } from "@/components/admin/ChecklistSettingsModal";
import { MinibarModal } from "@/components/admin/MinibarModal";
import { MaidMobileApp } from "@/components/admin/MaidMobileApp"; 
import { 
  Sparkles, Clock, CheckCircle2, AlertCircle, 
  Coffee, ArrowRight, ClipboardCheck, Plus, UserPlus, Settings2, Edit3, MessageSquare
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function GovernancePage() {
  const { property, isLoading } = useProperty() as any;
  const { userData } = useAuth();
  
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [maids, setMaids] = useState<Staff[]>([]); 
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<HousekeepingTask | null>(null);
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  useEffect(() => {
    if (!property) return;
    
    let unsubscribe: () => void;

    const init = async () => {
      setLoadingInitial(true);
      try {
        const [cabinsData, staffData] = await Promise.all([
          CabinService.getCabinsByProperty(property.id),
          StaffService.getStaffByProperty(property.id)
        ]);
        
        const cabinsDict: Record<string, Cabin> = {};
        cabinsData.forEach(c => cabinsDict[c.id] = c);
        setCabins(cabinsDict);

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
    return <MaidMobileApp 
      propertyId={property.id} 
      userData={userData} 
      tasks={tasks} 
      cabins={cabins} 
    />;
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

  const handleConferTask = async (taskId: string, cabinId: string, approved: boolean) => {
    try {
      await HousekeepingService.conferTask(property.id, taskId, cabinId, approved, userData?.id || "unknown", userData?.fullName || "Governanta");
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
      
      await addDoc(collection(db, "properties", property.id, "housekeeping_tasks"), {
        propertyId: property.id,
        cabinId: randomCabinId,
        stayId: "TESTE-MOCK", 
        type: 'turnover', 
        status: 'pending',
        assignedTo: [], // Garantindo que nascerá como Array
        checklist: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      toast.success("Tarefa de Turnover gerada!");
    } catch (e) {
      toast.error("Erro ao gerar tarefa.");
    }
  };

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const waitingTasks = tasks.filter(t => t.status === 'waiting_conference');
  const completedTasks = tasks.filter(t => t.status === 'completed');

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
                  <Edit3 size={16}/>
                </button>

                <div className="flex justify-between items-start">
                  <div className="pr-10">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">
                      {task.type === 'turnover' ? 'Faxina de Troca' : 'Arrumação Diária'}
                    </p>
                    <h4 className="font-bold text-lg text-foreground leading-none">{cabins[task.cabinId]?.name || "Cabana " + task.cabinId}</h4>
                  </div>
                  {task.type === 'turnover' ? <AlertCircle size={16} className="text-orange-500 shrink-0" /> : <Coffee size={16} className="text-blue-500 shrink-0" />}
                </div>

                <div className="space-y-2">
                  {task.status === 'pending' ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 bg-secondary/50 p-2 rounded-lg border border-border">
                        <UserPlus size={14} className="text-muted-foreground shrink-0"/>
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
                            <Coffee size={12}/> Frigobar
                          </button>
                        )}
                        <button onClick={() => handleStartTask(task.id)} className="flex-1 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground text-[10px] font-bold uppercase rounded-lg transition-all flex justify-center items-center gap-1">
                          <ArrowRight size={12}/> Iniciar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => { setSelectedTask(task); setIsManagerOpen(true); }}
                      className="w-full text-left text-[10px] text-muted-foreground flex items-center gap-1 bg-secondary/50 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors"
                    >
                      <CheckCircle2 size={12} className="shrink-0"/> 
                      <span className="truncate">Resp: <strong className="text-foreground">{assignedNames}</strong></span>
                    </button>
                  )}

                  {task.observations && (
                    <div className="text-[10px] text-orange-600 bg-orange-500/10 px-2 py-1.5 rounded-md flex items-start gap-1 line-clamp-2">
                      <MessageSquare size={12} className="shrink-0 mt-0.5"/>
                      <span>{task.observations}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-border flex gap-2">
                  {task.status === 'in_progress' && (
                    <>
                      <button onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }} className="flex-1 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-600 hover:text-white text-[10px] font-bold uppercase rounded-lg transition-all flex justify-center items-center gap-1">Frigobar</button>
                      <button onClick={() => { setSelectedTask(task); setIsChecklistOpen(true); }} className="flex-1 py-2 bg-green-600 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-green-700 transition-all flex justify-center items-center gap-1 shadow-sm">Finalizar <ClipboardCheck size={14}/></button>
                    </>
                  )}

                  {task.status === 'waiting_conference' && (userData?.role === 'super_admin' || userData?.role === 'admin' || userData?.role === 'governance') && (
                    <>
                      <button onClick={() => handleConferTask(task.id, task.cabinId, false)} className="flex-1 py-2 bg-red-500/10 text-red-600 text-[10px] font-bold uppercase rounded-lg hover:bg-red-500 hover:text-white transition-all">Reprovar</button>
                      <button onClick={() => handleConferTask(task.id, task.cabinId, true)} className="flex-1 py-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded-lg hover:opacity-90 transition-all shadow-sm">Liberar</button>
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
    <div className="h-full flex flex-col space-y-6">
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
              <Settings2 size={14}/> Procedimentos
            </button>
          )}

          <button onClick={() => { setSelectedTask(null); setIsManagerOpen(true); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold uppercase hover:opacity-90 transition-all shadow-sm flex items-center gap-2">
            <Plus size={14}/> Nova Tarefa
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-6 h-full min-w-max pb-4">
          <KanbanColumn title="A Fazer" icon={ClipboardCheck} colorClass="text-zinc-500" items={pendingTasks} />
          <KanbanColumn title="Limpando" icon={Sparkles} colorClass="text-blue-500" items={inProgressTasks} />
          <KanbanColumn title="Conferência" icon={AlertCircle} colorClass="text-orange-500" items={waitingTasks} />
          <KanbanColumn title="Pronto" icon={CheckCircle2} colorClass="text-green-500" items={completedTasks} />
        </div>
      </div>

      <ChecklistSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} propertyId={property.id} />
      <HousekeepingChecklistModal isOpen={isChecklistOpen} onClose={() => setIsChecklistOpen(false)} task={selectedTask} cabinName={selectedTask ? (cabins[selectedTask.cabinId]?.name || "") : ""} onComplete={() => {}} />
      <MinibarModal isOpen={isMinibarOpen} onClose={() => setIsMinibarOpen(false)} task={selectedTask} cabinName={selectedTask ? (cabins[selectedTask.cabinId]?.name || "") : ""} />
      
      <HousekeepingTaskManagerModal 
        isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)} 
        propertyId={property.id} task={selectedTask} cabins={cabins} maids={maids} 
      />
    </div>
  );
}