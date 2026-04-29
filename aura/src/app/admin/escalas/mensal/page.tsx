"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StaffService } from "@/services/staff-service";
import {
  Staff, StaffSchedule, StaffScheduleOverride, ScheduleCheckpoint,
} from "@/types/aura";
import { resolveEffectiveDaySchedule } from "@/lib/schedule-calculator";
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  reception: "Recepção", governance: "Governanta", maid: "Camareira",
  maintenance: "Coord. Manutenção", technician: "Manutenção", kitchen: "Cozinha",
  waiter: "Garçom", porter: "Porteiro", houseman: "Mensageiro",
  marketing: "Marketing", hr: "RH", admin: "Administrador",
};

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];
const DOW_SHORT = ["D","S","T","Q","Q","S","S"];

type StaffWithSchedules = Staff & { schedules: StaffSchedule[] };

function toLocalYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const total = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= total; d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

export default function EscalasMensalPage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [staffList, setStaffList] = useState<StaffWithSchedules[]>([]);
  const [overrides, setOverrides] = useState<StaffScheduleOverride[]>([]);
  const [checkpoints, setCheckpoints] = useState<ScheduleCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState("all");

  const monthDays = getMonthDays(year, month);
  const fromYMD = toLocalYMD(monthDays[0]);
  const toYMD = toLocalYMD(monthDays[monthDays.length - 1]);

  const load = useCallback(async () => {
    const pId = property?.id || userData?.propertyId;
    if (!pId) return;
    setLoading(true);
    try {
      const [staffData, overrideData, checkpointData] = await Promise.all([
        StaffService.getPropertyScheduleView(pId),
        StaffService.getPropertyScheduleOverrides(pId, fromYMD, toYMD),
        StaffService.getPropertyCheckpoints(pId),
      ]);
      setStaffList(staffData);
      setOverrides(overrideData);
      setCheckpoints(checkpointData);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar escalas.");
    } finally {
      setLoading(false);
    }
  }, [property?.id, userData?.propertyId, fromYMD, toYMD]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const filteredStaff = filterRole === "all"
    ? staffList
    : staffList.filter(s => s.role === filterRole);

  const uniqueRoles = Array.from(new Set(staffList.map(s => s.role)));
  const todayYMD = toLocalYMD(today);

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "hr"]}>
      <div className="p-4 md:p-8 space-y-6 max-w-[1800px] mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarDays size={28} className="text-[#E0FFFF]" />
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-widest">Escala Mensal</h1>
              <p className="text-xs text-white/40 tracking-wide">Visão completa do mês</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
              className="bg-[#111] border border-white/10 text-white/80 text-xs font-bold rounded-xl px-4 py-2.5 outline-none uppercase tracking-wide"
            >
              <option value="all">Todos os cargos</option>
              {uniqueRoles.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
              ))}
            </select>
            <Link
              href="/admin/escalas"
              className="text-[10px] font-black text-[#00BFFF] uppercase tracking-widest hover:opacity-70 transition-opacity px-3 py-2.5 border border-[#00BFFF]/20 rounded-xl"
            >
              Ver semana
            </Link>
          </div>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center gap-4 bg-[#111] border border-white/10 rounded-2xl px-4 py-3 w-fit">
          <button onClick={prevMonth} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-white/80 tracking-wide min-w-[160px] text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className="text-[10px] font-black text-[#00BFFF] uppercase tracking-widest hover:opacity-70 transition-opacity ml-2"
          >
            Hoje
          </button>
        </div>

        {/* Grade mensal */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin text-[#E0FFFF]/40" />
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-white/30 gap-2">
            <AlertCircle size={32} />
            <p className="text-sm font-bold uppercase tracking-widest">Nenhum funcionário encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="text-[10px] border-collapse" style={{ minWidth: `${180 + monthDays.length * 36}px` }}>
              <thead>
                <tr className="bg-[#0e0e0e]">
                  <th className="sticky left-0 z-10 bg-[#0e0e0e] text-left px-4 py-3 text-white/40 font-black uppercase tracking-widest text-[9px] border-b border-white/5 min-w-[160px]">
                    Funcionário
                  </th>
                  {monthDays.map((day, i) => {
                    const ymd = toLocalYMD(day);
                    const dow = day.getDay();
                    const isToday = ymd === todayYMD;
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <th
                        key={i}
                        className={`px-1 py-2 border-b border-l border-white/5 text-center w-9 ${
                          isToday ? "text-[#00BFFF]" : isWeekend ? "text-white/20" : "text-white/40"
                        }`}
                      >
                        <div className="font-black text-[9px]">{day.getDate()}</div>
                        <div className="text-[8px] font-bold opacity-60">{DOW_SHORT[dow]}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map(staff => {
                  const staffCheckpoints = checkpoints.filter(c => c.staffId === staff.id);
                  return (
                    <tr key={staff.id} className="border-b border-white/5 hover:bg-white/[0.015] transition-colors">
                      {/* Nome */}
                      <td className="sticky left-0 z-10 bg-[#111] px-4 py-2 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#1c1c1c] border border-white/10 flex items-center justify-center text-[9px] font-black text-[#E0FFFF] shrink-0 overflow-hidden">
                            {staff.profilePictureUrl
                              ? <img src={staff.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                              : staff.fullName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-white/80 truncate text-[10px]">{staff.fullName}</p>
                            <p className="text-white/30 text-[8px] uppercase tracking-wide">{ROLE_LABELS[staff.role] || staff.role}</p>
                          </div>
                        </div>
                      </td>

                      {/* Célula por dia */}
                      {monthDays.map((day, i) => {
                        const ymd = toLocalYMD(day);
                        const dayOverrides = overrides.filter(o => o.staffId === staff.id && o.date === ymd);
                        const localDay = new Date(ymd + "T00:00:00");
                        const resolved = resolveEffectiveDaySchedule(
                          staff, staff.schedules, dayOverrides, localDay, staffCheckpoints
                        );
                        const isToday = ymd === todayYMD;
                        const dow = day.getDay();
                        const isWeekend = dow === 0 || dow === 6;

                        let bg = "transparent";
                        let indicator: React.ReactNode;

                        if (resolved.hasOverride) {
                          if (!resolved.isWork) {
                            // Override de folga
                            bg = "rgba(127,29,29,0.25)";
                            indicator = <span className="block w-2 h-2 rounded-full bg-red-500 mx-auto" title="Folga (override)" />;
                          } else {
                            // Override de trabalho
                            bg = "rgba(30,58,138,0.25)";
                            indicator = (
                              <span className="block text-[7px] font-bold text-blue-300 leading-tight text-center" title={`${resolved.startTime}–${resolved.endTime} (override)`}>
                                {resolved.startTime}
                              </span>
                            );
                          }
                        } else if (resolved.source === "not-configured") {
                          indicator = <span className="text-white/10 text-[9px]">·</span>;
                        } else if (resolved.isWork) {
                          bg = isWeekend ? "rgba(234,179,8,0.08)" : "rgba(255,255,255,0.04)";
                          indicator = (
                            <span className="block text-[7px] font-bold text-white/50 leading-tight text-center" title={`${resolved.startTime}–${resolved.endTime}`}>
                              {resolved.startTime}
                            </span>
                          );
                        } else {
                          // Folga calculada — weekend diferente de weekday
                          if (isWeekend) {
                            indicator = <span className="text-white/10 text-[9px]">·</span>;
                          } else {
                            indicator = <span className="block w-2 h-0.5 rounded bg-white/15 mx-auto" title="Folga" />;
                          }
                        }

                        return (
                          <td
                            key={i}
                            className={`border-l border-white/5 px-1 py-2 text-center ${isToday ? "ring-1 ring-inset ring-[#00BFFF]/20" : ""}`}
                            style={{ background: bg }}
                          >
                            <div className="flex items-center justify-center min-h-[20px]">
                              {indicator}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Legenda */}
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/40 pt-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white/20 inline-block" />Trabalho
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Override trabalho
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Folga (override)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded bg-white/20 inline-block" />Folga (calculada)
          </span>
        </div>
      </div>
    </RoleGuard>
  );
}
