// src/app/admin/maintenance/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { MaintenanceService } from "@/services/maintenance-service";
import { CabinService } from "@/services/cabin-service";
import { StructureService } from "@/services/structure-service";
import { StaffService } from "@/services/staff-service";
import { MaintenanceTask, Cabin, Structure, Staff } from "@/types/aura";
import { MaintenanceTaskManagerModal } from "@/components/admin/maintenance/MaintenanceTaskManagerModal";
import {
  Wrench, AlertCircle, CheckCircle2, PlayCircle, Plus,
  Timer, Users, ArrowRight, LayoutDashboard, Clock,
  Flame, TrendingUp, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PRIORITY_LABEL: Record<string, string> = { urgent: "Urgente", high: "Alta", medium: "Média", low: "Baixa" };
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-500 border-red-500/30 bg-red-500/10",
  high: "text-orange-500 border-orange-500/30 bg-orange-500/10",
  medium: "text-yellow-600 border-yellow-500/30 bg-yellow-500/10",
  low: "text-blue-500 border-blue-500/30 bg-blue-500/10",
};

export default function MaintenanceDashboardPage() {
  const { currentProperty: property, loading: isLoading } = useProperty();
  const { userData } = useAuth();

  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [structures, setStructures] = useState<Record<string, Structure>>({});
  const [technicians, setTechnicians] = useState<Staff[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  useEffect(() => {
    if (!property) return;

    let unsubscribe: () => void;

    const init = async () => {
      setLoadingInitial(true);
      try {
        const [cabinsData, structuresData, staffData] = await Promise.all([
          CabinService.getCabinsByProperty(property.id),
          StructureService.getStructures(property.id),
          StaffService.getStaffByProperty(property.id),
        ]);

        const cabinsDict: Record<string, Cabin> = {};
        cabinsData.forEach(c => cabinsDict[c.id] = c);
        setCabins(cabinsDict);

        const structuresDict: Record<string, Structure> = {};
        structuresData.forEach(s => structuresDict[s.id] = s);
        setStructures(structuresDict);

        setTechnicians(staffData.filter((s: Staff) => (s.role === 'maintenance' || s.role === 'technician') && s.active));

        unsubscribe = MaintenanceService.listenToActiveTasks(property.id, (realtimeTasks) => {
          setTasks(realtimeTasks);
        });
      } catch {
        toast.error("Erro ao conectar base de manutenção.");
      } finally {
        setLoadingInitial(false);
      }
    };

    init();
    return () => { if (unsubscribe) unsubscribe(); };
  }, [property]);

  if (isLoading || loadingInitial) {
    return <div className="flex h-[80vh] items-center justify-center w-full"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!property) {
    return <div className="flex h-[80vh] items-center justify-center text-muted-foreground">Selecione uma propriedade no menu lateral.</div>;
  }

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const pendingTasks   = tasks.filter(t => t.status === 'pending' || t.status === 'paused');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const waitingTasks   = tasks.filter(t => t.status === 'waiting_conference');
  const completedTasks  = tasks.filter(t => t.status === 'completed');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const completedToday = completedTasks.filter(t => {
    const d = t.finishedAt ? new Date(t.finishedAt as string) : null;
    return d ? d >= today : false;
  });

  const avgMinutes = (() => {
    const finished = completedToday.filter(t => t.startedAt && t.finishedAt);
    if (!finished.length) return null;
    const avg = finished.reduce((acc, t) =>
      acc + (new Date(t.finishedAt as string).getTime() - new Date(t.startedAt as string).getTime()), 0
    ) / finished.length / 60000;
    return Math.round(avg);
  })();

  const urgentTasks = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed' && t.status !== 'cancelled');
  const techsOnField = new Set(inProgressTasks.flatMap(t => Array.isArray(t.assignedTo) ? t.assignedTo : [])).size;
  const unassigned = pendingTasks.filter(t => !t.assignedTo?.length);

  function getLocation(task: MaintenanceTask) {
    if (task.cabinId) return cabins[task.cabinId]?.name ?? "Cabana";
    if (task.structureId) return structures[task.structureId]?.name ?? "Estrutura";
    return "—";
  }

  function getTechName(id: string) {
    return technicians.find(t => t.id === id)?.fullName.split(' ')[0] ?? id.slice(0, 6);
  }

  return (
    <div className="flex flex-col space-y-6 p-4 md:p-0">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manutenção</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral das ordens de serviço em tempo real.</p>
        </div>
        <button
          onClick={() => setIsManagerOpen(true)}
          className="px-4 py-2 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2 shadow-sm"
        >
          <Plus size={16} /> Nova OS
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-card border border-white/5 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-zinc-500/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-zinc-400 mb-1"><Wrench size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">Pendentes</span></div>
          <p className="text-3xl font-black">{pendingTasks.length}</p>
          {unassigned.length > 0 && <p className="text-[10px] text-orange-400 font-semibold">{unassigned.length} sem responsável</p>}
        </div>

        <div className="bg-card border border-blue-500/20 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-blue-400 mb-1"><PlayCircle size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">Em Andamento</span></div>
          <p className="text-3xl font-black text-blue-400">{inProgressTasks.length}</p>
          {techsOnField > 0 && <p className="text-[10px] text-muted-foreground">{techsOnField} técnico{techsOnField !== 1 ? 's' : ''} em campo</p>}
        </div>

        <div className={cn("bg-card border rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden", waitingTasks.length > 0 ? "border-orange-500/30" : "border-white/5")}>
          <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-orange-400 mb-1"><AlertCircle size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">Validação</span></div>
          <p className={cn("text-3xl font-black", waitingTasks.length > 0 ? "text-orange-400" : "")}>{waitingTasks.length}</p>
          {waitingTasks.length > 0 && <p className="text-[10px] text-orange-400 font-semibold animate-pulse">Aguardando aprovação</p>}
        </div>

        <div className="bg-card border border-emerald-500/20 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-emerald-400 mb-1"><CheckCircle2 size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">Concluídas</span></div>
          <p className="text-3xl font-black text-emerald-400">{completedToday.length}</p>
          <p className="text-[10px] text-muted-foreground">hoje</p>
        </div>

        <div className="bg-card border border-white/5 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-primary mb-1"><Timer size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">Tempo Médio</span></div>
          <p className="text-3xl font-black">{avgMinutes != null ? avgMinutes : '—'}</p>
          <p className="text-[10px] text-muted-foreground">{avgMinutes != null ? 'minutos / OS' : 'sem dados hoje'}</p>
        </div>

        <div className={cn("bg-card border rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden", urgentTasks.length > 0 ? "border-red-500/30" : "border-white/5")}>
          <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-red-400 mb-1"><Flame size={14} /><span className="text-[10px] font-bold uppercase tracking-wider">Urgentes</span></div>
          <p className={cn("text-3xl font-black", urgentTasks.length > 0 ? "text-red-400" : "")}>{urgentTasks.length}</p>
          {urgentTasks.length > 0 && <p className="text-[10px] text-red-400 font-semibold animate-pulse">Atenção imediata</p>}
        </div>
      </div>

      {/* Técnicos em campo */}
      {inProgressTasks.length > 0 && (
        <div className="bg-blue-500/5 border border-blue-500/15 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-3 flex items-center gap-2">
            <Users size={12} /> Técnicos em campo agora
          </p>
          <div className="flex flex-wrap gap-2">
            {inProgressTasks.map(task => {
              const safeAssigned = Array.isArray(task.assignedTo) ? task.assignedTo : [];
              const names = safeAssigned.map(getTechName).filter(Boolean);
              const elapsed = task.startedAt
                ? Math.round((Date.now() - new Date(task.startedAt as string).getTime()) / 60000)
                : null;
              return (
                <div key={task.id} className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-xs font-bold text-blue-300">{getLocation(task)}</span>
                  <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">{task.title}</span>
                  {names.length > 0 && <span className="text-[10px] text-muted-foreground">— {names.join(', ')}</span>}
                  {elapsed != null && <span className="text-[10px] text-blue-500/60 font-mono">{elapsed} min</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Urgentes em destaque */}
      {urgentTasks.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-3 flex items-center gap-2">
            <Flame size={12} /> Chamados urgentes
          </p>
          <div className="flex flex-col gap-2">
            {urgentTasks.slice(0, 5).map(task => (
              <div key={task.id} className="flex items-center gap-3 bg-red-500/8 border border-red-500/15 rounded-xl px-4 py-3">
                <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded border", PRIORITY_COLOR[task.priority])}>
                  {PRIORITY_LABEL[task.priority]}
                </span>
                <span className="text-sm font-bold text-foreground flex-1 truncate">{task.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{getLocation(task)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tarefas pendentes sem responsável */}
      {unassigned.length > 0 && (
        <div className="bg-orange-500/5 border border-orange-500/15 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-3 flex items-center gap-2">
            <Zap size={12} /> Sem responsável ({unassigned.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.slice(0, 8).map(task => (
              <div key={task.id} className="flex items-center gap-2 bg-orange-500/8 border border-orange-500/15 rounded-xl px-3 py-2">
                <span className={cn("text-[10px] font-black uppercase px-1.5 py-0.5 rounded border", PRIORITY_COLOR[task.priority])}>
                  {PRIORITY_LABEL[task.priority]}
                </span>
                <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">{task.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{getLocation(task)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA → Kanban */}
      <Link
        href="/admin/maintenance/kanban"
        className="flex items-center justify-center gap-2 w-full py-3 bg-secondary border border-border rounded-2xl text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
      >
        <LayoutDashboard size={14} />
        Ver Kanban de Tarefas
        <ArrowRight size={14} />
      </Link>

      <MaintenanceTaskManagerModal
        isOpen={isManagerOpen}
        onClose={() => setIsManagerOpen(false)}
        propertyId={property.id}
        task={null}
        cabins={cabins}
        structures={structures}
        technicians={technicians}
      />
    </div>
  );
}
