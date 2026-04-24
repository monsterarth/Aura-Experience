"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StaffService } from "@/services/staff-service";
import { Staff, StaffSchedule, StaffScheduleOverride } from "@/types/aura";
import {
  ChevronLeft, ChevronRight, X, Save, Loader2, ClipboardCheck, AlertCircle
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

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

interface CellModalState {
  staffId: string;
  staffName: string;
  propertyId: string;
  // null = escala base; string = data específica (override)
  date: string | null;
  dayOfWeek: number | null;
  // Valores existentes
  existingSchedule?: StaffSchedule | null;
  existingOverride?: StaffScheduleOverride | null;
}

export default function EscalasPage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();

  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [staffList, setStaffList] = useState<StaffWithSchedules[]>([]);
  const [overrides, setOverrides] = useState<StaffScheduleOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [modal, setModal] = useState<CellModalState | null>(null);
  const [modalStart, setModalStart] = useState("");
  const [modalEnd, setModalEnd] = useState("");
  const [modalReason, setModalReason] = useState("");
  const [modalIsFolga, setModalIsFolga] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const getScheduleForDay = (staff: StaffWithSchedules, dayOfWeek: number): StaffSchedule | undefined =>
    staff.schedules.find(s => s.dayOfWeek === dayOfWeek && s.active);

  const getOverrideForDay = (staffId: string, date: Date): StaffScheduleOverride | undefined =>
    overrides.find(o => o.staffId === staffId && o.date === toYMD(date));

  const openBaseModal = (staff: StaffWithSchedules, dayOfWeek: number) => {
    const existing = getScheduleForDay(staff, dayOfWeek);
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
    setModalIsFolga(!existing?.active && !!existing);
  };

  const openOverrideModal = (staff: StaffWithSchedules, date: Date) => {
    const dayOfWeek = date.getDay();
    const baseSchedule = getScheduleForDay(staff, dayOfWeek);
    const existing = getOverrideForDay(staff.id, date);
    setModal({
      staffId: staff.id,
      staffName: staff.fullName,
      propertyId: property?.id || userData?.propertyId || "",
      date: toYMD(date),
      dayOfWeek,
      existingSchedule: baseSchedule,
      existingOverride: existing,
    });
    if (existing) {
      setModalIsFolga(!existing.startTime);
      setModalStart(existing.startTime?.slice(0, 5) || baseSchedule?.startTime?.slice(0, 5) || "07:00");
      setModalEnd(existing.endTime?.slice(0, 5) || baseSchedule?.endTime?.slice(0, 5) || "15:00");
      setModalReason(existing.reason || "");
    } else {
      setModalIsFolga(false);
      setModalStart(baseSchedule?.startTime?.slice(0, 5) || "07:00");
      setModalEnd(baseSchedule?.endTime?.slice(0, 5) || "15:00");
      setModalReason("");
    }
  };

  const handleSave = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      if (modal.date === null && modal.dayOfWeek !== null) {
        // Salvar escala base
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
        // Salvar override
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

          {/* Filtro de cargo */}
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
                    const isToday = toYMD(day) === toYMD(new Date());
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
                        </div>
                      </div>
                    </td>

                    {/* Células por dia */}
                    {weekDays.map((day, i) => {
                      const override = getOverrideForDay(staff.id, day);
                      const base = getScheduleForDay(staff, day.getDay());
                      const isToday = toYMD(day) === toYMD(new Date());

                      let cellContent: React.ReactNode;
                      let cellStyle = "bg-transparent";

                      if (override) {
                        if (!override.startTime) {
                          // Folga
                          cellStyle = "bg-red-950/30 border-red-900/30";
                          cellContent = (
                            <span className="text-red-400 font-bold text-[9px] uppercase tracking-wide">Folga</span>
                          );
                        } else {
                          // Override com horário
                          cellStyle = "bg-blue-950/30 border-blue-900/30";
                          cellContent = (
                            <span className="text-blue-300 font-bold text-[9px]">
                              {override.startTime.slice(0, 5)}–{override.endTime?.slice(0, 5)}
                            </span>
                          );
                        }
                      } else if (base) {
                        cellStyle = "bg-[#111]";
                        cellContent = (
                          <span className="text-white/50 font-bold text-[9px]">
                            {base.startTime.slice(0, 5)}–{base.endTime.slice(0, 5)}
                          </span>
                        );
                      } else {
                        cellContent = (
                          <span className="text-white/15 text-[9px]">—</span>
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

        {/* Legenda + botão de escala base */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/40">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#111] border border-white/10 inline-block" />Escala base</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-950/50 border border-blue-900/30 inline-block" />Override</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-950/30 border border-red-900/30 inline-block" />Folga</span>
          </div>
          <p className="text-[10px] text-white/30">Clique em uma célula para editar o dia. Use a escala base para definir o padrão semanal.</p>
        </div>

        {/* Seção de escala base por funcionário */}
        {filteredStaff.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 pt-4 border-t border-white/5">
              Escalas Base (Padrão Semanal)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredStaff.map(staff => (
                <div key={staff.id} className="bg-[#111] border border-white/10 rounded-2xl p-4 space-y-3">
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
                  <div className="grid grid-cols-7 gap-1">
                    {DAY_LABELS.map((label, dow) => {
                      const sched = getScheduleForDay(staff, dow);
                      return (
                        <button
                          key={dow}
                          onClick={() => openBaseModal(staff, dow)}
                          className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all hover:opacity-80 ${sched ? 'bg-[#1a1a1a] border-white/10' : 'border-dashed border-white/10 hover:border-white/20'}`}
                          title={`${DAY_LABELS_FULL[dow]}`}
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
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de edição */}
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

            {/* Folga toggle (apenas para override de data específica) */}
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

            {/* Info sobre escala base */}
            {modal.date && modal.existingSchedule && (
              <p className="text-[10px] text-white/30">
                Escala base: {modal.existingSchedule.startTime.slice(0, 5)}–{modal.existingSchedule.endTime.slice(0, 5)}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              {/* Botão de remover */}
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
    </RoleGuard>
  );
}
