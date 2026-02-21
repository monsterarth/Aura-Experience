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
import { MinibarModal } from "@/components/admin/MinibarModal";
import { MaidMobileApp } from "@/components/admin/MaidMobileApp"; 
import { 
  Sparkles, Clock, CheckCircle2, AlertCircle, 
  Coffee, ArrowRight, ClipboardCheck, Plus, UserPlus
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
  const [loadingTasks, setLoadingTasks] = useState(true);

  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<HousekeepingTask | null>(null);
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);

  const loadData = async () => {
    if (!property) return;
    setLoadingTasks(true);
    try {
      const [tasksData, cabinsData, staffData] = await Promise.all([
        HousekeepingService.getActiveTasks(property.id),
        CabinService.getCabinsByProperty(property.id),
        StaffService.getStaffByProperty(property.id)
      ]);
      
      setTasks(tasksData);
      
      const cabinsDict: Record<string, Cabin> = {};
      cabinsData.forEach(c => cabinsDict[c.id] = c);
      setCabins(cabinsDict);

      setMaids(staffData.filter(s => s.role === 'maid' && s.active));

    } catch (error) {
      toast.error("Erro ao carregar os dados de governança.");
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [property]);

  if (isLoading || loadingTasks) {
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
      onRefresh={loadData} 
    />;
  }

  const handleAssignTask = async (taskId: string, maidId: string) => {
    if (!maidId) return;
    try {
      await HousekeepingService.assignTask(property.id, taskId, maidId, userData?.id || "unknown", userData?.fullName || "Admin");
      toast.success("Tarefa delegada com sucesso!");
      loadData();
    } catch (e) {
      toast.error("Erro ao delegar tarefa.");
    }
  };

  const handleStartTask = async (taskId: string) => {
    try {
      await HousekeepingService.startTask(property.id, taskId, userData?.id || "unknown", userData?.fullName || "Camareira");
      toast.success("Limpeza iniciada! Cronômetro rodando.");
      loadData();
    } catch (e) {
      toast.error("Erro ao iniciar a tarefa.");
    }
  };

  const handleConferTask = async (taskId: string, cabinId: string, approved: boolean) => {
    try {
      await HousekeepingService.conferTask(property.id, taskId, cabinId, approved, userData?.id || "unknown", userData?.fullName || "Governanta");
      toast.success(approved ? "Cabana liberada!" : "Enviada para repasse.");
      loadData();
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
        type: 'turnover', // Forçado para Turnover para testar o frigobar
        status: 'pending',
        checklist: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      toast.success("Tarefa de Turnover gerada!");
      loadData();
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
            const assignedMaid = maids.find(m => m.id === task.assignedTo);
            
            return (
              <div key={task.id} className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-4 hover:border-primary/50 transition-colors group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">
                      {task.type === 'turnover' ? 'Faxina de Troca' : 'Arrumação Diária'}
                    </p>
                    <h4 className="font-bold text-lg text-foreground leading-none">{cabins[task.cabinId]?.name || "Cabana " + task.cabinId}</h4>
                  </div>
                  {task.type === 'turnover' ? <AlertCircle size={16} className="text-orange-500" /> : <Coffee size={16} className="text-blue-500" />}
                </div>

                <div className="space-y-2">
                  {task.status === 'pending' ? (
                    <div className="flex flex-col gap-3">
                      {/* Seletor de Delegação */}
                      <div className="flex items-center gap-2 bg-secondary/50 p-2 rounded-lg border border-border">
                        <UserPlus size={14} className="text-muted-foreground shrink-0"/>
                        <select 
                          value={task.assignedTo || ""}
                          onChange={(e) => handleAssignTask(task.id, e.target.value)}
                          className="w-full bg-transparent text-xs font-bold uppercase outline-none cursor-pointer text-foreground"
                        >
                          <option value="" disabled>Delegar para...</option>
                          {maids.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                        </select>
                      </div>

                      {/* Botões Imediatos (Frigobar antes de Iniciar) */}
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
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded-md w-fit">
                      <CheckCircle2 size={12}/> Resp: <strong className="text-foreground">{assignedMaid?.fullName || "Não definida"}</strong>
                    </p>
                  )}
                </div>

                {/* Ações Avançadas (In Progress / Waiting) */}
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
          <p className="text-sm text-muted-foreground mt-1">Gestão de limpezas e delegação de camareiras.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleCreateMockTask} className="px-4 py-2 bg-secondary text-foreground rounded-xl text-xs font-bold uppercase hover:bg-accent transition-all border border-border flex items-center gap-2 shadow-sm">
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

      <HousekeepingChecklistModal isOpen={isChecklistOpen} onClose={() => setIsChecklistOpen(false)} task={selectedTask} cabinName={selectedTask ? (cabins[selectedTask.cabinId]?.name || "") : ""} onComplete={loadData} />
      <MinibarModal isOpen={isMinibarOpen} onClose={() => setIsMinibarOpen(false)} task={selectedTask} cabinName={selectedTask ? (cabins[selectedTask.cabinId]?.name || "") : ""} />
    </div>
  );
}