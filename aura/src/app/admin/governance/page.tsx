// src/app/admin/governance/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
  LogIn, LogOut, BedDouble, Minus, PawPrint
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
  hasPet?: boolean;
  counts?: { adults: number; children: number; babies: number };
  areaConfigs?: { areaId: string; configIndex: number }[];
}

function GovernanceReportModal({
  propertyName,
  cabins,
  tasks,
  maids,
  activeStays,
  reportArrivals,
  reportDate,
  onClose,
}: {
  propertyName: string;
  cabins: Record<string, Cabin>;
  tasks: HousekeepingTask[];
  maids: Staff[];
  activeStays: ActiveStayInfo[];
  reportArrivals: ReportArrival[];
  reportDate: Date;
  onClose: () => void;
}) {
  const now = new Date();
  const todayStr = reportDate.toDateString();
  const dateLabel = reportDate.toLocaleDateString('pt-BR', {
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

  type StayInfo = {
    guestName: string; checkIn: string; checkOut: string;
    hasPet?: boolean;
    counts?: { adults: number; children: number; babies: number };
    areaConfigs?: { areaId: string; configIndex: number }[];
  };

  function fromActive(s: ActiveStayInfo): StayInfo {
    return { guestName: s.guestName, checkIn: s.checkIn, checkOut: s.checkOut, hasPet: s.hasPet, counts: s.counts, areaConfigs: s.areaConfigs };
  }
  function fromArrival(a: ReportArrival): StayInfo {
    return { guestName: a.guestName, checkIn: a.checkIn, checkOut: a.checkOut, hasPet: a.hasPet, counts: a.counts, areaConfigs: a.areaConfigs };
  }

  // preferSource: 'arrival' = mostrar hóspede que entra | 'departure' = mostrar hóspede que sai
  function getStayInfo(cabinId: string, preferSource?: 'arrival' | 'departure'): StayInfo | null {
    const active = activeStays.find(s => s.cabinId === cabinId);
    const arrival = reportArrivals.find(a => a.cabinId === cabinId);
    if (preferSource === 'arrival') {
      return arrival ? fromArrival(arrival) : active ? fromActive(active) : null;
    }
    if (preferSource === 'departure') {
      return active ? fromActive(active) : arrival ? fromArrival(arrival) : null;
    }
    // Default: se a estadia ativa termina na data do relatório e há chegada, prefere chegada
    if (active && arrival) {
      const rd = new Date(todayStr); // já é a data do relatório
      if (new Date(active.checkOut).toDateString() === todayStr) return fromArrival(arrival);
    }
    return active ? fromActive(active) : arrival ? fromArrival(arrival) : null;
  }

  function fmtACF(counts?: { adults: number; children: number; babies: number }): string {
    if (!counts) return '—';
    const parts: string[] = [];
    if (counts.adults) parts.push(`${counts.adults}A`);
    if (counts.children) parts.push(`${counts.children}C`);
    if (counts.babies) parts.push(`${counts.babies}F`);
    return parts.join(' ') || '—';
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
  // Todas as saídas — incluindo same-day turnover (aparece em ambas as seções)
  const checkoutsToday = sortedCabins.filter(c => checkoutCabinIds.has(c.id));
  // Occupied cabins with no arrival/departure today
  const occupiedDaily = sortedCabins.filter(c =>
    activeStays.some(s => s.cabinId === c.id) &&
    !arrivalCabinIds.has(c.id) &&
    !checkoutCabinIds.has(c.id)
  );

  function CabinTableRow({ cabin, highlight, showSetup, preferSource }: { cabin: Cabin; highlight?: string; showSetup?: boolean; preferSource?: 'arrival' | 'departure' }) {
    const stay = getStayInfo(cabin.id, preferSource);
    const taskType = getActiveTaskType(cabin.id);
    const lastClean = getLastCleaning(cabin.id);
    const acf = fmtACF(stay?.counts);

    const rowBg = cn(
      "border-b border-border/20 text-sm",
      highlight === 'entry' && "bg-emerald-500/5",
      highlight === 'checkout' && "bg-orange-500/5",
      highlight === 'daily' && "bg-blue-500/5",
    );

    const setupAreas = showSetup && cabin.layout?.length
      ? cabin.layout.map(area => {
          const configIdx = stay?.areaConfigs?.find(c => c.areaId === area.id)?.configIndex ?? 0;
          const beds = area.configs[configIdx] ?? area.configs[0] ?? [];
          return { area, configIdx, beds, isNonStandard: configIdx > 0 };
        })
      : null;

    return (
      <>
        <tr className={rowBg}>
          <td className="py-2 px-3 whitespace-nowrap">
            <span className="font-bold">{cabin.number || cabin.name}</span>
            {cabin.category && (
              <span className="text-xs text-muted-foreground font-normal"> · {cabin.category}</span>
            )}
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
          <td className="py-2 px-3 text-xs max-w-[130px] truncate">
            {stay ? (
              <span className="flex items-center gap-1">
                <span className="truncate">{stay.guestName}</span>
                {stay.hasPet && <PawPrint size={10} className="text-amber-500 shrink-0" />}
              </span>
            ) : <span className="text-muted-foreground">—</span>}
          </td>
          <td className="py-2 px-3 text-xs font-mono whitespace-nowrap text-muted-foreground">{acf}</td>
          <td className="py-2 px-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{fmt(stay?.checkIn)}</td>
          <td className="py-2 px-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{fmt(stay?.checkOut)}</td>
          <td className="py-2 px-3 text-xs text-muted-foreground">{lastClean}</td>
        </tr>
        {setupAreas && (
          <tr className={cn("gv-setup-row border-b border-border/20", rowBg)}>
            <td colSpan={8} className="px-3 pb-2 pt-0">
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] pl-1 border-l-2 border-border/40 ml-1">
                {setupAreas.map(({ area, configIdx, beds, isNonStandard }) => (
                  <span key={area.id} className={cn(
                    "flex items-center gap-1",
                    isNonStandard ? "text-orange-400 font-bold" : "text-muted-foreground"
                  )}>
                    <span className="font-semibold text-foreground/70">{area.name}:</span>
                    {beds.map(b => b.label).join(' + ') || '—'}
                    {isNonStandard && (
                      <span className="print:hidden text-[9px] bg-orange-500/15 text-orange-400 px-1 rounded font-bold">
                        opção {configIdx + 1}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }

  function SectionTable({ title, cabinList, highlight, emptyMsg, showSetup, preferSource }: {
    title: React.ReactNode;
    cabinList: Cabin[];
    highlight?: string;
    emptyMsg: string;
    showSetup?: boolean;
    preferSource?: 'arrival' | 'departure';
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
                  <th className="py-2 px-3 font-bold">Estado</th>
                  <th className="py-2 px-3 font-bold">Tarefa</th>
                  <th className="py-2 px-3 font-bold">Hóspede</th>
                  <th className="py-2 px-3 font-bold">A/C/F</th>
                  <th className="py-2 px-3 font-bold">C/In</th>
                  <th className="py-2 px-3 font-bold">C/Out</th>
                  <th className="py-2 px-3 font-bold">Última limpeza</th>
                </tr>
              </thead>
              <tbody>
                {cabinList.map(cabin => (
                  <CabinTableRow key={cabin.id} cabin={cabin} highlight={highlight} showSetup={showSetup} preferSource={preferSource} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const modal = (
    <>
      {/* Print styles — portal garante que #gv-report-root é filho direto de body */}
      <style>{`
        @media print {
          /* Esconde todos os irmãos do modal no DOM */
          body > *:not(#gv-report-root) { display: none !important; }

          /* Modal flui normalmente em múltiplas páginas */
          html, body { overflow: visible !important; height: auto !important; margin: 0 !important; padding: 0 !important; }
          #gv-report-root {
            position: static !important;
            overflow: visible !important;
            height: auto !important;
            background: white !important;
            color: black !important;
            inset: auto !important;
          }

          /* Oculta chrome do modal */
          .gv-no-print { display: none !important; }

          /* Fundo branco e texto preto em tudo */
          #gv-report-root * {
            background: transparent !important;
            background-color: transparent !important;
            color: black !important;
            border-color: #aaa !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Conteúdo sem max-width e padding reduzido */
          #gv-report-root .gv-content {
            padding: 6px 10px !important;
            max-width: 100% !important;
          }
          /* Reduz espaçamento entre seções */
          #gv-report-root .gv-content > * + * { margin-top: 5px !important; }

          /* Tabelas */
          #gv-report-root table { border: 1px solid #999 !important; border-collapse: collapse !important; width: 100% !important; }
          #gv-report-root th, #gv-report-root td { border: 1px solid #ccc !important; padding: 1.5px 3px !important; font-size: 8px !important; line-height: 1.3 !important; }
          #gv-report-root thead tr { background: #eee !important; }
          #gv-report-root thead tr * { background: #eee !important; font-weight: bold !important; }

          /* Sub-linha de montagem */
          #gv-report-root .gv-setup-row td { border-top: none !important; padding: 0px 3px 2px !important; font-size: 7.5px !important; }

          /* Tipografia compacta */
          #gv-report-root h1 { font-size: 11px !important; margin: 0 0 0px !important; }
          #gv-report-root p.gv-subtitle { font-size: 8px !important; margin: 0 !important; }
          #gv-report-root h3 { font-size: 8px !important; margin: 3px 0 2px !important; }

          /* Hero compacto de impressão */
          #gv-report-root .gv-print-hero { margin-bottom: 4px !important; }
          #gv-report-root .gv-print-hero p { line-height: 1.1 !important; }

          /* Quebras de página */
          #gv-report-root table { page-break-inside: auto; }
          #gv-report-root tr { page-break-inside: avoid; }
        }
      `}</style>

      {/* Backdrop */}
      <div className="gv-no-print fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        id="gv-report-root"
        className="fixed inset-0 z-50 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="min-h-full flex flex-col">
          <div className="gv-no-print bg-background border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
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

          <div className="gv-content flex-1 bg-background px-6 py-6 max-w-6xl w-full mx-auto space-y-8">
            {/* Header do relatório */}
            <div className="space-y-0.5">
              <h1 className="text-xl font-black tracking-tight">Relatório de Governança</h1>
              <p className="gv-subtitle text-xs text-muted-foreground capitalize">{propertyName} · {dateLabel} · {timeLabel}</p>
            </div>

            {/* Cards de resumo — visíveis na tela */}
            <div className="grid grid-cols-3 gap-3 print:hidden">
              <div className="bg-card border border-emerald-500/20 rounded-2xl p-3 space-y-0.5">
                <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                  <LogIn size={11} /> Entradas
                </div>
                <p className="text-2xl font-black text-emerald-400">{entriesToday.length}</p>
                <p className="text-[9px] text-muted-foreground">revisão pré-chegada</p>
              </div>
              <div className="bg-card border border-orange-500/20 rounded-2xl p-3 space-y-0.5">
                <div className="flex items-center gap-1.5 text-orange-400 text-[10px] font-bold uppercase tracking-wider">
                  <LogOut size={11} /> Saídas
                </div>
                <p className="text-2xl font-black text-orange-400">{checkoutsToday.length}</p>
                <p className="text-[9px] text-muted-foreground">faxina completa</p>
              </div>
              <div className="bg-card border border-blue-500/20 rounded-2xl p-3 space-y-0.5">
                <div className="flex items-center gap-1.5 text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                  <BedDouble size={11} /> Ocupadas
                </div>
                <p className="text-2xl font-black text-blue-400">{occupiedDaily.length}</p>
                <p className="text-[9px] text-muted-foreground">limpeza diária</p>
              </div>
            </div>

            {/* Resumo compacto — só na impressão */}
            <div className="gv-print-hero hidden print:flex gap-0 border border-gray-400 divide-x divide-gray-400 text-black">
              <div className="flex-1 px-2 py-1 text-center">
                <p className="text-[7px] font-bold uppercase tracking-wider">Entradas</p>
                <p className="text-sm font-black">{entriesToday.length}</p>
                <p className="text-[7px]">pré-chegada</p>
              </div>
              <div className="flex-1 px-2 py-1 text-center">
                <p className="text-[7px] font-bold uppercase tracking-wider">Saídas</p>
                <p className="text-sm font-black">{checkoutsToday.length}</p>
                <p className="text-[7px]">faxina completa</p>
              </div>
              <div className="flex-1 px-2 py-1 text-center">
                <p className="text-[7px] font-bold uppercase tracking-wider">Ocupadas</p>
                <p className="text-sm font-black">{occupiedDaily.length}</p>
                <p className="text-[7px]">limpeza diária</p>
              </div>
            </div>

            {/* Seção: Entradas */}
            <SectionTable
              title={<span className="flex items-center gap-2"><LogIn size={12} className="text-emerald-400" /> Entradas — Revisão pré-chegada</span>}
              cabinList={entriesToday}
              highlight="entry"
              emptyMsg="Nenhuma entrada prevista."
              showSetup
              preferSource="arrival"
            />

            {/* Seção: Saídas */}
            <SectionTable
              title={<span className="flex items-center gap-2"><LogOut size={12} className="text-orange-400" /> Saídas — Faxina completa</span>}
              cabinList={checkoutsToday}
              highlight="checkout"
              emptyMsg="Nenhuma saída prevista."
              preferSource="departure"
            />

            {/* Seção: Ocupadas / Diária */}
            <SectionTable
              title={<span className="flex items-center gap-2"><BedDouble size={12} className="text-blue-400" /> Ocupadas — Limpeza diária</span>}
              cabinList={occupiedDaily}
              highlight="daily"
              emptyMsg="Nenhuma cabana ocupada com limpeza diária."
            />

            {/* Relatório completo */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Minus size={10} />
                Demais Cabanas — Disponíveis / Manutenção
              </h3>
              <div className="overflow-x-auto rounded-xl border border-border/30">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 px-3 font-bold">Cabana</th>
                      <th className="py-2 px-3 font-bold">Estado</th>
                      <th className="py-2 px-3 font-bold">Tarefa atual</th>
                      <th className="py-2 px-3 font-bold">Hóspede</th>
                      <th className="py-2 px-3 font-bold">A/C/F</th>
                      <th className="py-2 px-3 font-bold">C/In</th>
                      <th className="py-2 px-3 font-bold">C/Out</th>
                      <th className="py-2 px-3 font-bold">Última limpeza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCabins
                      .filter(c => !arrivalCabinIds.has(c.id) && !checkoutCabinIds.has(c.id) && !occupiedDaily.some(o => o.id === c.id))
                      .map(cabin => (
                        <CabinTableRow key={cabin.id} cabin={cabin} />
                      ))
                    }
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

  return createPortal(modal, document.body);
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
  const [reportArrivals, setReportArrivals] = useState<ReportArrival[]>([]);
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (!property) return;

    let unsubscribe: () => void;

    const fetchActiveStays = async () => {
      setStaysLoading(true);
      try {
        const { data: staysData } = await supabase
          .from('stays')
          .select('id, cabinId, hasPet, checkIn, checkOut, guestId, counts, areaConfigs')
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
          counts: s.counts ?? undefined,
          areaConfigs: s.areaConfigs ?? undefined,
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

  const openReport = useCallback(async (offset: 0 | 1 = 0) => {
    if (!property) return;
    setReportLoading(true);
    const date = new Date();
    date.setDate(date.getDate() + offset);
    date.setHours(0, 0, 0, 0);
    setReportDate(date);
    try {
      const dateISO = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const { data: arrivalsData } = await supabase
        .from('stays')
        .select('id, cabinId, checkIn, checkOut, guestId, counts, hasPet, areaConfigs')
        .eq('propertyId', property.id)
        .gte('checkIn', dateISO)
        .lte('checkIn', `${dateISO}T23:59:59`)
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
        hasPet: s.hasPet ?? false,
        counts: s.counts ?? undefined,
        areaConfigs: s.areaConfigs ?? undefined,
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
        <div className="flex items-center gap-1">
          {reportLoading && (
            <div className="w-3.5 h-3.5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin mr-1" />
          )}
          <button
            onClick={() => openReport(0)}
            disabled={reportLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-l-xl text-xs font-bold hover:bg-accent transition-all disabled:opacity-60"
          >
            <FileText size={13} />
            Hoje
          </button>
          <button
            onClick={() => openReport(1)}
            disabled={reportLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border border-l-0 rounded-r-xl text-xs font-bold hover:bg-accent transition-all disabled:opacity-60"
          >
            Amanhã
          </button>
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

      {/* RELATÓRIO MODAL */}
      {showReport && (
        <GovernanceReportModal
          propertyName={property.name}
          cabins={cabins}
          tasks={tasks}
          maids={maids}
          activeStays={activeStays}
          reportArrivals={reportArrivals}
          reportDate={reportDate}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
