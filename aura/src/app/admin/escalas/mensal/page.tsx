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

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DOW_PT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const ROLE_ORDER = [
  "reception","governance","maid","maintenance","technician",
  "kitchen","waiter","porter","houseman","marketing","hr","admin","super_admin",
];

type StaffWithSchedules = Staff & { schedules: StaffSchedule[] };

function toLocalYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthDays(year: number, month: number): Date[] {
  const total = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) => new Date(year, month, i + 1));
}

// Cell value + color
interface CellData {
  label: string;
  bg: string;
  color: string;
  bold: boolean;
}

function getCellData(
  staff: StaffWithSchedules,
  day: Date,
  dayOverrides: StaffScheduleOverride[],
  checkpoints: ScheduleCheckpoint[],
): CellData {
  const localDay = new Date(toLocalYMD(day) + "T00:00:00");
  const resolved = resolveEffectiveDaySchedule(
    staff, staff.schedules, dayOverrides, localDay, checkpoints
  );

  const dow = day.getDay();

  if (resolved.hasOverride) {
    if (!resolved.isWork) {
      return { label: "FOLGA", bg: "#16a34a", color: "#fff", bold: true };
    }
    // Override de trabalho (ex: troca de turno)
    return {
      label: `${resolved.startTime}–${resolved.endTime}`,
      bg: "#1d4ed8",
      color: "#fff",
      bold: true,
    };
  }

  if (resolved.source === "not-configured") {
    return { label: "", bg: "transparent", color: "#555", bold: false };
  }

  if (!resolved.isWork) {
    // Domingo = cor especial
    if (dow === 0) {
      return { label: "DOMINGO", bg: "#7c3aed", color: "#fff", bold: true };
    }
    if (dow === 6) {
      return { label: "FOLGA", bg: "#16a34a", color: "#fff", bold: true };
    }
    return { label: "FOLGA", bg: "#16a34a", color: "#fff", bold: true };
  }

  // Trabalho
  const timeStr = `${resolved.startTime}–${resolved.endTime}`;
  // Horário alternativo (se diferente do padrão)
  const cfg = staff.scheduleConfig;
  const isAltTime = cfg && (resolved.startTime !== cfg.startTime || resolved.endTime !== cfg.endTime);

  return {
    label: timeStr,
    bg: isAltTime ? "#854d0e" : "#1c1c1c",
    color: isAltTime ? "#fef08a" : "#d1d5db",
    bold: false,
  };
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
  const toYMD_str = toLocalYMD(monthDays[monthDays.length - 1]);

  const load = useCallback(async () => {
    const pId = property?.id || userData?.propertyId;
    if (!pId) return;
    setLoading(true);
    try {
      const [staffData, overrideData, checkpointData] = await Promise.all([
        StaffService.getPropertyScheduleView(pId),
        StaffService.getPropertyScheduleOverrides(pId, fromYMD, toYMD_str),
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
  }, [property?.id, userData?.propertyId, fromYMD, toYMD_str]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const uniqueRoles = Array.from(new Set(staffList.map(s => s.role)));
  const filteredStaff = (filterRole === "all" ? staffList : staffList.filter(s => s.role === filterRole))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.fullName.localeCompare(b.fullName));

  const todayYMD = toLocalYMD(today);

  const ROLE_LABELS: Record<string, string> = {
    reception: "Recepção", governance: "Governanta", maid: "Camareira",
    maintenance: "Manutenção", technician: "Técnico", kitchen: "Cozinha",
    waiter: "Garçom", porter: "Porteiro", houseman: "Mensageiro",
    marketing: "Marketing", hr: "RH", admin: "Admin",
  };

  // Pre-compute cells
  const staffCheckpointsMap = new Map(
    filteredStaff.map(s => [s.id, checkpoints.filter(c => c.staffId === s.id)])
  );

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "hr"]}>
      <div className="p-4 md:p-6 space-y-5 max-w-full mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarDays size={26} className="text-[#E0FFFF]" />
            <div>
              <h1 className="text-xl font-black text-white uppercase tracking-widest">Escala Mensal</h1>
              <p className="text-xs text-white/40">Visão completa · {MONTH_NAMES[month]} {year}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
              className="bg-[#111] border border-white/10 text-white/70 text-xs font-bold rounded-xl px-3 py-2 outline-none"
            >
              <option value="all">Todos os cargos</option>
              {uniqueRoles.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)).map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
              ))}
            </select>
            <Link
              href="/admin/escalas"
              className="text-[10px] font-black text-[#00BFFF] uppercase tracking-widest hover:opacity-70 transition-opacity px-3 py-2 border border-[#00BFFF]/20 rounded-xl"
            >
              ← Semana
            </Link>
          </div>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center gap-3 bg-[#111] border border-white/10 rounded-2xl px-4 py-2.5 w-fit">
          <button onClick={prevMonth} className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-black text-white tracking-wide min-w-[150px] text-center">
            {MONTH_NAMES[month].toUpperCase()} {year}
          </span>
          <button onClick={nextMonth} className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className="text-[9px] font-black text-[#00BFFF] uppercase tracking-widest hover:opacity-70 ml-1"
          >
            Hoje
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin text-[#E0FFFF]/40" />
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-white/30 gap-2">
            <AlertCircle size={28} />
            <p className="text-sm font-bold uppercase tracking-widest">Nenhum funcionário</p>
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl border border-white/10 shadow-2xl" style={{ maxHeight: "80vh" }}>
            <table className="border-collapse text-[10px]" style={{ minWidth: `${120 + filteredStaff.length * 100}px` }}>
              <thead className="sticky top-0 z-20">
                <tr style={{ background: "#0a0a0a" }}>
                  {/* Dia header */}
                  <th
                    className="sticky left-0 z-30 px-3 py-2 text-left border-b border-r border-white/10 font-black text-white/30 uppercase tracking-widest text-[9px]"
                    style={{ background: "#0a0a0a", minWidth: 80 }}
                  >
                    Dia
                  </th>
                  {/* Employee headers */}
                  {filteredStaff.map(staff => (
                    <th
                      key={staff.id}
                      className="px-2 py-2 text-center border-b border-l border-white/10 font-black text-white/80 text-[9px] uppercase tracking-wide"
                      style={{ minWidth: 90, maxWidth: 110 }}
                    >
                      <div className="truncate">{staff.fullName.split(" ")[0]}</div>
                      <div className="font-normal text-white/30 text-[8px] normal-case tracking-normal mt-0.5">
                        {ROLE_LABELS[staff.role] || staff.role}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthDays.map((day, rowIdx) => {
                  const ymd = toLocalYMD(day);
                  const dow = day.getDay();
                  const isToday = ymd === todayYMD;
                  const isWeekend = dow === 0 || dow === 6;
                  const rowBg = isToday
                    ? "rgba(0,191,255,0.06)"
                    : isWeekend
                    ? "rgba(255,255,255,0.015)"
                    : "transparent";

                  return (
                    <tr
                      key={ymd}
                      style={{ background: rowBg }}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Day label — sticky */}
                      <td
                        className="sticky left-0 z-10 px-3 py-1 border-r border-white/10 font-bold"
                        style={{ background: isToday ? "#0d2033" : isWeekend ? "#111" : "#0e0e0e" }}
                      >
                        <div className={`flex items-center gap-2 ${isToday ? "text-[#00BFFF]" : isWeekend ? "text-white/50" : "text-white/60"}`}>
                          <span className="font-black text-[12px] w-5 text-right">{day.getDate()}</span>
                          <span className="text-[9px] font-bold uppercase tracking-wide opacity-60">{DOW_PT[dow]}</span>
                        </div>
                      </td>

                      {/* Employee cells */}
                      {filteredStaff.map(staff => {
                        const staffCheckpoints = staffCheckpointsMap.get(staff.id) || [];
                        const dayOverrides = overrides.filter(o => o.staffId === staff.id && o.date === ymd);
                        const cell = getCellData(staff, day, dayOverrides, staffCheckpoints);

                        return (
                          <td
                            key={staff.id}
                            className="border-l border-white/5 px-1 py-0.5 text-center"
                            style={{
                              background: cell.bg !== "transparent" ? cell.bg : undefined,
                            }}
                          >
                            {cell.label ? (
                              <span
                                className="block text-[9px] leading-tight py-0.5"
                                style={{
                                  color: cell.color,
                                  fontWeight: cell.bold ? 800 : 500,
                                  letterSpacing: cell.bold ? "0.04em" : undefined,
                                }}
                              >
                                {cell.label}
                              </span>
                            ) : (
                              <span className="block text-white/10 text-[8px]">·</span>
                            )}
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
        <div className="flex flex-wrap items-center gap-4 text-[9px] font-bold uppercase tracking-widest text-white/40">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded inline-block" style={{ background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.1)" }} />
            Trabalho
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded inline-block" style={{ background: "#854d0e" }} />
            Horário diferenciado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded inline-block" style={{ background: "#16a34a" }} />
            Folga
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded inline-block" style={{ background: "#7c3aed" }} />
            Domingo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded inline-block" style={{ background: "#1d4ed8" }} />
            Override pontual
          </span>
        </div>
      </div>
    </RoleGuard>
  );
}
