// src/components/admin/MaidMobileApp.tsx
"use client";

import React, { useState } from "react";
import { HousekeepingTask, Cabin } from "@/types/aura";
import { HousekeepingChecklistModal } from "./HousekeepingChecklistModal";
import { MinibarModal } from "./MinibarModal";
import { HousekeepingService } from "@/services/housekeeping-service";
import { Sparkles, ClipboardCheck, Coffee, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";
import { deleteCookie } from "cookies-next";
import { useRouter } from "next/navigation";

interface MaidMobileAppProps {
  propertyId: string;
  userData: any;
  tasks: HousekeepingTask[];
  cabins: Record<string, Cabin>;
  onRefresh: () => void;
}

export function MaidMobileApp({ propertyId, userData, tasks, cabins, onRefresh }: MaidMobileAppProps) {
  const router = useRouter();
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [isMinibarOpen, setIsMinibarOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<HousekeepingTask | null>(null);

  // Filtros: Minhas tarefas específicas
  const myTasks = tasks.filter(t => t.assignedTo === userData?.id && t.status !== 'completed');
  const activeTasks = myTasks.filter(t => t.status === 'in_progress');
  const pendingTasks = myTasks.filter(t => t.status === 'pending');
  const waitingTasks = myTasks.filter(t => t.status === 'waiting_conference');

  // Filtro Global: Check-outs recém efetuados que qualquer camareira pode lançar o frigobar
  // Mostra tarefas turnover pendentes que NÃO estão na lista direta desta camareira
  const globalPendingTurnovers = tasks.filter(t => t.status === 'pending' && t.type === 'turnover' && t.assignedTo !== userData?.id);

  const handleStart = async (taskId: string) => {
    try {
      await HousekeepingService.startTask(propertyId, taskId, userData.id, userData.name);
      toast.success("Bom trabalho! Limpeza iniciada.");
      onRefresh();
    } catch (e) {
      toast.error("Erro ao iniciar a tarefa.");
    }
  };

  const handleAssignToMe = async (taskId: string) => {
    try {
      await HousekeepingService.assignTask(propertyId, taskId, userData.id, userData.id, userData.name);
      toast.success("Tarefa assumida com sucesso!");
      onRefresh();
    } catch (e) {
      toast.error("Erro ao assumir a tarefa.");
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    deleteCookie('aura-session');
    router.push('/admin/login');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col max-w-md mx-auto shadow-2xl border-x border-border">
      
      {/* Header Mobile */}
      <header className="bg-primary text-primary-foreground p-6 rounded-b-[2rem] shadow-md shrink-0">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Olá, {userData?.name?.split(' ')[0]}!</h1>
            <p className="text-primary-foreground/80 text-sm font-medium">Você tem {pendingTasks.length + activeTasks.length} cabanas para hoje.</p>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-black text-xl backdrop-blur-sm">
            {userData?.name?.charAt(0) || "C"}
          </div>
        </div>
      </header>

      {/* Corpo da Lista */}
      <main className="flex-1 p-4 space-y-6 overflow-y-auto custom-scrollbar pb-24">
        
        {/* TAREFAS DE CHECK-OUT GLOBAIS (FRIGOBAR EXPRESS) */}
        {globalPendingTurnovers.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-blue-500 flex items-center gap-2">
              <Coffee size={16} /> Check-outs Recentes
            </h2>
            <p className="text-[10px] text-muted-foreground -mt-2 mb-3 leading-tight">
              Acesso livre para toda a equipe lançar o frigobar antes da arrumação.
            </p>
            {globalPendingTurnovers.map(task => (
              <div key={task.id} className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-2xl shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black text-foreground">
                    {cabins[task.cabinId]?.name || `Cabana ${task.cabinId}`}
                  </h3>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }}
                    className="flex-1 py-3 bg-blue-600 text-white font-black text-xs uppercase rounded-xl active:scale-95 transition-transform flex justify-center items-center gap-2 shadow-sm"
                  >
                    <Coffee size={16} /> Lançar Frigobar
                  </button>
                  <button 
                    onClick={() => handleAssignToMe(task.id)}
                    className="py-3 px-4 bg-background text-foreground font-black text-xs uppercase rounded-xl border border-border hover:bg-secondary active:scale-95 transition-transform"
                    title="Assumir Limpeza para mim"
                  >
                    Assumir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAREFAS EM ANDAMENTO */}
        {activeTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 mt-6">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Em Limpeza
            </h2>
            {activeTasks.map(task => (
              <div key={task.id} className="bg-green-500/10 border-2 border-green-500/30 p-4 rounded-2xl space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black text-green-600 dark:text-green-400">
                    {cabins[task.cabinId]?.name || `Cabana ${task.cabinId}`}
                  </h3>
                </div>
                <p className="text-xs font-bold uppercase text-green-600/70">
                  {task.type === 'turnover' ? 'Faxina Completa (Troca)' : 'Arrumação Diária'}
                </p>
                <div className="flex gap-2 pt-2">
                  {task.type === 'turnover' && (
                    <button 
                      onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }}
                      className="flex-1 py-3 bg-background text-blue-600 font-black text-xs uppercase rounded-xl border border-blue-500/20 active:scale-95 transition-transform flex justify-center items-center gap-2"
                    >
                      <Coffee size={16} /> Frigobar
                    </button>
                  )}
                  <button 
                    onClick={() => { setSelectedTask(task); setIsChecklistOpen(true); }}
                    className="flex-1 py-3 bg-green-600 text-white font-black text-xs uppercase rounded-xl active:scale-95 transition-transform flex justify-center items-center gap-2 shadow-lg shadow-green-500/30"
                  >
                    Finalizar <ClipboardCheck size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAREFAS A FAZER */}
        {pendingTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mt-6">Para Fazer (Minhas)</h2>
            {pendingTasks.map(task => (
              <div key={task.id} className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-4">
                <h3 className="text-xl font-black text-foreground">
                  {cabins[task.cabinId]?.name || `Cabana ${task.cabinId}`}
                </h3>
                <p className="text-xs font-bold uppercase text-muted-foreground">
                  {task.type === 'turnover' ? 'Faxina Completa' : 'Arrumação Diária'}
                </p>
                <div className="flex gap-2">
                  {task.type === 'turnover' && (
                    <button 
                      onClick={() => { setSelectedTask(task); setIsMinibarOpen(true); }}
                      className="flex-1 py-3 bg-secondary text-foreground font-black text-xs uppercase rounded-xl border border-border active:scale-95 transition-transform flex justify-center items-center gap-2"
                    >
                      <Coffee size={16} /> Frigobar
                    </button>
                  )}
                  <button 
                    onClick={() => handleStart(task.id)}
                    className="flex-1 py-3 bg-primary text-primary-foreground font-black text-sm uppercase rounded-xl active:scale-95 transition-transform flex justify-center items-center gap-2"
                  >
                    Iniciar <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAREFAS AGUARDANDO CONFERÊNCIA */}
        {waitingTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mt-6">Aguardando Governanta</h2>
            {waitingTasks.map(task => (
              <div key={task.id} className="bg-green-500/5 border border-green-500/20 p-4 rounded-2xl flex items-center justify-between opacity-70">
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {cabins[task.cabinId]?.name}
                  </h3>
                  <p className="text-[10px] uppercase font-bold text-green-600">Enviada para aprovação</p>
                </div>
                <CheckCircle2 size={24} className="text-green-500" />
              </div>
            ))}
          </div>
        )}

        {tasks.length === 0 && (
           <div className="flex flex-col items-center justify-center h-40 text-center space-y-3 opacity-50 mt-10">
              <Sparkles size={40} className="text-muted-foreground" />
              <p className="text-lg font-bold">Quadro Limpo</p>
              <p className="text-sm">Nenhuma tarefa pendente na pousada.</p>
           </div>
        )}
      </main>

      {/* Footer Fixo */}
      <footer className="p-4 border-t border-border bg-card shrink-0 flex justify-center">
        <button onClick={handleLogout} className="text-xs font-bold uppercase text-muted-foreground hover:text-destructive transition-colors">
          Sair do Sistema
        </button>
      </footer>

      {/* Modais */}
      <HousekeepingChecklistModal 
        isOpen={isChecklistOpen} onClose={() => setIsChecklistOpen(false)}
        task={selectedTask} cabinName={selectedTask ? (cabins[selectedTask.cabinId]?.name || "") : ""}
        onComplete={onRefresh}
      />
      <MinibarModal 
        isOpen={isMinibarOpen} onClose={() => setIsMinibarOpen(false)}
        task={selectedTask} cabinName={selectedTask ? (cabins[selectedTask.cabinId]?.name || "") : ""}
      />
    </div>
  );
}