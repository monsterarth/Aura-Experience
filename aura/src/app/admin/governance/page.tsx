// src/app/admin/governance/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { HousekeepingService } from "@/services/housekeeping-service";
import { CabinService } from "@/services/cabin-service";
import { StructureService } from "@/services/structure-service";
import { StaffService } from "@/services/staff-service";
import { supabase } from "@/lib/supabase";
import { HousekeepingTask, Cabin, Staff, Structure } from "@/types/aura";
import { MaidMobileApp } from "@/components/admin/MaidMobileApp";
import { StaffMobileHub } from "@/components/admin/StaffMobileHub";
import { PropertyMapGrid, ActiveStayInfo } from "@/components/admin/PropertyMapGrid";
import {
  Sparkles, CheckCircle2, AlertCircle,
  ClipboardCheck, Moon, LayoutDashboard, Smartphone,
  Timer, Users, ArrowRight
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

  const [activeStays, setActiveStays] = useState<ActiveStayInfo[]>([]);
  const [staysLoading, setStaysLoading] = useState(true);

  useEffect(() => {
    if (!property) return;

    let unsubscribe: () => void;

    const fetchActiveStays = async () => {
      setStaysLoading(true);
      try {
        const { data: staysData } = await supabase
          .from('stays')
          .select('id, cabinId, hasPet, checkOut, guestId')
          .eq('propertyId', property.id)
          .eq('status', 'active');

        const rows = staysData || [];
        const guestIds = Array.from(new Set(rows.map((s: any) => s.guestId).filter(Boolean))) as string[];
        let guestMap: Record<string, string> = {};
        if (guestIds.length > 0) {
          const { data: guestsData } = await supabase
            .from('guests')
            .select('id, fullName')
            .in('id', guestIds);
          (guestsData || []).forEach((g: any) => { guestMap[g.id] = g.fullName; });
        }

        setActiveStays(rows.map((s: any) => ({
          id: s.id,
          cabinId: s.cabinId,
          hasPet: s.hasPet ?? false,
          checkOut: s.checkOut,
          guestName: guestMap[s.guestId] ?? 'Hóspede',
        })));
      } catch {
        // silently fail — not critical
      } finally {
        setStaysLoading(false);
      }
    };

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
    fetchActiveStays();

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
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">Mapa</p>
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

  // ---- PAINEL DE COMANDO: métricas derivadas ----
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'paused');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const waitingTasks = tasks.filter(t => t.status === 'waiting_conference');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const skippedTasks = tasks.filter(t => t.status === 'skipped');

  const completedToday = completedTasks.filter(t => {
    const d = t.finishedAt ? new Date(t.finishedAt as string) : null;
    if (!d) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return d >= today;
  });

  const avgMinutes = (() => {
    const finished = completedToday.filter(t => t.startedAt && t.finishedAt);
    if (!finished.length) return null;
    const avg = finished.reduce((acc, t) => {
      return acc + (new Date(t.finishedAt as string).getTime() - new Date(t.startedAt as string).getTime());
    }, 0) / finished.length / 60000;
    return Math.round(avg);
  })();

  const unassigned = pendingTasks.filter(t => !t.assignedTo?.length);
  const maidsOnField = new Set(
    inProgressTasks.flatMap(t => Array.isArray(t.assignedTo) ? t.assignedTo : [])
  ).size;

  return (
    <div className="flex flex-col space-y-4 md:space-y-6 p-4 md:p-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mapa da Pousada</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral das cabanas, limpeza e hóspedes em tempo real.</p>
        </div>
      </div>

      {/* PAINEL DE COMANDO */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-card border border-white/5 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-zinc-500/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-zinc-400 mb-1">
            <ClipboardCheck size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">A Fazer</span>
          </div>
          <p className="text-3xl font-black">{pendingTasks.length}</p>
          {unassigned.length > 0 && (
            <p className="text-[10px] text-orange-400 font-semibold">{unassigned.length} sem responsável</p>
          )}
        </div>

        <div className="bg-card border border-blue-500/20 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-blue-400 mb-1">
            <Sparkles size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Limpando</span>
          </div>
          <p className="text-3xl font-black text-blue-400">{inProgressTasks.length}</p>
          {maidsOnField > 0 && (
            <p className="text-[10px] text-muted-foreground">{maidsOnField} camareira{maidsOnField !== 1 ? 's' : ''} em campo</p>
          )}
        </div>

        <div className={cn(
          "bg-card border rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden",
          waitingTasks.length > 0 ? "border-orange-500/30" : "border-white/5"
        )}>
          <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-orange-400 mb-1">
            <AlertCircle size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Conferência</span>
          </div>
          <p className={cn("text-3xl font-black", waitingTasks.length > 0 ? "text-orange-400" : "")}>{waitingTasks.length}</p>
          {waitingTasks.length > 0 && (
            <p className="text-[10px] text-orange-400 font-semibold animate-pulse">Aguardando aprovação</p>
          )}
        </div>

        <div className="bg-card border border-emerald-500/20 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-emerald-400 mb-1">
            <CheckCircle2 size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Concluídas</span>
          </div>
          <p className="text-3xl font-black text-emerald-400">{completedToday.length}</p>
          <p className="text-[10px] text-muted-foreground">hoje</p>
        </div>

        <div className="bg-card border border-white/5 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-primary mb-1">
            <Timer size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Tempo Médio</span>
          </div>
          <p className="text-3xl font-black">{avgMinutes != null ? `${avgMinutes}` : '—'}</p>
          <p className="text-[10px] text-muted-foreground">{avgMinutes != null ? 'minutos / faxina' : 'sem dados hoje'}</p>
        </div>

        <div className="bg-card border border-white/5 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-500/10 rounded-full blur-2xl -mr-4 -mt-4 pointer-events-none" />
          <div className="flex items-center gap-2 text-yellow-500 mb-1">
            <Moon size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">DND / Puladas</span>
          </div>
          <p className="text-3xl font-black">{skippedTasks.length + tasks.filter(t => t.status === 'paused').length}</p>
          <p className="text-[10px] text-muted-foreground">não perturbadas</p>
        </div>
      </div>

      {/* Equipe em campo */}
      {inProgressTasks.length > 0 && (
        <div className="bg-blue-500/5 border border-blue-500/15 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-3 flex items-center gap-2">
            <Users size={12} /> Equipe em campo agora
          </p>
          <div className="flex flex-wrap gap-2">
            {inProgressTasks.map(task => {
              const safeAssigned = Array.isArray(task.assignedTo) ? task.assignedTo : [];
              const names = safeAssigned.map(id => maids.find(m => m.id === id)?.fullName.split(' ')[0]).filter(Boolean);
              const location = task.customLocation ||
                (task.structureId ? structures[task.structureId]?.name : cabins[task.cabinId!]?.name) || '—';
              const elapsed = task.startedAt
                ? Math.round((Date.now() - new Date(task.startedAt as string).getTime()) / 60000)
                : null;
              return (
                <div key={task.id} className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-xs font-bold text-blue-300">{location}</span>
                  {names.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">— {names.join(', ')}</span>
                  )}
                  {elapsed != null && (
                    <span className="text-[10px] text-blue-500/60 font-mono">{elapsed} min</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MAPA DA POUSADA */}
      <PropertyMapGrid
        cabins={cabins}
        tasks={tasks}
        activeStays={activeStays}
        staysLoading={staysLoading}
      />

      {/* CTA → Kanban */}
      <Link
        href="/admin/governance/kanban"
        className="flex items-center justify-center gap-2 w-full py-3 bg-secondary border border-border rounded-2xl text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
      >
        <LayoutDashboard size={14} />
        Ver Kanban de Tarefas
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}
