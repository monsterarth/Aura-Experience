"use client";

import React, { useMemo } from "react";
import { Cabin, HousekeepingTask } from "@/types/aura";
import { cn } from "@/lib/utils";
import {
  PawPrint, Building2, AlertCircle, Coffee, Sparkles,
  CheckCircle2, Clock, User
} from "lucide-react";

// -------------------------------------------------------
// TIPOS
// -------------------------------------------------------

export interface ActiveStayInfo {
  id: string;
  cabinId: string;
  hasPet: boolean;
  checkOut: string;
  guestName: string;
}

type CabinHKState =
  | 'turnover_waiting_conference'
  | 'turnover_in_progress'
  | 'turnover_pending'
  | 'daily_pending'
  | 'daily_done'
  | 'none';

// -------------------------------------------------------
// LÓGICA DE ESTADO HK
// -------------------------------------------------------

function deriveCabinHKState(cabinId: string, tasks: HousekeepingTask[]): CabinHKState {
  const cabinTasks = tasks.filter(t => t.cabinId === cabinId);
  const todayStr = new Date().toDateString();

  if (cabinTasks.some(t => t.type === 'turnover' && t.status === 'waiting_conference'))
    return 'turnover_waiting_conference';
  if (cabinTasks.some(t => t.type === 'turnover' && t.status === 'in_progress'))
    return 'turnover_in_progress';
  if (cabinTasks.some(t => t.type === 'turnover' && (t.status === 'pending' || t.status === 'paused')))
    return 'turnover_pending';
  if (cabinTasks.some(t => t.type === 'daily' && (t.status === 'pending' || t.status === 'paused')))
    return 'daily_pending';
  if (cabinTasks.some(t =>
    t.type === 'daily' && t.status === 'completed' &&
    t.finishedAt && new Date(t.finishedAt as string).toDateString() === todayStr
  ))
    return 'daily_done';
  return 'none';
}

// -------------------------------------------------------
// CONFIG VISUAL
// -------------------------------------------------------

const CABIN_STATUS_CONFIG = {
  available: { dot: 'bg-emerald-500', label: 'Disponível', labelColor: 'text-emerald-400' },
  occupied:  { dot: 'bg-blue-500',    label: 'Ocupada',    labelColor: 'text-blue-400'    },
  cleaning:  { dot: 'bg-orange-500',  label: 'Limpeza',    labelColor: 'text-orange-400'  },
  maintenance:{ dot: 'bg-red-500',    label: 'Manutenção', labelColor: 'text-red-400'     },
} as const;

const HK_BADGE: Record<CabinHKState, { label: string; className: string; Icon: React.ElementType } | null> = {
  turnover_waiting_conference: { label: 'Conferência',   className: 'bg-amber-500/15 text-amber-400',  Icon: AlertCircle  },
  turnover_in_progress:        { label: 'Em limpeza',    className: 'bg-blue-500/15 text-blue-400',     Icon: Sparkles     },
  turnover_pending:            { label: 'Faxina pendente', className: 'bg-orange-500/15 text-orange-400', Icon: Coffee    },
  daily_pending:               { label: 'Diária pendente', className: 'bg-zinc-500/15 text-zinc-400',    Icon: Clock      },
  daily_done:                  { label: 'Diária feita',  className: 'bg-emerald-500/15 text-emerald-400', Icon: CheckCircle2 },
  none: null,
};

// -------------------------------------------------------
// CABIN CARD
// -------------------------------------------------------

function CabinCard({ cabin, hkState, activeStay, staysLoading }: {
  cabin: Cabin;
  hkState: CabinHKState;
  activeStay?: ActiveStayInfo;
  staysLoading?: boolean;
}) {
  const statusKey = (cabin.status ?? 'available') as keyof typeof CABIN_STATUS_CONFIG;
  const cfg = CABIN_STATUS_CONFIG[statusKey] ?? CABIN_STATUS_CONFIG.available;
  const hkBadge = HK_BADGE[hkState];

  const todayStr = new Date().toDateString();
  const checkoutIsToday = activeStay ? new Date(activeStay.checkOut).toDateString() === todayStr : false;
  const formattedCheckout = activeStay
    ? new Date(activeStay.checkOut).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null;

  // Só mostra o número como título principal; category como subtítulo
  const title = cabin.number ? `Cabana ${cabin.number}` : cabin.name;
  const subtitle = cabin.category ?? null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 transition-all hover:border-border/80 hover:shadow-md hover:shadow-black/20">

      {/* Linha superior: dot de status + número + pet */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("w-2 h-2 rounded-full shrink-0 mt-0.5", cfg.dot)} />
          <div className="min-w-0">
            <p className="font-black text-base leading-tight text-foreground truncate">{title}</p>
            {subtitle && (
              <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {activeStay?.hasPet && (
          <PawPrint size={13} className="text-amber-500 shrink-0 mt-0.5" />
        )}
      </div>

      {/* Status + badge HK */}
      <div className="flex flex-col gap-1.5">
        <span className={cn("text-[10px] font-bold uppercase tracking-wider", cfg.labelColor)}>
          {cfg.label}
        </span>
        {hkBadge && (
          <div className={cn("flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-md w-fit", hkBadge.className)}>
            <hkBadge.Icon size={10} />
            {hkBadge.label}
          </div>
        )}
      </div>

      {/* Hóspede */}
      {staysLoading ? (
        <div className="space-y-1.5 pt-2 border-t border-border/40">
          <div className="h-3 bg-muted/30 rounded animate-pulse w-2/3" />
          <div className="h-3 bg-muted/30 rounded animate-pulse w-1/2" />
        </div>
      ) : activeStay ? (
        <div className="pt-2 border-t border-border/40 space-y-1">
          <div className="flex items-center gap-1.5">
            <User size={11} className="text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-foreground/80 truncate">
              {activeStay.guestName.split(' ')[0]}
            </span>
          </div>
          <div className={cn("flex items-center gap-1.5 text-[10px]", checkoutIsToday ? "text-orange-400 font-semibold" : "text-muted-foreground")}>
            <Clock size={10} className="shrink-0" />
            <span>Saída {formattedCheckout}</span>
            {checkoutIsToday && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" />}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------
// GRADE
// -------------------------------------------------------

interface PropertyMapGridProps {
  cabins: Record<string, Cabin>;
  tasks: HousekeepingTask[];
  activeStays: ActiveStayInfo[];
  staysLoading?: boolean;
}

export function PropertyMapGrid({ cabins, tasks, activeStays, staysLoading }: PropertyMapGridProps) {
  const cabinCards = useMemo(() => {
    return Object.values(cabins)
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
      .map(cabin => ({
        cabin,
        hkState: deriveCabinHKState(cabin.id, tasks),
        activeStay: activeStays.find(s => s.cabinId === cabin.id),
      }));
  }, [cabins, tasks, activeStays]);

  if (Object.keys(cabins).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <Building2 size={40} className="opacity-20" />
        <p className="text-sm font-bold uppercase tracking-widest">Nenhuma cabana cadastrada.</p>
      </div>
    );
  }

  const legendItems = [
    { dot: 'bg-emerald-500', label: 'Disponível' },
    { dot: 'bg-blue-500',    label: 'Ocupada'    },
    { dot: 'bg-orange-500',  label: 'Limpeza'    },
    { dot: 'bg-red-500',     label: 'Manutenção' },
  ];

  return (
    <div className="space-y-4">
      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4">
        {legendItems.map(item => (
          <div key={item.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
            <div className={cn("w-2 h-2 rounded-full", item.dot)} />
            {item.label}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-[10px] text-amber-500 font-semibold uppercase tracking-wider">
          <PawPrint size={10} /> Pet
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-orange-400 font-semibold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          Check-out hoje
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
        {cabinCards.map(({ cabin, hkState, activeStay }) => (
          <CabinCard
            key={cabin.id}
            cabin={cabin}
            hkState={hkState}
            activeStay={activeStay}
            staysLoading={staysLoading}
          />
        ))}
      </div>
    </div>
  );
}
