"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StaffService } from "@/services/staff-service";
import {
  Staff, StaffSchedule, StaffScheduleOverride,
  ScheduleType, ScheduleConfig, ScheduleCheckpoint,
} from "@/types/aura";
import { resolveEffectiveDaySchedule, calculateScheduleForDate } from "@/lib/schedule-calculator";
import {
  ChevronLeft, ChevronRight, X, Save, Loader2,
  ClipboardCheck, AlertCircle, Settings, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

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

function formatDateFull(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface CellModalState {
  staffId: string;
  staffName: string;
  propertyId: string;
  date: string | null;
  dayOfWeek: number | null;
  existingSchedule?: StaffSchedule | null;
  existingOverride?: StaffScheduleOverride | null;
}

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
  const [checkpoints, setCheckpoints] = useState<ScheduleCheckpoint[]>([]);
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
  const [configFixedDayOff, setConfigFixedDayOff] = useState<number | null>(null);
  const [configWeekdayOverrides, setConfigWeekdayOverrides] = useState<Partial<Record<number, { startTime: string; endTime: string }>>>({});
  const [configSundayOffCycle, setConfigSundayOffCycle] = useState<boolean>(false);
  const [configEffectiveDate, setConfigEffectiveDate] = useState("");
  const [configSaving, setConfigSaving] = useState(false);

  // Checkpoint inline form (dentro do config modal)
  const [showCheckpointForm, setShowCheckpointForm] = useState(false);
  const [cpEffectiveDate, setCpEffectiveDate] = useState("");
  const [cpReferenceDate, setCpReferenceDate] = useState("");
  const [cpNote, setCpNote] = useState("");
  const [cpSaving, setCpSaving] = useState(false);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = toYMD(weekStart);
  const to = toYMD(addDays(weekStart, 6));

  const load = useCallback(async () => {
    const pId = property?.id || userData?.propertyId;
    if (!pId) return;
    setLoading(true);
    try {
      const [staffData, overrideData, checkpointData] = await Promise.all([
        StaffService.getPropertyScheduleView(pId),
        StaffService.getPropertyScheduleOverrides(pId, from, to),
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

  // --- Handlers do config modal ---

  const openConfigModal = (staff: StaffWithSchedules) => {
    setConfigModal({
      staff,
      propertyId: property?.id || userData?.propertyId || "",
    });
    setConfigType(staff.scheduleType || 'custom');
    setConfigStart(staff.scheduleConfig?.startTime || "08:00");
    setConfigEnd(staff.scheduleConfig?.endTime || "17:00");
    setConfigRefDate(staff.scheduleConfig?.cycleReferenceDate || "");
    setConfigFixedDayOff(staff.scheduleConfig?.fixedDayOff ?? null);
    setConfigWeekdayOverrides(staff.scheduleConfig?.weekdayTimeOverrides || {});
    setConfigSundayOffCycle(staff.scheduleConfig?.sundayOffCycle ?? false);
    setConfigEffectiveDate(toLocalYMD(new Date()));
    setShowCheckpointForm(false);
    setCpEffectiveDate("");
    setCpReferenceDate("");
    setCpNote("");
  };

  const handleSaveConfig = async () => {
    if (!configModal) return;
    if ((configType === '12x36' || configType === '6x1') && !configRefDate) {
      toast.error("Informe a data de referência para este tipo de escala.");
      return;
    }
    if (!configEffectiveDate) {
      toast.error("Informe a data de início de vigência desta regra.");
      return;
    }
    setConfigSaving(true);
    try {
      const oldConfig = configModal.staff.scheduleConfig;
      let history = oldConfig?.history ? [...oldConfig.history] : [];

      // Se havia uma configuração anterior, guarda ela no histórico
      if (oldConfig) {
        const effectiveDateObj = new Date(configEffectiveDate + 'T00:00:00');
        const endDateStr = toLocalYMD(addDays(effectiveDateObj, -1));
        
        // Remove 'history' do clone para não aninhar
        const { history: _, ...oldConfigData } = oldConfig;
        
        history.push({
          ...oldConfigData,
          endDate: endDateStr,
          scheduleType: configModal.staff.scheduleType!
        });
      }

      const scheduleConfig: ScheduleConfig = {
        scheduleType: configType,
        startTime: configStart,
        endTime: configEnd,
        ...(configRefDate ? { cycleReferenceDate: configRefDate } : {}),
        fixedDayOff: configFixedDayOff ?? null,
        weekdayTimeOverrides: Object.keys(configWeekdayOverrides).length > 0 ? configWeekdayOverrides : undefined,
        sundayOffCycle: configSundayOffCycle || undefined,
        history: history.length > 0 ? history : undefined,
      };
      
      await StaffService.updateScheduleConfig(configModal.staff.id, {
        scheduleType: configType,
        scheduleConfig,
      });
      toast.success("Tipo de escala salvo.");

      // Atualiza o staffList localmente para que o modal mostre valores corretos se reaberto
      setStaffList(prev => prev.map(s =>
        s.id === configModal.staff.id
          ? { ...s, scheduleType: configType, scheduleConfig }
          : s
      ));

      setConfigModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar configuração.");
    } finally {
      setConfigSaving(false);
    }
  };

  // --- Handlers de checkpoint ---

  const handleSaveCheckpoint = async () => {
    if (!configModal) return;
    if (!cpEffectiveDate || !cpReferenceDate) {
      toast.error("Preencha a data de vigência e a data de referência.");
      return;
    }
    setCpSaving(true);
    try {
      await StaffService.upsertScheduleCheckpoint({
        staffId: configModal.staff.id,
        propertyId: configModal.propertyId,
        effectiveDate: cpEffectiveDate,
        referenceDate: cpReferenceDate,
        note: cpNote || undefined,
      });
      toast.success("Checkpoint salvo.");
      setShowCheckpointForm(false);
      setCpEffectiveDate("");
      setCpReferenceDate("");
      setCpNote("");
      // Recarrega checkpoints sem fechar o modal
      const updated = await StaffService.getPropertyCheckpoints(configModal.propertyId);
      setCheckpoints(updated);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar checkpoint.");
    } finally {
      setCpSaving(false);
    }
  };

  const handleDeleteCheckpoint = async (id: string) => {
    if (!configModal) return;
    try {
      await StaffService.deleteScheduleCheckpoint(id);
      toast.success("Checkpoint removido.");
      const updated = await StaffService.getPropertyCheckpoints(configModal.propertyId);
      setCheckpoints(updated);
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover checkpoint.");
    }
  };

  // Pré-preenche checkpoint de inversão de ciclo (próximo dia de trabalho calculado)
  const prefillInvertCheckpoint = () => {
    if (!configModal) return;
    const staff = configModal.staff;
    const staffCheckpoints = checkpoints.filter(c => c.staffId === staff.id);

    const tomorrow = addDays(new Date(), 1);
    for (let i = 0; i < 30; i++) {
      const d = addDays(tomorrow, i);
      const localD = new Date(toLocalYMD(d) + 'T00:00:00');
      const result = calculateScheduleForDate(staff, localD, staffCheckpoints);
      if (result.isWork) {
        const nextWorkDate = toLocalYMD(d);
        // Inverte: a referência passa a ser o dia seguinte ao de trabalho atual
        const invertedRef = toLocalYMD(addDays(d, 1));
        setCpEffectiveDate(nextWorkDate);
        setCpReferenceDate(invertedRef);
        setCpNote("Rodízio — ciclo invertido");
        setShowCheckpointForm(true);
        return;
      }
    }
    toast.error("Não foi possível encontrar o próximo dia de trabalho nos próximos 30 dias.");
  };

  const staffCheckpointsForModal = configModal
    ? checkpoints.filter(c => c.staffId === configModal.staff.id).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
    : [];

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
          <Link
            href="/admin/escalas/mensal"
            className="text-[10px] font-black text-[#00BFFF] uppercase tracking-widest hover:opacity-70 transition-opacity px-3 py-2.5 border border-[#00BFFF]/20 rounded-xl"
          >
            Ver mês
          </Link>

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
                {filteredStaff.map((staff) => {
                  const staffCheckpoints = checkpoints.filter(c => c.staffId === staff.id);
                  return (
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
                          localDay,
                          staffCheckpoints
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
                  );
                })}
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
              {filteredStaff.map(staff => {
                const staffCheckpoints = checkpoints.filter(c => c.staffId === staff.id);
                return (
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
                            const isFixedOff = cfg.fixedDayOff != null && dow === cfg.fixedDayOff;
                            const isWork = dow >= 1 && dow <= 5 && !isFixedOff;
                            return (
                              <div
                                key={dow}
                                className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border ${
                                  isFixedOff
                                    ? 'border-dashed border-amber-900/30 bg-amber-950/20'
                                    : isWork
                                    ? 'bg-[#1a1a1a] border-white/10'
                                    : 'border-dashed border-white/5'
                                }`}
                              >
                                <span className="text-[8px] font-black uppercase text-white/40">{label}</span>
                                {isFixedOff ? (
                                  <span className="text-amber-600/60 text-[7px] font-bold">Folga</span>
                                ) : isWork ? (
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
                            const result = calculateScheduleForDate(staff, localDay, staffCheckpoints);
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
                        {staffCheckpoints.length > 0 && (
                          <p className="text-[8px] text-white/20">
                            {staffCheckpoints.length} checkpoint{staffCheckpoints.length > 1 ? 's' : ''} de ciclo
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="field-label">Entrada</label>
                  <input type="time" value={modalStart} onChange={e => setModalStart(e.target.value)} className="field-input w-full" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="field-label">Saída</label>
                  <input type="time" value={modalEnd} onChange={e => setModalEnd(e.target.value)} className="field-input w-full" />
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
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
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
                  <input type="time" value={configStart} onChange={e => setConfigStart(e.target.value)} className="field-input w-full" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="field-label">Saída</label>
                  <input type="time" value={configEnd} onChange={e => setConfigEnd(e.target.value)} className="field-input w-full" />
                </div>
              </div>
            )}

            {(configType === '12x36' || configType === '6x1') && (
              <div className="space-y-1.5">
                <label className="field-label">
                  {configType === '12x36' ? 'Ref. inicial (dia de TRABALHO)' : 'Ref. inicial (1º dia de trabalho do ciclo)'}
                </label>
                <input
                  type="date"
                  value={configRefDate}
                  onChange={e => setConfigRefDate(e.target.value)}
                  className="field-input w-full"
                />
                <p className="text-[10px] text-white/30">
                  {configType === '12x36'
                    ? 'Data em que o funcionário TRABALHA. Os checkpoints abaixo sobrepõem esta referência quando necessário.'
                    : 'Primeiro dia de uma sequência de 6 dias de trabalho.'}
                </p>
              </div>
            )}

            {configType === 'custom' && (
              <p className="text-[10px] text-white/30">
                Configure os dias e horários individualmente nos botões da grade abaixo do card do funcionário.
              </p>
            )}

            {configType !== 'custom' && (
              <div className="space-y-1.5">
                <label className="field-label">Dia de folga fixa</label>
                <select
                  value={configFixedDayOff ?? ''}
                  onChange={e => setConfigFixedDayOff(e.target.value === '' ? null : Number(e.target.value))}
                  className="field-input w-full"
                >
                  <option value="">Nenhuma</option>
                  {DAY_LABELS_FULL.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-white/30">
                  Dia da semana que sempre será folga, independente do ciclo. Overrides pontuais têm prioridade.
                </p>
              </div>
            )}

            {/* Horário diferente por dia da semana — todos os tipos exceto custom */}
            {configType !== 'custom' && (() => {
              // Para 5x2: dias 1-5; para 6x1/12x36: Dom-Sáb
              const dows = configType === '5x2' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
              return (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Horário por dia da semana</p>
                  <p className="text-[10px] text-white/30">Clique <span className="font-bold">+</span> em um dia para definir um horário diferente. Deixe sem override para usar o padrão.</p>
                  <div className={`grid gap-2 ${configType === '5x2' ? 'grid-cols-5' : 'grid-cols-7'}`}>
                    {dows.map(dow => {
                      const hasOverride = !!configWeekdayOverrides[dow];
                      return (
                        <div key={dow} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase text-white/50">{DAY_LABELS[dow]}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setConfigWeekdayOverrides(prev => {
                                  const next = { ...prev };
                                  if (next[dow]) { delete next[dow]; }
                                  else { next[dow] = { startTime: configStart, endTime: configEnd }; }
                                  return next;
                                });
                              }}
                              className={`text-[8px] font-black px-1 py-0.5 rounded transition-colors ${hasOverride ? 'text-[#00BFFF] bg-[#00BFFF]/10' : 'text-white/20 hover:text-white/50'}`}
                            >
                              {hasOverride ? '✓' : '+'}
                            </button>
                          </div>
                          {hasOverride && (
                            <div className="space-y-1">
                              <input
                                type="time"
                                value={configWeekdayOverrides[dow]?.startTime || ''}
                                onChange={e => setConfigWeekdayOverrides(prev => ({
                                  ...prev,
                                  [dow]: { startTime: e.target.value, endTime: prev[dow]?.endTime || configEnd }
                                }))}
                                className="field-input w-full text-[9px] py-1 px-2"
                              />
                              <input
                                type="time"
                                value={configWeekdayOverrides[dow]?.endTime || ''}
                                onChange={e => setConfigWeekdayOverrides(prev => ({
                                  ...prev,
                                  [dow]: { startTime: prev[dow]?.startTime || configStart, endTime: e.target.value }
                                }))}
                                className="field-input w-full text-[9px] py-1 px-2"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Regra de domingo para 6x1 — ciclo 3 trabalha / 1 folga */}
            {configType === '6x1' && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Regra de Domingo</p>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div
                    onClick={() => setConfigSundayOffCycle(v => !v)}
                    className={`mt-0.5 w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                      configSundayOffCycle ? 'bg-[#00BFFF]' : 'bg-white/10'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                      configSundayOffCycle ? 'left-4' : 'left-0.5'
                    }`} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white/70">Ciclo de domingo: trabalha 3, folga 1</p>
                    <p className="text-[10px] text-white/30 mt-0.5">
                      O colaborador folga no 4º domingo de cada ciclo, contando a partir da data de referência inicial. Overrides pontuais têm prioridade.
                    </p>
                  </div>
                </label>
              </div>
            )}

            <div className="space-y-1.5 border-t border-white/10 pt-3">
              <label className="field-label">A partir de qual data esta regra vale?</label>
              <input
                type="date"
                value={configEffectiveDate}
                onChange={e => setConfigEffectiveDate(e.target.value)}
                className="field-input w-full"
              />
              <p className="text-[10px] text-white/30">
                Se a regra anterior já estava em uso, ela será guardada no histórico e manterá o cálculo passado correto.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveConfig}
                disabled={configSaving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#E0FFFF]/10 border border-[#E0FFFF]/20 text-[#E0FFFF] text-xs font-bold uppercase tracking-wide hover:bg-[#E0FFFF]/20 transition-all disabled:opacity-50"
              >
                {configSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar tipo
              </button>
            </div>

            {/* Seção de checkpoints — apenas para 12x36 e 6x1 */}
            {(configType === '12x36' || configType === '6x1') && (
              <div className="space-y-3 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Histórico de Ciclo</p>
                  <div className="flex gap-2">
                    {configModal.staff.scheduleType && (configModal.staff.scheduleType === '12x36' || configModal.staff.scheduleType === '6x1') && (
                      <button
                        onClick={prefillInvertCheckpoint}
                        className="text-[9px] font-black uppercase tracking-wide text-yellow-400/70 hover:text-yellow-400 transition-colors px-2 py-1 rounded-lg border border-yellow-900/30 hover:border-yellow-900/60"
                      >
                        Inverter ciclo
                      </button>
                    )}
                    <button
                      onClick={() => { setShowCheckpointForm(f => !f); setCpEffectiveDate(""); setCpReferenceDate(""); setCpNote(""); }}
                      className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-[#00BFFF]/70 hover:text-[#00BFFF] transition-colors px-2 py-1 rounded-lg border border-[#00BFFF]/20 hover:border-[#00BFFF]/40"
                    >
                      <Plus size={10} />
                      Adicionar
                    </button>
                  </div>
                </div>

                {/* Form inline de novo checkpoint */}
                {showCheckpointForm && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                    <p className="text-[9px] font-black uppercase tracking-wide text-white/40">Novo checkpoint</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="field-label">A partir de</label>
                        <input
                          type="date"
                          value={cpEffectiveDate}
                          onChange={e => setCpEffectiveDate(e.target.value)}
                          className="field-input w-full"
                        />
                        <p className="text-[9px] text-white/25">Quando entra em vigor</p>
                      </div>
                      <div className="space-y-1">
                        <label className="field-label">Dia de referência</label>
                        <input
                          type="date"
                          value={cpReferenceDate}
                          onChange={e => setCpReferenceDate(e.target.value)}
                          className="field-input w-full"
                        />
                        <p className="text-[9px] text-white/25">
                          {configType === '12x36' ? 'Dia que TRABALHA' : '1º dia do ciclo de 6'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="field-label">Nota (opcional)</label>
                      <input
                        type="text"
                        value={cpNote}
                        onChange={e => setCpNote(e.target.value)}
                        placeholder="Ex: Rodízio com João, Retorno de férias..."
                        className="field-input w-full"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCheckpointForm(false)}
                        className="flex-1 py-2 rounded-xl border border-white/10 text-white/40 text-xs font-bold hover:bg-white/5 transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveCheckpoint}
                        disabled={cpSaving}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-[#E0FFFF]/10 border border-[#E0FFFF]/20 text-[#E0FFFF] text-xs font-bold hover:bg-[#E0FFFF]/20 transition-all disabled:opacity-50"
                      >
                        {cpSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Salvar
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista de checkpoints existentes */}
                {staffCheckpointsForModal.length === 0 ? (
                  <p className="text-[10px] text-white/20 text-center py-3">
                    Nenhum checkpoint. A referência inicial do tipo é usada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {staffCheckpointsForModal.map(cp => (
                      <div key={cp.id} className="flex items-start justify-between gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-white/70">A partir de {formatDateFull(cp.effectiveDate)}</span>
                            {cp.effectiveDate > toLocalYMD(new Date()) && (
                              <span className="text-[8px] font-black uppercase tracking-wide text-[#00BFFF]/60 bg-[#00BFFF]/10 px-1.5 py-0.5 rounded-full">Futuro</span>
                            )}
                          </div>
                          <p className="text-[9px] text-white/40">Ref: {formatDateFull(cp.referenceDate)}</p>
                          {cp.note && <p className="text-[9px] text-white/30 truncate">{cp.note}</p>}
                        </div>
                        <button
                          onClick={() => handleDeleteCheckpoint(cp.id)}
                          className="text-white/20 hover:text-red-400 transition-colors shrink-0 p-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
