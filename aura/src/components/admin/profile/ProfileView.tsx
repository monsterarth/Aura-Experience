"use client";

import { useState, useEffect } from "react";
import { Staff, StaffSchedule, StaffScheduleOverride, ScheduleCheckpoint } from "@/types/aura";
import { useAuth } from "@/context/AuthContext";
import { StaffService } from "@/services/staff-service";
import { resolveEffectiveDaySchedule } from "@/lib/schedule-calculator";
import { PersonalScheduleCard } from "./PersonalScheduleCard";
import { ScrapWall } from "./ScrapWall";
import { TeammatesList } from "./TeammatesList";
import { ImageUpload } from "@/components/admin/ImageUpload";
import {
  Pencil, Check, X, Phone, Mail, Calendar,
  Clock, Loader2, UserCircle2, Settings, Trophy, Activity,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const ROLE_META: Record<string, { label: string; short: string; color: string; badgeCls: string }> = {
  super_admin: { label: "Super Admin",      short: "SA", color: "#9b6dff", badgeCls: "bg-purple-500/10 text-purple-400 border border-purple-500/25" },
  admin:       { label: "Administrador",    short: "AD", color: "#4ec9d4", badgeCls: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/25" },
  hr:          { label: "Gestão",           short: "GT", color: "#60a5fa", badgeCls: "bg-blue-500/10 text-blue-400 border border-blue-500/25" },
  reception:   { label: "Recepção",         short: "RC", color: "#2dd4bf", badgeCls: "bg-teal-500/10 text-teal-400 border border-teal-500/25" },
  governance:  { label: "Governança",       short: "GV", color: "#c084fc", badgeCls: "bg-purple-400/10 text-purple-300 border border-purple-400/25" },
  kitchen:     { label: "Cozinha",          short: "CZ", color: "#fb923c", badgeCls: "bg-orange-500/10 text-orange-400 border border-orange-500/25" },
  maintenance: { label: "Manutenção",       short: "MT", color: "#f59e0b", badgeCls: "bg-amber-500/10 text-amber-400 border border-amber-500/25" },
  marketing:   { label: "Marketing",        short: "MK", color: "#a3e635", badgeCls: "bg-lime-500/10 text-lime-400 border border-lime-500/25" },
};

function getRoleMeta(role?: string | null) {
  return ROLE_META[role ?? ""] ?? {
    label: role ?? "Staff", short: "ST", color: "#4ec9d4",
    badgeCls: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/25",
  };
}

function daysSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const SCHEDULE_LABELS: Record<string, string> = {
  "5x2": "5×2", "12x36": "12×36", "6x1": "6×1", "custom": "Personalizada",
};

interface Props {
  staffId: string;
  isOwnProfile: boolean;
}

export function ProfileView({ staffId, isOwnProfile }: Props) {
  const { userData: authUser, refreshUserData } = useAuth();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<"fullName" | "bio" | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [weekActivityCount, setWeekActivityCount] = useState<number | null>(null);
  const [nextDayOff, setNextDayOff] = useState<string | null>(null);
  const [activityLogs, setActivityLogs] = useState<Array<{ id: string; action: string; entity: string; details: string; timestamp: string }>>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (!staffId) return;
    fetch(`/api/admin/staff?staffId=${staffId}`)
      .then(r => r.json())
      .then(data => { if (data.staff) setStaff(data.staff); })
      .catch(() => toast.error("Erro ao carregar perfil."))
      .finally(() => setLoading(false));
  }, [staffId]);

  useEffect(() => {
    if (!staff) return;

    // Card 1: atividades dessa semana
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const startDate = monday.toISOString();

    fetch(`/api/admin/audit-logs/my-count?userId=${staff.id}&startDate=${encodeURIComponent(startDate)}`)
      .then(r => r.json())
      .then(data => setWeekActivityCount(data.count ?? 0))
      .catch(() => setWeekActivityCount(0));

    // Card 2: próxima folga
    if (!staff.scheduleType) { setNextDayOff(null); return; }

    const toYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(now);
    rangeEnd.setDate(now.getDate() + 30);

    Promise.all([
      StaffService.getStaffSchedules(staff.id).catch(() => [] as StaffSchedule[]),
      StaffService.getScheduleOverrides(staff.id, toYMD(tomorrow), toYMD(rangeEnd)).catch(() => [] as StaffScheduleOverride[]),
      StaffService.getStaffCheckpoints(staff.id).catch(() => [] as ScheduleCheckpoint[]),
    ]).then(([schedules, overrides, checkpoints]) => {
      const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      for (let i = 1; i <= 30; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() + i);
        date.setHours(12, 0, 0, 0);
        const dateStr = toYMD(date);
        const dayOverrides = overrides.filter(o => o.date === dateStr);
        const result = resolveEffectiveDaySchedule(staff, schedules, dayOverrides, date, checkpoints);
        if (!result.isWork) {
          setNextDayOff(DAY_NAMES[date.getDay()]);
          return;
        }
      }
      setNextDayOff(null);
    }).catch(() => setNextDayOff(null));
  }, [staff?.id, staff?.scheduleType]);

  useEffect(() => {
    if (isOwnProfile && authUser) setStaff(authUser);
  }, [isOwnProfile, authUser]);

  useEffect(() => {
    if (!staffId) return;
    setLogsLoading(true);
    fetch(`/api/admin/audit-logs?userId=${staffId}&limit=20`)
      .then(r => r.json())
      .then(data => setActivityLogs(data.logs ?? []))
      .catch(() => setActivityLogs([]))
      .finally(() => setLogsLoading(false));
  }, [staffId]);

  const startEdit = (field: "fullName" | "bio") => {
    setEditingField(field);
    setEditValue(staff?.[field] ?? "");
  };

  const saveField = async () => {
    if (!editingField || !staff) return;
    setSaving(true);
    try {
      await StaffService.updateStaff(staff.id, { [editingField]: editValue.trim() });
      setStaff(prev => prev ? { ...prev, [editingField]: editValue.trim() } : prev);
      if (isOwnProfile) await refreshUserData();
      setEditingField(null);
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (url: string) => {
    if (!staff) return;
    try {
      await StaffService.updateStaff(staff.id, { profilePictureUrl: url });
      setStaff(prev => prev ? { ...prev, profilePictureUrl: url } : prev);
      if (isOwnProfile) await refreshUserData();
    } catch {
      toast.error("Erro ao salvar foto.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <UserCircle2 size={48} className="mb-4 opacity-30" />
        <p className="text-base font-bold">Perfil não encontrado</p>
      </div>
    );
  }

  const roleMeta = getRoleMeta(staff.role);
  const days = daysSince(staff.hireDate);

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* ── Hero + Info card ── */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {/* Banner */}
        <div
          className="h-32 relative"
          style={{ background: `linear-gradient(135deg, ${roleMeta.color}33 0%, rgba(78,201,212,0.18) 100%)` }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(155,109,255,0.15),transparent_60%),radial-gradient(circle_at_80%_20%,rgba(78,201,212,0.1),transparent_50%)]" />
          {/* Botão configurações — canto superior direito, só no próprio perfil */}
          {isOwnProfile && (
            <Link
              href="/admin/perfil/configuracoes"
              className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white/80 hover:text-white bg-black/20 hover:bg-black/35 border border-white/10 transition-all backdrop-blur-sm"
            >
              <Settings size={13} />
              Configurações
            </Link>
          )}
        </div>

        <div className="px-6 pb-6">
          {/* Avatar + nome */}
          <div className="flex items-end gap-4 -mt-11 mb-4">
            <div
              className="relative flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden border-[3px] border-card shadow-lg"
              style={{ outline: `2px solid ${roleMeta.color}44` }}
            >
              {isOwnProfile ? (
                <ImageUpload
                  value={staff.profilePictureUrl ?? undefined}
                  onUploadSuccess={handlePhotoUpload}
                  path={`staff/${staff.id}`}
                />
              ) : staff.profilePictureUrl ? (
                <img src={staff.profilePictureUrl} alt={staff.fullName} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-xl font-black"
                  style={{ background: "linear-gradient(135deg,rgba(155,109,255,0.2),rgba(78,201,212,0.2))", color: roleMeta.color }}
                >
                  {roleMeta.short}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              {editingField === "fullName" ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveField(); if (e.key === "Escape") setEditingField(null); }}
                    className="flex-1 min-w-0 text-xl font-black bg-muted border border-border rounded-lg px-3 py-1 text-foreground outline-none"
                  />
                  <button onClick={saveField} disabled={saving} className="text-cyan-400 p-1 flex">
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  </button>
                  <button onClick={() => setEditingField(null)} className="text-muted-foreground p-1 flex">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black text-foreground leading-tight truncate">{staff.fullName}</h1>
                  {isOwnProfile && (
                    <button onClick={() => startEdit("fullName")} className="text-muted-foreground opacity-50 hover:opacity-100 p-1 flex transition-opacity">
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-0.5 rounded-full ${roleMeta.badgeCls}`}>
                  {roleMeta.label}
                </span>
                {days !== null && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Calendar size={11} />
                    Aqui há {days} {days === 1 ? "dia" : "dias"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            {/* Card 1 — Atividades essa semana */}
            <div className="bg-muted border border-border rounded-xl p-3 text-center">
              <div
                className="text-lg font-black"
                style={{ background: "linear-gradient(135deg,#9b6dff,#4ec9d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
              >
                {weekActivityCount ?? "—"}
              </div>
              <div className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wide mt-0.5">Atividades</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">essa semana no aura</div>
            </div>

            {/* Card 2 — Próxima folga */}
            <div className="bg-muted border border-border rounded-xl p-3 text-center">
              <div
                className="text-lg font-black"
                style={{ background: "linear-gradient(135deg,#9b6dff,#4ec9d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
              >
                {SCHEDULE_LABELS[staff.scheduleType ?? ""] ?? "—"}
              </div>
              <div className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wide mt-0.5">Escala</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {nextDayOff ? `próxima folga: ${nextDayOff}` : staff.scheduleType ? "sem folga em 30d" : "não configurada"}
              </div>
            </div>

            {/* Card 3 — Conquistas (placeholder) */}
            <div className="bg-muted border border-border rounded-xl p-3 text-center opacity-60">
              <div className="flex items-center justify-center">
                <Trophy size={20} className="text-muted-foreground" />
              </div>
              <div className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wide mt-0.5">Conquistas</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Em breve...</div>
            </div>
          </div>

          {/* Bio */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-widest">Bio</span>
              {isOwnProfile && editingField !== "bio" && (
                <button onClick={() => startEdit("bio")} className="text-muted-foreground opacity-50 hover:opacity-100 p-0.5 flex transition-opacity">
                  <Pencil size={11} />
                </button>
              )}
            </div>
            {editingField === "bio" ? (
              <div>
                <textarea
                  autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                  rows={3} maxLength={300}
                  className="w-full resize-none bg-muted border border-border rounded-xl px-3 py-2.5 text-[13px] text-foreground outline-none leading-relaxed"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={saveField} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#9b6dff,#4ec9d4)" }}
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar
                  </button>
                  <button onClick={() => setEditingField(null)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted border border-border text-muted-foreground">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <p className={`text-[13px] leading-relaxed ${staff.bio ? "text-foreground" : "text-muted-foreground italic"}`}>
                {staff.bio || (isOwnProfile ? "Clique no lápis para adicionar uma bio…" : "Sem bio.")}
              </p>
            )}
          </div>

          {/* Contatos */}
          {(staff.email || staff.phone || staff.birthDate) && (
            <div className="flex flex-wrap gap-2">
              {staff.email && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-full">
                  <Mail size={12} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{staff.email}</span>
                </div>
              )}
              {staff.phone && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-full">
                  <Phone size={12} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{staff.phone}</span>
                </div>
              )}
              {staff.birthDate && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-full">
                  <Clock size={12} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{formatDate(staff.birthDate)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Escala da semana — só perfil próprio */}
      {isOwnProfile && staff.propertyId && (
        <PersonalScheduleCard staff={staff} propertyId={staff.propertyId} />
      )}

      {/* Equipe — só perfil próprio */}
      {isOwnProfile && staff.propertyId && (
        <TeammatesList propertyId={staff.propertyId} currentStaffId={staff.id} />
      )}

      {/* Histórico de atividades */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Activity size={15} className="text-muted-foreground" />
          <span className="text-sm font-extrabold uppercase tracking-wide text-foreground">Atividades recentes</span>
        </div>
        {logsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-cyan-400" />
          </div>
        ) : activityLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Nenhuma atividade registrada.</p>
        ) : (
          <ul className="divide-y divide-border">
            {activityLogs.map(log => (
              <li key={log.id} className="flex items-start gap-3 px-5 py-3">
                <div className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                  <Activity size={11} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-foreground leading-snug truncate">{log.details}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(log.timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  {log.action}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mural de recados */}
      {staff.propertyId && (
        <ScrapWall
          profileStaffId={staff.id}
          isOwnProfile={isOwnProfile}
          propertyId={staff.propertyId}
        />
      )}
    </div>
  );
}
