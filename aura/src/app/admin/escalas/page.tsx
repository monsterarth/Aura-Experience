"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StaffService } from "@/services/staff-service";
import {
  Staff, StaffSchedule, StaffScheduleOverride,
  ScheduleType, ScheduleConfig,
} from "@/types/aura";
import { resolveEffectiveDaySchedule, calculateScheduleForDate } from "@/lib/schedule-calculator";
import {
  ChevronLeft, ChevronRight, X, Save, Loader2,
  ClipboardCheck, AlertCircle, Settings,
} from "lucide-react";
import { toast } from "sonner";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_LABELS_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const ROLE_LABELS: Record<string, string> = {
  reception: "Recepção",
  governance: "Governanta",
  maid: "Camareira",
  maintenance: "Coord. Manutenção",
  technician: "Manutenção",
  kitchen: "Cozinha",
  waiter: "Garçom",
  porter: "Porteiro",
  houseman: "Mensageiro",
  marketing: "Marketing",
  hr: "RH",
  admin: "Administrador",
};

const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  '5x2': '5×2',
  '12x36': '12×36',
  '6x1': '6×1',
  'custom': 'Custom',
};

type StaffWithSchedules = Staff & { schedules: StaffSchedule[] };

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toYMD(date: Date): string {
  return date.toISOString().split('T')[0];
}

function toLocalYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// --- Modal de edição de dia (override) ---
interface CellModalState {
  staffId: string;
  staffName: string;
  propertyId: string;
  date: string | null;
  dayOfWeek: number | null;
  existingSchedule?: StaffSchedule | null;
  existingOverride?: StaffScheduleOverride | null;
}

// --- Modal de configuração de tipo de escala ---
interface ConfigModalState {
  staff: StaffWithSchedules;
  propertyId: string;
}

export default function EscalasPage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();

  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [staffList, setStaffList] = useState<StaffWithSchedules[]>([]);
  const [overrides, setOverrides] = useState<StaffScheduleOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<string>("all");

  // Override/cell modal
  const [modal, setModal] = useState<CellModalState | null>(null);
  const [modalStart, setModalStart] = useState("");
  const [modalEnd, setModalEnd] = useState("");
  const [modalReason, setModalReason] = useState("");
  const [modalIsFolga, setModalIsFolga] = useState(false);
  const [saving, setSaving] = useState(false);

  // Config modal
  const [configModal, setConfigModal] = useState<ConfigModalState | null>(null);
  const [configType, setConfigType] = useState<ScheduleType>('custom');
  const [configStart, setConfigStart] = useState("08:00");
  const [configEnd, setConfigEnd] = useState("17:00");
  const [configRefDate, setConfigRefDate] = useState("");
  const [configSaving, setConfigSaving] = useState(false);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = toYMD(weekStart);
  const to = toYMD(addDays(weekStart, 6));

  const load = useCallback(async () => {
    const pId = property?.id || userData?.propertyId;
    if (!pId) return;
    setLoading(true);
    try {
      const [staffData, overrideData] = await Promise.all([
        StaffService.getPropertyScheduleView(pId),
        StaffService.getPropertyScheduleOverrides(pId, from, to),
      ]);
      setStaffList(staffData);
      setOverrides(overrideData);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar escalas.");
    } finally {
      setLoading(false);
    }
  }, [property?.id, userData?.propertyId, from, to]);

  useEffect(() => { load(); }, [load]);

  const filteredStaff = filterRole === "all"
    ? staffList
    : staffList.filter(s => s.role === filterRole);

  const getOverrideForDay = (staffId: string, date: Date): StaffScheduleOverride | undefined =>
    overrides.find(o => o.staffId === staffId && o.date === toLocalYMD(date));

  // --- Handlers do modal de célula ---

  const openOverrideModal = (staff: StaffWithSchedules, date: Date) => {
    const dayOfWeek = date.getDay();
    const existing = getOverrideForDay(staff.id, date);
    const baseSchedule = staff.schedules.find(s => s.dayOfWeek === dayOfWeek && s.active);

    // Para tipos calculados, usa o resultado do cálculo como referência de horário padrão
    let defaultStart = "07:00";
    let defaultEnd = "15:00";
    if (staff.scheduleConfig) {
      defaultStart = staff.scheduleConfig.startTime;
      defaultEnd = staff.scheduleConfig.endTime;
    } else if (baseSchedule) {
      defaultStart = baseSchedule.startTime.slice(0, 5);
      defaultEnd = baseSchedule.endTime.slice(0, 5);
    }

    setModal({
      staffId: staff.id,
      staffName: staff.fullName,
      propertyId: property?.id || userData?.propertyId || "",
      date: toLocalYMD(date),
      dayOfWeek,
      existingSchedule: baseSchedule,
      existingOverride: existing,
    });

    if (existing) {
      setModalIsFolga(!existing.startTime);
      setModalStart(existing.startTime?.slice(0, 5) || defaultStart);
      setModalEnd(existing.endTime?.slice(0, 5) || defaultEnd);
      setModalReason(existing.reason || "");
    } else {
      setModalIsFolga(false);
      setModalStart(defaultStart);
      setModalEnd(defaultEnd);
      setModalReason("");
    }
  };

  const openBaseModal = (staff: StaffWithSchedules, dayOfWeek: number) => {
    const existing = staff.schedules.find(s => s.dayOfWeek === dayOfWeek && s.active);
    setModal({
      staffId: staff.id,
      staffName: staff.fullName,
      propertyId: property?.id || userData?.propertyId || "",
      date: null,
      dayOfWeek,
      existingSchedule: existing,
    });
    setModalStart(existing?.startTime?.slice(0, 5) || "07:00");
    setModalEnd(existing?.endTime?.slice(0, 5) || "15:00");
    setModalReason("");
    setModalIsFolga(false);
  };

  const handleSave = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      if (modal.date === null && modal.dayOfWeek !== null) {
        await StaffService.upsertStaffSchedule({
          staffId: modal.staffId,
          propertyId: modal.propertyId,
          dayOfWeek: modal.dayOfWeek,
          startTime: modalStart,
          endTime: modalEnd,
          active: true,
        });
        toast.success("Escala base salva.");
      } else if (modal.date) {
        await StaffService.upsertScheduleOverride({
          staffId: modal.staffId,
          propertyId: modal.propertyId,
          date: modal.date,
          startTime: modalIsFolga ? null : modalStart,
          endTime: modalIsFolga ? null : modalEnd,
          reason: modalReason || (modalIsFolga ? "Folga" : undefined),
        });
        toast.success(modalIsFolga ? "Folga registrada." : "Horário do dia salvo.");
      }
      setModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOverride = async () => {
    if (!modal?.existingOverride) return;
    setSaving(true);
    try {
      await StaffService.deleteScheduleOverride(modal.existingOverride.id);
      toast.success("Override removido.");
      setModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBase = async () => {
    if (!modal?.existingSchedule) return;
    setSaving(true);
    try {
      await StaffService.deleteStaffSchedule(modal.existingSchedule.id);
      toast.success("Escala base removida.");
      setModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Handlers do modal de config ---

  const openConfigModal = (staff: StaffWithSchedules) => {
    setConfigModal({
      staff,
      propertyId: property?.id || userData?.propertyId || "",
    });
    setConfigType(staff.scheduleType || 'custom');
    setConfigStart(staff.scheduleConfig?.startTime || "08:00");
    setConfigEnd(staff.scheduleConfig?.endTime || "17:00");
    setConfigRefDate(staff.scheduleConfig?.cycleReferenceDate || "");
  };

  const handleSaveConfig = async () => {
    if (!configModal) return;
    if ((configType === '12x36' || configType === '6x1') && !configRefDate) {
      toast.error("Informe a data de referência para este tipo de escala.");
      return;
    }
    setConfigSaving(true);
    try {
      const scheduleConfig: ScheduleConfig = {
        scheduleType: configType,
        startTime: configStart,
        endTime: configEnd,
        ...(configRefDate ? { cycleReferenceDate: configRefDate } : {}),
      };
      await StaffService.updateScheduleConfig(configModal.staff.id, {
        scheduleType: configType,
        scheduleConfig,
      });
      toast.success("Tipo de escala salvo.");
      setConfigModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar configuração.");
    } finally {
      setConfigSaving(false);
    }
  };

  // Inverte o ciclo 12x36: cria um override de folga no próximo dia de trabalho calculado
  const handleInvertCycle = async () => {
    if (!configModal) return;
    const staff = configModal.staff;
    if (!staff.scheduleConfig?.cycleReferenceDate) return;

    // Encontra o próximo dia de trabalho calculado (a partir de amanhã)
    let targetDate: string | null = null;
    const tomorrow = addDays(new Date(), 1);
    for (let i = 0; i < 14; i++) {
      const d = addDays(tomorrow, i);
      const localD = new Date(toLocalYMD(d) + 'T00:00:00');
      const result = calculateScheduleForDate(staff, localD);
      if (result.isWork) {
        targetDate = toLocalYMD(d);
        break;
      }
    }

    if (!targetDate) {
      toast.error("Não foi possível encontrar o próximo dia de trabalho.");
      return;
    }

    setConfigSaving(true);
    try {
      await StaffService.upsertScheduleOverride({
        staffId: staff.id,
        propertyId: configModal.propertyId,
        date: targetDate,
        startTime: null,
        endTime: null,
        reason: "Rodízio — ciclo invertido",
      });
      toast.success(`Folga criada em ${new Date(targetDate + 'T00:00:00').toLocaleDateString('pt-BR')}.`);
      setConfigModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao inverter ciclo.");
    } finally {
      setConfigSaving(false);
    }
  };

  const uniqueRoles = Array.from(new Set(staffList.map(s => s.role)));

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "hr"]}>
      <div className="p-4 md:p-8 space-y-6 max-w-[1400px] mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardCheck size={28} className="text-[#E0FFFF]" />
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-widest">Escalas</h1>
              <p className="text-xs text-white/40 tracking-wide">Gestão de turnos e folgas da equipe</p>
            </div>
          </div>

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
        </div>

        {/* Navegação de semana */}
        <div className="flex items-center gap-4 bg-[#111] border border-white/10 rounded-2xl px-4 py-3 w-fit">
          <button
            onClick={() => setWeekStart(w => addDays(w, -7))}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-white/80 tracking-wide">
            {formatDate(weekStart)} — {formatDate(addDays(weekStart, 6))}
          </span>
          <button
            onClick={() => setWeekStart(w => addDays(w, 7))}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="text-[10px] font-black text-[#00BFFF] uppercase tracking-widest hover:opacity-70 transition-opacity ml-2"
          >
            Hoje
          </button>
        </div>

        {/* Grade de escalas */}
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
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#0e0e0e]">
                  <th className="text-left px-4 py-3 text-white/40 font-black uppercase tracking-widest text-[10px] border-b border-white/5 min-w-[180px]">
                    Funcionário
                  </th>
                  {weekDays.map((day, i) => {
                    const isToday = toLocalYMD(day) === toLocalYMD(new Date());
                    return (
                      <th key={i} className={`px-3 py-3 font-black uppercase tracking-widest text-[10px] border-b border-l border-white/5 text-center ${isToday ? 'text-[#00BFFF]' : 'text-white/40'}`}>
                        <div>{DAY_LABELS[day.getDay()]}</div>
                        <div className={`text-[9px] font-bold mt-0.5 ${isToday ? 'text-[#00BFFF]/70' : 'text-white/20'}`}>{formatDate(day)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((staff) => (
                  <tr key={staff.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    {/* Funcionário */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#1c1c1c] border border-white/10 flex items-center justify-center text-[10px] font-black text-[#E0FFFF] shrink-0 overflow-hidden">
                          {staff.profilePictureUrl
                            ? <img src={staff.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                            : staff.fullName.charAt(0)
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-white/80 truncate text-[11px]">{staff.fullName}</p>
                          <p className="text-white/30 text-[9px] uppercase tracking-wide">{ROLE_LABELS[staff.role] || staff.role}</p>
                          {staff.scheduleType ? (
                            <p className="text-[#00BFFF]/60 text-[8px] font-black uppercase tracking-wide">
                              {SCHEDULE_TYPE_LABELS[staff.scheduleType]}
                            </p>
                          ) : (
                            <p className="text-white/20 text-[8px] uppercase tracking-wide">Sem escala</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Células por dia */}
                    {weekDays.map((day, i) => {
                      const dayOverrides = overrides.filter(
                        o => o.staffId === staff.id && o.date === toLocalYMD(day)
                      );
                      const localDay = new Date(toLocalYMD(day) + 'T00:00:00');
                      const resolved = resolveEffectiveDaySchedule(
                        staff,
                        staff.schedules,
                        dayOverrides,
                        localDay
                      );
                      const isToday = toLocalYMD(day) === toLocalYMD(new Date());

                      let cellContent: React.ReactNode;
                      let cellStyle = "bg-transparent";

                      if (resolved.hasOverride) {
                        if (!resolved.isWork) {
                          cellStyle = "bg-red-950/30 border-red-900/30";
                          cellContent = (
                            <span className="text-red-400 font-bold text-[9px] uppercase tracking-wide">Folga</span>
                          );
                        } else {
                          cellStyle = "bg-blue-950/30 border-blue-900/30";
                          cellContent = (
                            <span className="text-blue-300 font-bold text-[9px]">
                              {resolved.startTime}–{resolved.endTime}
                            </span>
                          );
                        }
                      } else if (resolved.source === 'not-configured') {
                        cellContent = (
                          <span className="text-white/15 text-[9px]">—</span>
                        );
                      } else if (resolved.isWork) {
                        cellStyle = "bg-[#111]";
                        cellContent = (
                          <span className="text-white/50 font-bold text-[9px]">
                            {resolved.startTime}–{resolved.endTime}
                          </span>
                        );
                      } else {
                        cellStyle = "bg-white/[0.03]";
                        cellContent = (
                          <span className="text-white/20 text-[9px]">Folga</span>
                        );
                      }

                      return (
                        <td
                          key={i}
                          className={`border-l border-white/5 px-2 py-2 text-center cursor-pointer transition-all hover:opacity-80 ${isToday ? 'ring-1 ring-inset ring-[#00BFFF]/20' : ''}`}
                          onClick={() => openOverrideModal(staff, day)}
                          title={`Editar ${DAY_LABELS_FULL[day.getDay()]} ${formatDate(day)}`}
                        >
                          <div className={`rounded-lg px-2 py-1.5 border ${cellStyle} flex items-center justify-center min-h-[32px]`}>
                            {cellContent}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legenda */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/40">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#111] border border-white/10 inline-block" />Trabalho</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-950/50 border border-blue-900/30 inline-block" />Override</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-950/30 border border-red-900/30 inline-block" />Folga (override)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white/[0.03] border border-white/10 inline-block" />Folga (calculada)</span>
          </div>
          <p className="text-[10px] text-white/30">Clique em uma célula para ajustar o dia.</p>
        </div>

        {/* Cards de configuração por funcionário */}
        {filteredStaff.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 pt-4 border-t border-white/5">
              Configuração de Escalas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredStaff.map(staff => (
                <div key={staff.id} className="bg-[#111] border border-white/10 rounded-2xl p-4 space-y-3">
                  {/* Header do card */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#1c1c1c] border border-white/10 flex items-center justify-center text-[10px] font-black text-[#E0FFFF] shrink-0 overflow-hidden">
                        {staff.profilePictureUrl
                          ? <img src={staff.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                          : staff.fullName.charAt(0)
                        }
                      </div>
                      <div>
                        <p className="font-bold text-white/80 text-[11px]">{staff.fullName}</p>
                        <p className="text-white/30 text-[9px] uppercase tracking-wide">{ROLE_LABELS[staff.role] || staff.role}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => openConfigModal(staff)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white/80 hover:border-white/20 text-[9px] font-black uppercase tracking-wide transition-all"
                    >
                      <Settings size={10} />
                      Tipo
                    </button>
                  </div>

                  {/* Visualização por tipo */}
                  {(!staff.scheduleType || staff.scheduleType === 'custom') && (
                    <div className="grid grid-cols-7 gap-1">
                      {DAY_LABELS.map((label, dow) => {
                        const sched = staff.schedules.find(s => s.dayOfWeek === dow && s.active);
                        return (
                          <button
                            key={dow}
                            onClick={() => openBaseModal(staff, dow)}
                            className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all hover:opacity-80 ${sched ? 'bg-[#1a1a1a] border-white/10' : 'border-dashed border-white/10 hover:border-white/20'}`}
                            title={DAY_LABELS_FULL[dow]}
                          >
                            <span className="text-[8px] font-black uppercase text-white/40">{label}</span>
                            {sched ? (
                              <span className="text-[7px] text-white/50 font-bold leading-tight text-center">
                                {sched.startTime.slice(0, 5)}<br />{sched.endTime.slice(0, 5)}
                              </span>
                            ) : (
                              <span className="text-white/15 text-[8px]">+</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {staff.scheduleType === '5x2' && staff.scheduleConfig && (() => {
                    const cfg = staff.scheduleConfig!;
                    return (
                      <div className="grid grid-cols-7 gap-1">
                        {DAY_LABELS.map((label, dow) => {
                          const isWork = dow >= 1 && dow <= 5;
                          return (
                            <div
                              key={dow}
                              className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border ${isWork ? 'bg-[#1a1a1a] border-white/10' : 'border-dashed border-white/5'}`}
                            >
                              <span className="text-[8px] font-black uppercase text-white/40">{label}</span>
                              {isWork ? (
                                <span className="text-[7px] text-white/50 font-bold leading-tight text-center">
                                  {cfg.startTime}<br />{cfg.endTime}
                                </span>
                              ) : (
                                <span className="text-white/15 text-[8px]">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {(staff.scheduleType === '12x36' || staff.scheduleType === '6x1') && staff.scheduleConfig && (
                    <div className="space-y-1">
                      <p className="text-[9px] text-white/30 font-bold uppercase tracking-wide">
                        Ciclo desta semana
                      </p>
                      <div className="grid grid-cols-7 gap-1">
                        {weekDays.map((day, i) => {
                          const localDay = new Date(toLocalYMD(day) + 'T00:00:00');
                          const result = calculateScheduleForDate(staff, localDay);
                          const label = DAY_LABELS[day.getDay()];
                          return (
                            <div
                              key={i}
                              className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border ${result.isWork ? 'bg-[#1a1a1a] border-white/10' : 'border-dashed border-white/5'}`}
                            >
                              <span className="text-[8px] font-black uppercase text-white/40">{label}</span>
                              {result.isWork ? (
                                <span className="text-[7px] text-white/50 font-bold leading-tight text-center">
                                  {result.startTime}<br />{result.endTime}
                                </span>
                              ) : (
                                <span className="text-white/15 text-[8px]">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {staff.scheduleConfig.cycleReferenceDate && (
                        <p className="text-[8px] text-white/20">
                          Ref: {new Date(staff.scheduleConfig.cycleReferenceDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de edição de dia */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
                  {modal.date
                    ? `${DAY_LABELS_FULL[modal.dayOfWeek!]} ${modal.date ? new Date(modal.date + 'T00:00:00').toLocaleDateString('pt-BR') : ''}`
                    : `Escala base — ${DAY_LABELS_FULL[modal.dayOfWeek!]}`
                  }
                </p>
                <p className="text-white font-bold text-sm mt-0.5">{modal.staffName}</p>
              </div>
              <button onClick={() => setModal(null)} className="p-2 text-white/30 hover:text-white rounded-xl hover:bg-white/5">
                <X size={18} />
              </button>
            </div>

            {modal.date && (
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setModalIsFolga(f => !f)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${modalIsFolga ? 'bg-red-500' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${modalIsFolga ? 'left-5' : 'left-0.5'}`} />
                </div>
                <span className="text-sm font-bold text-white/70">Marcar como folga</span>
              </label>
            )}

            {!modalIsFolga && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1.5">
                    <label className="field-label">Entrada</label>
                    <input
                      type="time"
                      value={modalStart}
                      onChange={e => setModalStart(e.target.value)}
                      className="field-input w-full"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="field-label">Saída</label>
                    <input
                      type="time"
                      value={modalEnd}
                      onChange={e => setModalEnd(e.target.value)}
                      className="field-input w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {modal.date && (
              <div className="space-y-1.5">
                <label className="field-label">Motivo (opcional)</label>
                <input
                  type="text"
                  value={modalReason}
                  onChange={e => setModalReason(e.target.value)}
                  placeholder={modalIsFolga ? "Ex: Folga semanal" : "Ex: Troca de turno"}
                  className="field-input w-full"
                />
              </div>
            )}

            {modal.date && modal.existingSchedule && (
              <p className="text-[10px] text-white/30">
                Escala base: {modal.existingSchedule.startTime.slice(0, 5)}–{modal.existingSchedule.endTime.slice(0, 5)}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              {(modal.date ? modal.existingOverride : modal.existingSchedule) && (
                <button
                  onClick={modal.date ? handleDeleteOverride : handleDeleteBase}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl border border-red-900/50 text-red-400 text-xs font-bold uppercase tracking-wide hover:bg-red-950/30 transition-all disabled:opacity-50"
                >
                  Remover
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#E0FFFF]/10 border border-[#E0FFFF]/20 text-[#E0FFFF] text-xs font-bold uppercase tracking-wide hover:bg-[#E0FFFF]/20 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de configuração de tipo de escala */}
      {configModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Tipo de Escala</p>
                <p className="text-white font-bold text-sm mt-0.5">{configModal.staff.fullName}</p>
              </div>
              <button onClick={() => setConfigModal(null)} className="p-2 text-white/30 hover:text-white rounded-xl hover:bg-white/5">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="field-label">Tipo de escala</label>
              <select
                value={configType}
                onChange={e => setConfigType(e.target.value as ScheduleType)}
                className="field-input w-full"
              >
                <option value="5x2">5×2 — Segunda a Sexta</option>
                <option value="12x36">12×36 — Trabalha 12h, folga 36h</option>
                <option value="6x1">6×1 — Trabalha 6 dias, folga 1</option>
                <option value="custom">Custom — Configuração manual por dia</option>
              </select>
            </div>

            {configType !== 'custom' && (
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="field-label">Entrada</label>
                  <input
                    type="time"
                    value={configStart}
                    onChange={e => setConfigStart(e.target.value)}
                    className="field-input w-full"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="field-label">Saída</label>
                  <input
                    type="time"
                    value={configEnd}
                    onChange={e => setConfigEnd(e.target.value)}
                    className="field-input w-full"
                  />
                </div>
              </div>
            )}

            {(configType === '12x36' || configType === '6x1') && (
              <div className="space-y-1.5">
                <label className="field-label">
                  {configType === '12x36'
                    ? 'Data de referência (dia de TRABALHO)'
                    : 'Data de referência (1º dia de trabalho do ciclo)'}
                </label>
                <input
                  type="date"
                  value={configRefDate}
                  onChange={e => setConfigRefDate(e.target.value)}
                  className="field-input w-full"
                />
                <p className="text-[10px] text-white/30">
                  {configType === '12x36'
                    ? 'Selecione uma data em que este funcionário TRABALHA. O sistema alternará automaticamente.'
                    : 'Selecione o primeiro dia de uma sequência de 6 dias de trabalho.'}
                </p>
              </div>
            )}

            {configType === 'custom' && (
              <p className="text-[10px] text-white/30">
                Configure os dias e horários individualmente nos botões da grade abaixo do card do funcionário.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              {configType === '12x36' && configModal.staff.scheduleConfig?.cycleReferenceDate && (
                <button
                  onClick={handleInvertCycle}
                  disabled={configSaving}
                  className="flex-1 py-2.5 rounded-xl border border-yellow-900/50 text-yellow-400 text-xs font-bold uppercase tracking-wide hover:bg-yellow-950/30 transition-all disabled:opacity-50"
                >
                  Inverter ciclo
                </button>
              )}
              <button
                onClick={handleSaveConfig}
                disabled={configSaving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#E0FFFF]/10 border border-[#E0FFFF]/20 text-[#E0FFFF] text-xs font-bold uppercase tracking-wide hover:bg-[#E0FFFF]/20 transition-all disabled:opacity-50"
              >
                {configSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
