// src/app/admin/governance/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { HousekeepingService } from "@/services/housekeeping-service";
import { CabinService } from "@/services/cabin-service";
import { StructureService } from "@/services/structure-service";
import { StaffService } from "@/services/staff-service";
import { supabase } from "@/lib/supabase";
import { HousekeepingTask, Cabin, Staff, Structure } from "@/types/aura";
import { PropertyMapGrid, ActiveStayInfo } from "@/components/admin/PropertyMapGrid";
import {
  Sparkles, CheckCircle2, AlertCircle,
  ClipboardCheck, Moon, LayoutDashboard,
  Timer, Users, ArrowRight, FileText, Printer, X,
  LogIn, LogOut, BedDouble, Minus
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// -------------------------------------------------------
// RELATÓRIO MODAL
// -------------------------------------------------------

const TASK_TYPE_LABELS: Record<string, string> = {
  turnover: 'Faxina completa',
  daily: 'Diária',
  linen_change: 'Arrumação c/ troca',
  inspection_checkin: 'Inspeção c/in',
  inspection_checkout: 'Inspeção c/out',
  custom: 'Personalizada',
};

const CABIN_STATUS_LABELS: Record<string, string> = {
  available: 'Disponível',
  occupied: 'Ocupada',
  cleaning: 'Em limpeza',
  maintenance: 'Manutenção',
};

interface ReportArrival {
  cabinId: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
}

function GovernanceReportModal({
  propertyName,
  cabins,
  tasks,
  maids,
  activeStays,
  reportArrivals,
  onClose,
}: {
  propertyName: string;
  cabins: Record<string, Cabin>;
  tasks: HousekeepingTask[];
  maids: Staff[];
  activeStays: ActiveStayInfo[];
  reportArrivals: ReportArrival[];
  onClose: () => void;
}) {
  const now = new Date();
  const todayStr = now.toDateString();
  const dateLabel = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const sortedCabins = Object.values(cabins).sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true })
  );

  function getLastCleaning(cabinId: string): string {
    const completed = tasks
      .filter(t => t.cabinId === cabinId && t.status === 'completed' && t.finishedAt)
      .sort((a, b) =>
        new Date(b.finishedAt as string).getTime() - new Date(a.finishedAt as string).getTime()
      );
    if (!completed.length) return '—';
    const task = completed[0];
    const names = (task.assignedTo || [])
      .map(id => maids.find(m => m.id === id)?.fullName?.split(' ')[0])
      .filter(Boolean).join(', ') || '—';
    const date = new Date(task.finishedAt as string).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit',
    });
    return `${names} · ${date}`;
  }

  function getActiveTaskType(cabinId: string): string | null {
    const priority = ['turnover', 'inspection_checkin', 'inspection_checkout', 'linen_change', 'daily', 'custom'];
    const active = tasks
      .filter(t => t.cabinId === cabinId && ['pending', 'in_progress', 'waiting_conference', 'paused'].includes(t.status))
      .sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
    return active.length ? active[0].type : null;
  }

  function getStayInfo(cabinId: string): { guestName: string; checkIn: string; checkOut: string } | null {
    const active = activeStays.find(s => s.cabinId === cabinId);
    if (active) return { guestName: active.guestName, checkIn: active.checkIn, checkOut: active.checkOut };
    const arrival = reportArrivals.find(a => a.cabinId === cabinId);
    if (arrival) return { guestName: arrival.guestName, checkIn: arrival.checkIn, checkOut: arrival.checkOut };
    return null;
  }

  const fmt = (d?: string) =>
    d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';

  // Cabins arriving today (active already checked-in today OR confirmed arrivals)
  const arrivalCabinIds = new Set([
    ...activeStays
      .filter(s => s.checkIn && new Date(s.checkIn).toDateString() === todayStr)
      .map(s => s.cabinId),
    ...reportArrivals
      .filter(a => new Date(a.checkIn).toDateString() === todayStr)
      .map(a => a.cabinId),
  ]);

  // Cabins checking out today
  const checkoutCabinIds = new Set(
    activeStays
      .filter(s => new Date(s.checkOut).toDateString() === todayStr)
      .map(s => s.cabinId)
  );

  const entriesToday = sortedCabins.filter(c => arrivalCabinIds.has(c.id));
  // Checkout cabins that are NOT also arrival cabins (same-day turnover)
  const checkoutsToday = sortedCabins.filter(c => checkoutCabinIds.has(c.id) && !arrivalCabinIds.has(c.id));
  // Occupied cabins with no arrival/departure today
  const occupiedDaily = sortedCabins.filter(c =>
    activeStays.some(s => s.cabinId === c.id) &&
    !arrivalCabinIds.has(c.id) &&
    !checkoutCabinIds.has(c.id)
  );

  function CabinTableRow({ cabin, highlight }: { cabin: Cabin; highlight?: string }) {
    const stay = getStayInfo(cabin.id);
    const taskType = getActiveTaskType(cabin.id);
    const lastClean = getLastCleaning(cabin.id);

    return (
      <tr className={cn(
        "border-b border-border/20 text-sm",
        highlight === 'entry' && "bg-emerald-500/5",
        highlight === 'checkout' && "bg-orange-500/5",
        highlight === 'daily' && "bg-blue-500/5",
      )}>
        <td className="py-2 px-3 font-bold whitespace-nowrap">
          {cabin.number ? `Cabana ${cabin.number}` : cabin.name}
        </td>
        <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
          {cabin.category || '—'}
        </td>
        <td className="py-2 px-3 text-xs whitespace-nowrap">
          <span className={cn(
            "font-semibold",
            cabin.status === 'available' && "text-emerald-400",
            cabin.status === 'occupied' && "text-blue-400",
            cabin.status === 'cleaning' && "text-orange-400",
            cabin.status === 'maintenance' && "text-red-400",
          )}>
            {CABIN_STATUS_LABELS[cabin.status] ?? cabin.status}
          </span>
        </td>
        <td className="py-2 px-3 text-xs whitespace-nowrap">
          {taskType
            ? <span className="text-yellow-400 font-semibold">{TASK_TYPE_LABELS[taskType]}</span>
            : <span className="text-muted-foreground">—</span>
          }
        </td>
        <td className="py-2 px-3 text-xs max-w-[140px] truncate">
          {stay?.guestName ?? <span className="text-muted-foreground">—</span>}
        </td>
        <td className="py-2 px-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
          {fmt(stay?.checkIn)}
        </td>
        <td className="py-2 px-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
          {fmt(stay?.checkOut)}
        </td>
        <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
          {lastClean}
        </td>
      </tr>
    );
  }

  function SectionTable({ title, cabinList, highlight, emptyMsg }: {
    title: React.ReactNode;
    cabinList: Cabin[];
    highlight?: string;
    emptyMsg: string;
  }) {
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
        {cabinList.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">{emptyMsg}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/30">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 px-3 font-bold">Cabana</th>
                  <th className="py-2 px-3 font-bold">Categoria</th>
                  <th className="py-2 px-3 font-bold">Estado</th>
                  <th className="py-2 px-3 font-bold">Tarefa</th>
                  <th className="py-2 px-3 font-bold">Hóspede</th>
                  <th className="py-2 px-3 font-bold">C/In</th>
                  <th className="py-2 px-3 font-bold">C/Out</th>
                  <th className="py-2 px-3 font-bold">Última limpeza</th>
                </tr>
              </thead>
              <tbody>
                {cabinList.map(cabin => (
                  <CabinTableRow key={cabin.id} cabin={cabin} highlight={highlight} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Print styles: hide everything except the report */}
      <style>{`
        @media print {
          body > * { visibility: hidden !important; }
          #gv-report-root, #gv-report-root * { visibility: visible !important; }
          #gv-report-root {
            position: fixed; inset: 0; overflow: auto;
            background: white !important; color: black !important;
          }
          .no-print { display: none !important; }

          /* Força fundo branco e texto preto em todos os elementos */
          #gv-report-root * {
            background: transparent !important;
            background-color: transparent !important;
            color: black !important;
            border-color: #999 !important;
            box-shadow: none !important;
            text-decoration: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Tabelas com bordas visíveis */
          #gv-report-root table { border: 1px solid #999 !important; border-collapse: collapse !important; }
          #gv-report-root th, #gv-report-root td { border: 1px solid #bbb !important; padding: 4px 8px !important; }
          #gv-report-root thead tr { background: #eee !important; }
          #gv-report-root thead tr * { background: #eee !important; font-weight: bold !important; }

          /* Cards de resumo com borda */
          #gv-report-root [class*="rounded"] { border: 1px solid #999 !important; }

          /* Quebra de página controlada */
          #gv-report-root h3 { page-break-before: auto; }
          #gv-report-root table { page-break-inside: auto; }
          #gv-report-root tr { page-break-inside: avoid; }
        }
      `}</style>

      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm no-print" onClick={onClose} />

      {/* Modal */}
      <div
        id="gv-report-root"
        className="fixed inset-0 z-50 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="min-h-full flex flex-col">
          <div className="bg-background border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-10 no-print">
            <div className="flex items-center gap-2 text-sm font-bold">
              <FileText size={16} className="text-primary" />
              Relatório de Governança
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition"
              >
                <Printer size={14} />
                Imprimir / Salvar PDF
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-muted rounded-xl transition"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 bg-background px-6 py-6 max-w-6xl w-full mx-auto space-y-8">
            {/* Header do relatório */}
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight">Relatório de Governança</h1>
              <p className="text-sm text-muted-foreground capitalize">{propertyName} · {dateLabel} · {timeLabel}</p>
            </div>

            {/* Cards de resumo */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border border-emerald-500/20 rounded-2xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                  <LogIn size={13} />
                  Entradas Hoje
                </div>
                <p className="text-3xl font-black text-emerald-400">{entriesToday.length}</p>
                <p className="text-[10px] text-muted-foreground">revisão pré-chegada</p>
              </div>
              <div className="bg-card border border-orange-500/20 rounded-2xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wider">
                  <LogOut size={13} />
                  Check-outs
                </div>
                <p className="text-3xl font-black text-orange-400">{checkoutsToday.length}</p>
                <p className="text-[10px] text-muted-foreground">faxina completa</p>
              </div>
              <div className="bg-card border border-blue-500/20 rounded-2xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
                  <BedDouble size={13} />
                  Ocupadas
                </div>
                <p className="text-3xl font-black text-blue-400">{occupiedDaily.length}</p>
                <p className="text-[10px] text-muted-foreground">limpeza diária</p>
              </div>
            </div>

            {/* Seção: Entradas hoje */}
            <SectionTable
              title={<span className="flex items-center gap-2"><LogIn size={12} className="text-emerald-400" /> Entradas Hoje — Revisão pré-chegada</span>}
              cabinList={entriesToday}
              highlight="entry"
              emptyMsg="Nenhuma entrada prevista para hoje."
            />

            {/* Seção: Check-outs */}
            <SectionTable
              title={<span className="flex items-center gap-2"><LogOut size={12} className="text-orange-400" /> Check-outs — Faxina completa</span>}
              cabinList={checkoutsToday}
              highlight="checkout"
              emptyMsg="Nenhum check-out previsto para hoje."
            />

            {/* Seção: Ocupadas / Diária */}
            <SectionTable
              title={<span className="flex items-center gap-2"><BedDouble size={12} className="text-blue-400" /> Ocupadas — Limpeza diária</span>}
              cabinList={occupiedDaily}
              highlight="daily"
              emptyMsg="Nenhuma cabana ocupada com limpeza diária hoje."
            />

            {/* Relatório completo */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Minus size={10} />
                Relatório Completo — Todas as Cabanas
              </h3>
              <div className="overflow-x-auto rounded-xl border border-border/30">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 px-3 font-bold">Cabana</th>
                      <th className="py-2 px-3 font-bold">Categoria</th>
                      <th className="py-2 px-3 font-bold">Estado</th>
                      <th className="py-2 px-3 font-bold">Tarefa atual</th>
                      <th className="py-2 px-3 font-bold">Hóspede</th>
                      <th className="py-2 px-3 font-bold">C/In</th>
                      <th className="py-2 px-3 font-bold">C/Out</th>
                      <th className="py-2 px-3 font-bold">Última limpeza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCabins.map(cabin => {
                      const highlight = arrivalCabinIds.has(cabin.id)
                        ? 'entry'
                        : checkoutCabinIds.has(cabin.id)
                        ? 'checkout'
                        : activeStays.some(s => s.cabinId === cabin.id)
                        ? 'daily'
                        : undefined;
                      return <CabinTableRow key={cabin.id} cabin={cabin} highlight={highlight} />;
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground pb-8">
              Gerado em {dateLabel} às {timeLabel} · Sistema Aura Experience
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// -------------------------------------------------------
// PÁGINA PRINCIPAL
// -------------------------------------------------------

export default function GovernancePage() {
  const { currentProperty: property, loading: isLoading } = useProperty();
  const { userData } = useAuth();

  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [cabins, setCabins] = useState<Record<string, Cabin>>({});
  const [structures, setStructures] = useState<Record<string, Structure>>({});
  const [maids, setMaids] = useState<Staff[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [activeStays, setActiveStays] = useState<ActiveStayInfo[]>([]);
  const [staysLoading, setStaysLoading] = useState(true);

  // Report state
  const [showReport, setShowReport] = useState(false);
  const [reportArrivals, setReportArrivals] = useState<{ cabinId: string; guestName: string; checkIn: string; checkOut: string }[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (!property) return;

    let unsubscribe: () => void;

    const fetchActiveStays = async () => {
      setStaysLoading(true);
      try {
        const { data: staysData } = await supabase
          .from('stays')
          .select('id, cabinId, hasPet, checkIn, checkOut, guestId')
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
          checkIn: s.checkIn,
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

  const openReport = useCallback(async () => {
    if (!property) return;
    setReportLoading(true);
    try {
      const todayISO = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const { data: arrivalsData } = await supabase
        .from('stays')
        .select('id, cabinId, checkIn, checkOut, guestId')
        .eq('propertyId', property.id)
        .gte('checkIn', todayISO)
        .lte('checkIn', `${todayISO}T23:59:59`)
        .neq('status', 'cancelled');

      const rows = arrivalsData || [];
      const guestIds = Array.from(new Set(rows.map((s: any) => s.guestId).filter(Boolean))) as string[];
      let guestMap: Record<string, string> = {};
      if (guestIds.length > 0) {
        const { data: guestsData } = await supabase
          .from('guests')
          .select('id, fullName')
          .in('id', guestIds);
        (guestsData || []).forEach((g: any) => { guestMap[g.id] = g.fullName; });
      }

      setReportArrivals(rows.map((s: any) => ({
        cabinId: s.cabinId,
        guestName: guestMap[s.guestId] ?? 'Hóspede',
        checkIn: s.checkIn,
        checkOut: s.checkOut,
      })));
    } catch {
      toast.error("Erro ao gerar relatório.");
    } finally {
      setReportLoading(false);
      setShowReport(true);
    }
  }, [property]);

  if (isLoading || loadingInitial) {
    return <div className="flex h-[80vh] items-center justify-center w-full"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!property) {
    return <div className="flex h-[80vh] items-center justify-center text-muted-foreground">Selecione uma propriedade no menu lateral.</div>;
  }

  if (userData?.role === 'maid') {
    window.location.href = '/governanta';
    return null;
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
        <button
          onClick={openReport}
          disabled={reportLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-secondary border border-border rounded-xl text-xs font-bold hover:bg-accent transition-all disabled:opacity-60"
        >
          {reportLoading
            ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <FileText size={14} />
          }
          Relatório
        </button>
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

      {/* RELATÓRIO MODAL */}
      {showReport && (
        <GovernanceReportModal
          propertyName={property.name}
          cabins={cabins}
          tasks={tasks}
          maids={maids}
          activeStays={activeStays}
          reportArrivals={reportArrivals}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
