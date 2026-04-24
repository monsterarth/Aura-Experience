"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users, Clock, Cake, Palmtree, ArrowRight, Loader2,
  Download, Plus, Layers, Calendar, Settings, FileText,
} from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StaffService } from "@/services/staff-service";
import { Staff, StaffSchedule, StaffScheduleOverride } from "@/types/aura";

// ── Types ──────────────────────────────────────────────────────────────────
type StaffWithSchedules = Staff & { schedules: StaffSchedule[] };

// ── Helpers ────────────────────────────────────────────────────────────────
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
  return date.toISOString().split("T")[0];
}

function fmtTime(t: string): string {
  return t.slice(0, 5);
}

// ── Constants ──────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  reception:   "Recepção",
  governance:  "Governanta",
  maid:        "Camareira",
  maintenance: "Manutenção",
  technician:  "Técnico",
  kitchen:     "Cozinha",
  waiter:      "Garçom",
  porter:      "Porteiro",
  houseman:    "Houseman",
  marketing:   "Marketing",
  hr:          "RH",
  admin:       "Administrador",
  super_admin: "Super Admin",
};

const ROLE_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  governance:  { color: "#c084fc", bg: "rgba(192,132,252,0.1)",  border: "rgba(192,132,252,0.25)" },
  reception:   { color: "#2dd4bf", bg: "rgba(45,212,191,0.1)",   border: "rgba(45,212,191,0.22)"  },
  kitchen:     { color: "#fb923c", bg: "rgba(251,146,60,0.1)",   border: "rgba(251,146,60,0.22)"  },
  maintenance: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)",   border: "rgba(245,158,11,0.22)"  },
  porter:      { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.22)"  },
  houseman:    { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.22)"  },
  technician:  { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.22)"  },
  marketing:   { color: "#f472b6", bg: "rgba(244,114,182,0.1)",  border: "rgba(244,114,182,0.22)" },
  maid:        { color: "#9b6dff", bg: "rgba(155,109,255,0.1)",  border: "rgba(155,109,255,0.22)" },
  waiter:      { color: "#4ec9d4", bg: "rgba(78,201,212,0.1)",   border: "rgba(78,201,212,0.22)"  },
  hr:          { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",   border: "rgba(96,165,250,0.22)"  },
  admin:       { color: "#4ec9d4", bg: "rgba(78,201,212,0.1)",   border: "rgba(78,201,212,0.22)"  },
  super_admin: { color: "#9b6dff", bg: "rgba(155,109,255,0.1)",  border: "rgba(155,109,255,0.22)" },
};

function getRoleStyle(role: string) {
  return ROLE_COLORS[role] ?? { color: "#9b6dff", bg: "rgba(155,109,255,0.1)", border: "rgba(155,109,255,0.22)" };
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ── Sub-components ─────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 300 }}>
      <Loader2 size={28} style={{ color: "rgba(238,240,248,0.3)", animation: "spin 1s linear infinite" }} />
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────
function HRDashboardContent() {
  const { userData } = useAuth();
  const { currentProperty } = useProperty();

  const [staffWithSchedules, setStaffWithSchedules] = useState<StaffWithSchedules[]>([]);
  const [weekOverrides, setWeekOverrides] = useState<StaffScheduleOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [filledBars, setFilledBars] = useState(false);
  const [shiftFilter, setShiftFilter] = useState<"todos" | "manhã" | "tarde" | "noite">("todos");

  useEffect(() => {
    const propertyId = currentProperty?.id ?? userData?.propertyId;
    if (!propertyId) return;

    async function load() {
      setLoading(true);
      try {
        const today = new Date();
        const weekStart = getMonday(today);
        const from = toYMD(weekStart);
        const to = toYMD(addDays(weekStart, 6));

        const [scheduleView, overrides] = await Promise.all([
          StaffService.getPropertyScheduleView(propertyId!),
          StaffService.getPropertyScheduleOverrides(propertyId!, from, to),
        ]);

        setStaffWithSchedules(scheduleView);
        setWeekOverrides(overrides);
      } catch {
        // silently fail — show zeros
      } finally {
        setLoading(false);
        setTimeout(() => setFilledBars(true), 200);
      }
    }

    load();
  }, [currentProperty?.id, userData?.propertyId]);

  // ── Derived metrics ──────────────────────────────────────────────────────
  const today = new Date();
  const todayYMD = toYMD(today);
  const todayDOW = today.getDay();
  const weekStart = getMonday(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const activeStaff = staffWithSchedules.filter(s => s.active);

  // KPI 1 — Equipe ativa
  const activeCount = activeStaff.length;

  // KPI 2 — Hoje em turno: staff working right now (base schedule for today OR non-null override)
  const todayWorking = activeStaff.filter(s => {
    const override = weekOverrides.find(o => o.staffId === s.id && o.date === todayYMD);
    if (override) return override.startTime !== null && override.startTime !== undefined;
    return s.schedules.some(sc => sc.dayOfWeek === todayDOW && sc.active);
  });

  // KPI 3 — Aniversários este mês
  const currentMonth = today.getMonth() + 1; // 1-based
  const birthdayStaff = activeStaff.filter(s => {
    if (!s.birthDate) return false;
    const mm = parseInt(s.birthDate.split("-")[1], 10);
    return mm === currentMonth;
  });

  // KPI 4 — Folgas esta semana
  const folgaCount = weekOverrides.filter(
    o => o.startTime === null || o.startTime === undefined
  ).length;

  // Shift turno classification
  function getTurno(startTime: string): "manhã" | "tarde" | "noite" {
    const h = parseInt(startTime.split(":")[0], 10);
    if (h < 12) return "manhã";
    if (h < 18) return "tarde";
    return "noite";
  }

  // Build today's shift list from real data
  type ShiftEntry = {
    id: string;
    name: string;
    initials: string;
    role: string;
    start: string;
    end: string;
    turno: "manhã" | "tarde" | "noite";
    profilePictureUrl?: string;
    roleColor: string;
    roleBg: string;
  };

  const todayShiftsRaw = activeStaff
    .map((s): ShiftEntry | null => {
      const override = weekOverrides.find(o => o.staffId === s.id && o.date === todayYMD);
      let start: string | null = null;
      let end: string | null = null;

      if (override) {
        if (override.startTime === null || override.startTime === undefined) return null; // folga
        start = override.startTime;
        end = override.endTime ?? null;
      } else {
        const base = s.schedules.find(sc => sc.dayOfWeek === todayDOW && sc.active);
        if (!base) return null;
        start = base.startTime;
        end = base.endTime;
      }

      if (!start) return null;
      const rs = getRoleStyle(s.role);
      return {
        id: s.id,
        name: s.fullName,
        initials: s.fullName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase(),
        role: ROLE_LABELS[s.role] ?? s.role,
        start: fmtTime(start),
        end: end ? fmtTime(end) : "—",
        turno: getTurno(start),
        profilePictureUrl: s.profilePictureUrl,
        roleColor: rs.color,
        roleBg: rs.bg,
      };
    })
    .filter((x): x is ShiftEntry => x !== null)
    .sort((a, b) => a.start.localeCompare(b.start));
  const todayShifts: ShiftEntry[] = todayShiftsRaw;

  const filteredShifts = shiftFilter === "todos"
    ? todayShifts
    : todayShifts.filter(s => s.turno === shiftFilter);

  // Distribution by department
  const deptDist = Object.entries(
    activeStaff.reduce<Record<string, { count: number; color: string }>>((acc, s) => {
      const label = ROLE_LABELS[s.role] ?? s.role;
      const rs = getRoleStyle(s.role);
      if (!acc[label]) acc[label] = { count: 0, color: rs.color };
      acc[label].count++;
      return acc;
    }, {})
  )
    .map(([label, { count, color }]) => ({ label, count, color }))
    .sort((a, b) => b.count - a.count);

  const totalStaff = activeStaff.length || 1;

  // Week bar chart data
  const weekBarData = weekDays.map((d, i) => {
    const dow = d.getDay();
    const ymd = toYMD(d);
    let shifts = 0;
    let folgas = 0;
    for (const s of activeStaff) {
      const override = weekOverrides.find(o => o.staffId === s.id && o.date === ymd);
      if (override) {
        if (override.startTime === null || override.startTime === undefined) folgas++;
        else shifts++;
      } else {
        if (s.schedules.some(sc => sc.dayOfWeek === dow && sc.active)) shifts++;
      }
    }
    return { day: DAY_LABELS[(i + 1) % 7], shifts, folgas, isToday: ymd === todayYMD };
  });

  const maxShifts = Math.max(...weekBarData.map(d => d.shifts), 1);
  const totalWeekShifts = weekBarData.reduce((a, d) => a + d.shifts, 0);

  // Birthdays list — sorted by upcoming date
  const birthdayList = birthdayStaff
    .map(s => {
      const [, mm, dd] = s.birthDate!.split("-").map(Number);
      const thisYear = new Date(today.getFullYear(), mm - 1, dd);
      const diff = Math.ceil((thisYear.getTime() - today.getTime()) / 86400000);
      const rs = getRoleStyle(s.role);
      return {
        id: s.id,
        name: s.fullName,
        initials: s.fullName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase(),
        role: ROLE_LABELS[s.role] ?? s.role,
        dateLabel: thisYear.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        daysLeft: diff < 0 ? diff + 365 : diff,
        color: rs.color,
        bg: rs.bg,
        border: rs.border,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const kpis = [
    {
      label: "Equipe ativa",
      value: String(activeCount),
      sub: "funcionários cadastrados",
      icon: Users,
      color: "#9b6dff",
      bg: "rgba(155,109,255,0.1)",
      border: "rgba(155,109,255,0.22)",
    },
    {
      label: "Hoje em turno",
      value: String(todayWorking.length),
      sub: `de ${activeCount} escalados`,
      icon: Clock,
      color: "#2dd4bf",
      bg: "rgba(45,212,191,0.08)",
      border: "rgba(45,212,191,0.22)",
    },
    {
      label: "Aniversários",
      value: String(birthdayStaff.length),
      sub: "este mês",
      icon: Cake,
      color: "#f472b6",
      bg: "rgba(244,114,182,0.08)",
      border: "rgba(244,114,182,0.22)",
    },
    {
      label: "Folgas esta semana",
      value: String(folgaCount),
      sub: "registradas na semana",
      icon: Palmtree,
      color: "#f59e0b",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.22)",
    },
  ];

  // ── Styles ───────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "var(--card, #0b0e18)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 20,
  };

  const sectionHeader: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 800,
    color: "var(--foreground, #eef0f8)",
  };

  const muted: React.CSSProperties = {
    fontSize: 11,
    color: "rgba(238,240,248,0.42)",
  };

  if (loading) return <Spinner />;

  const todayLabel = today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const weekLabel = `Sem ${Math.ceil((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 604800000)}`;

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 22,
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.08) transparent",
      }}
    >
      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
              padding: "2px 8px", borderRadius: 999,
              background: "rgba(96,165,250,0.08)", color: "#60a5fa",
              border: "1px solid rgba(96,165,250,0.22)",
            }}>
              RH · {currentProperty?.name ?? "Pousada"}
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-.4px", lineHeight: 1.1, color: "var(--foreground, #eef0f8)" }}>
            Dashboard{" "}
            <span style={{
              background: "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              Recursos Humanos
            </span>
          </h1>
          <p style={{ fontSize: 13, color: "rgba(238,240,248,0.42)", marginTop: 5, fontWeight: 500, textTransform: "capitalize" }}>
            {todayLabel} · {weekLabel}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <a
            href="/admin/staff"
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", borderRadius: 11,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.055)",
              color: "var(--foreground, #eef0f8)", fontSize: 13, fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Download size={14} style={{ color: "rgba(238,240,248,0.42)" }} />
            Relatório
          </a>
          <a
            href="/admin/staff"
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", borderRadius: 11, border: "none",
              background: "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
              color: "#fff", fontSize: 13, fontWeight: 800,
              textDecoration: "none",
              boxShadow: "0 4px 16px rgba(155,109,255,0.35)",
            }}
          >
            <Plus size={14} />
            Novo funcionário
          </a>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, position: "relative", overflow: "hidden" }}
            >
              <div style={{
                position: "absolute", top: -24, right: -24,
                width: 80, height: 80, borderRadius: "50%",
                background: `radial-gradient(circle,${k.color}18 0%,transparent 70%)`,
                pointerEvents: "none",
              }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: k.bg, border: `1px solid ${k.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={17} style={{ color: k.color }} strokeWidth={1.8} />
                </div>
                <ArrowRight size={13} style={{ color: "rgba(238,240,248,0.22)" }} />
              </div>
              <div>
                <div style={{ fontSize: 30, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: "-1px" }}>{k.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground, #eef0f8)", marginTop: 4 }}>{k.label}</div>
                <div style={{ fontSize: 11, color: "rgba(238,240,248,0.42)", marginTop: 2 }}>{k.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MAIN GRID: Equipe Hoje + Aniversários/Folgas ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>

        {/* LEFT — Equipe Hoje */}
        <div style={{ ...card, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{
            padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Users size={15} style={{ color: "#2dd4bf" }} />
              </div>
              <div>
                <div style={sectionHeader}>Equipe Hoje</div>
                <div style={muted}>
                  {today.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · {todayWorking.length} ativos agora
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["todos", "manhã", "tarde", "noite"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setShiftFilter(f)}
                  style={{
                    padding: "5px 11px", borderRadius: 8, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                    background: shiftFilter === f ? "linear-gradient(135deg,rgba(155,109,255,0.15),rgba(78,201,212,0.15))" : "rgba(255,255,255,0.035)",
                    color: shiftFilter === f ? "#9b6dff" : "rgba(238,240,248,0.42)",
                    border: `1px solid ${shiftFilter === f ? "rgba(155,109,255,0.28)" : "rgba(255,255,255,0.07)"}`,
                    transition: "all .15s",
                  }}
                >{f}</button>
              ))}
            </div>
          </div>

          <div style={{ overflowY: "auto", maxHeight: 340, scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
            {filteredShifts.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "rgba(238,240,248,0.3)", fontSize: 13 }}>
                Nenhum funcionário escalado para este turno
              </div>
            ) : filteredShifts.map(s => (
              <div
                key={s.id}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                  cursor: "pointer", transition: "background .15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.035)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ flexShrink: 0, position: "relative" }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 11,
                    background: s.roleBg,
                    border: `1px solid ${s.roleColor}35`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 900, color: s.roleColor,
                    overflow: "hidden",
                  }}>
                    {s.profilePictureUrl
                      ? <img src={s.profilePictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : s.initials
                    }
                  </div>
                  <div style={{
                    position: "absolute", bottom: 1, right: 1,
                    width: 9, height: 9, borderRadius: "50%",
                    background: "#2dd4bf",
                    border: "2px solid var(--card, #0b0e18)",
                    boxShadow: "0 0 6px rgba(45,212,191,.5)",
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--foreground, #eef0f8)" }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(238,240,248,0.42)", marginTop: 1 }}>{s.role}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "var(--foreground, #eef0f8)" }}>
                    <Clock size={12} style={{ color: "rgba(238,240,248,0.42)" }} />
                    {s.start} – {s.end}
                  </div>
                  <span style={{
                    display: "inline-flex", alignItems: "center",
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
                    padding: "2px 7px", borderRadius: 999,
                    ...(s.turno === "manhã"
                      ? { background: "rgba(245,158,11,0.08)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.22)" }
                      : s.turno === "tarde"
                      ? { background: "rgba(96,165,250,0.08)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.22)" }
                      : { background: "rgba(192,132,252,0.08)", color: "#c084fc", border: "1px solid rgba(192,132,252,0.22)" }),
                  }}>
                    {s.turno}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={{
            padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <span style={muted}>Mostrando {filteredShifts.length} escalas</span>
            <Link href="/admin/escalas" style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: 700, color: "#9b6dff",
              background: "none", border: "none", cursor: "pointer",
              textDecoration: "none",
            }}>
              Ver todas as escalas <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ANIVERSÁRIOS */}
          <div style={{ ...card, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 9,
                background: "rgba(244,114,182,0.08)", border: "1px solid rgba(244,114,182,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Cake size={14} style={{ color: "#f472b6" }} />
              </div>
              <div style={sectionHeader}>Aniversários</div>
              <span style={{
                marginLeft: "auto",
                display: "inline-flex", alignItems: "center",
                fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
                padding: "2px 8px", borderRadius: 999,
                background: "rgba(244,114,182,0.08)", color: "#f472b6",
                border: "1px solid rgba(244,114,182,0.22)",
              }}>Este mês</span>
            </div>

            {birthdayList.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(238,240,248,0.3)", textAlign: "center", padding: "12px 0" }}>
                Nenhum aniversário este mês
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {birthdayList.map(b => (
                  <div key={b.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 12px", borderRadius: 12,
                    background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)",
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                      background: b.bg, border: `1px solid ${b.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 900, color: b.color,
                    }}>{b.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--foreground, #eef0f8)" }}>{b.name}</div>
                      <div style={muted}>{b.role} · {b.dateLabel}</div>
                    </div>
                    {b.daysLeft <= 7 ? (
                      <span style={{
                        flexShrink: 0,
                        display: "inline-flex", alignItems: "center",
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.04em",
                        padding: "2px 7px", borderRadius: 999,
                        background: "rgba(244,114,182,0.08)", color: "#f472b6",
                        border: "1px solid rgba(244,114,182,0.22)",
                      }}>em {b.daysLeft}d</span>
                    ) : (
                      <span style={{
                        flexShrink: 0,
                        display: "inline-flex", alignItems: "center",
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.04em",
                        padding: "2px 7px", borderRadius: 999,
                        background: "rgba(255,255,255,0.05)", color: "rgba(238,240,248,0.42)",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}>{b.daysLeft}d</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FOLGAS DA SEMANA */}
          <div style={{ ...card, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 9,
                background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Palmtree size={14} style={{ color: "#f59e0b" }} />
              </div>
              <div style={sectionHeader}>Folgas da Semana</div>
              {folgaCount > 0 && (
                <span style={{
                  marginLeft: "auto",
                  display: "inline-flex", alignItems: "center",
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
                  padding: "2px 8px", borderRadius: 999,
                  background: "rgba(245,158,11,0.08)", color: "#f59e0b",
                  border: "1px solid rgba(245,158,11,0.22)",
                }}>{folgaCount} folgas</span>
              )}
            </div>

            {folgaCount === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(238,240,248,0.3)", textAlign: "center", padding: "12px 0" }}>
                Nenhuma folga registrada esta semana
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {weekOverrides
                  .filter(o => o.startTime === null || o.startTime === undefined)
                  .map(o => {
                    const staff = activeStaff.find(s => s.id === o.staffId);
                    if (!staff) return null;
                    const rs = getRoleStyle(staff.role);
                    const initials = staff.fullName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
                    const dateLabel = new Date(o.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
                    return (
                      <div key={o.id} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 12px", borderRadius: 12,
                        background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)",
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                          background: rs.bg, border: `1px solid ${rs.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 900, color: rs.color,
                        }}>{initials}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--foreground, #eef0f8)" }}>{staff.fullName}</div>
                          <div style={muted}>{ROLE_LABELS[staff.role] ?? staff.role} · {dateLabel}</div>
                        </div>
                        <span style={{
                          flexShrink: 0,
                          display: "inline-flex", alignItems: "center",
                          fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
                          padding: "2px 7px", borderRadius: 999,
                          background: "rgba(245,158,11,0.08)", color: "#f59e0b",
                          border: "1px solid rgba(245,158,11,0.22)",
                        }}>Folga</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM GRID: Distribuição + Escalas da Semana ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* DISTRIBUIÇÃO POR DEPARTAMENTO */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: "linear-gradient(135deg,rgba(155,109,255,0.15),rgba(78,201,212,0.15))",
              border: "1px solid rgba(155,109,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Layers size={14} style={{ color: "#9b6dff" }} />
            </div>
            <div>
              <div style={sectionHeader}>Distribuição da Equipe</div>
              <div style={muted}>{activeCount} funcionários ativos</div>
            </div>
          </div>

          {deptDist.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(238,240,248,0.3)", textAlign: "center", padding: "24px 0" }}>
              Nenhum funcionário cadastrado
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {deptDist.map(d => (
                <div key={d.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground, #eef0f8)" }}>{d.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: d.color }}>{d.count}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 999, background: d.color,
                      width: filledBars ? `${(d.count / totalStaff) * 100}%` : "0%",
                      boxShadow: `0 0 8px ${d.color}60`,
                      transition: "width 1s cubic-bezier(.4,0,.2,1)",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ESCALAS DA SEMANA */}
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Calendar size={14} style={{ color: "#60a5fa" }} />
            </div>
            <div>
              <div style={sectionHeader}>Escalas da Semana</div>
              <div style={muted}>
                {toYMD(weekStart).slice(5).replace("-", "/")} – {toYMD(addDays(weekStart, 6)).slice(5).replace("-", "/")} · {totalWeekShifts} turnos
              </div>
            </div>
            <span style={{
              marginLeft: "auto",
              display: "inline-flex", alignItems: "center",
              fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
              padding: "2px 8px", borderRadius: 999,
              background: "rgba(96,165,250,0.08)", color: "#60a5fa",
              border: "1px solid rgba(96,165,250,0.22)",
            }}>{weekLabel}</span>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 96 }}>
            {weekBarData.map((d, i) => {
              const h = Math.round((d.shifts / maxShifts) * 80);
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: d.isToday ? "#9b6dff" : "rgba(238,240,248,0.42)", marginBottom: 2 }}>
                    {d.shifts}
                  </div>
                  <div style={{
                    width: "100%", borderRadius: 6, overflow: "hidden",
                    display: "flex", flexDirection: "column", justifyContent: "flex-end",
                    height: 64, background: "rgba(255,255,255,0.08)",
                  }}>
                    <div style={{
                      width: "100%",
                      height: filledBars ? `${h}px` : "0px",
                      background: d.isToday
                        ? "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)"
                        : d.shifts > (maxShifts * 0.6) ? "rgba(96,165,250,0.4)" : "rgba(96,165,250,0.2)",
                      borderRadius: 6,
                      transition: "height .8s cubic-bezier(.4,0,.2,1)",
                      border: d.isToday ? "1px solid rgba(155,109,255,0.3)" : "none",
                      boxShadow: d.isToday ? "0 0 12px rgba(155,109,255,0.3)" : "none",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: d.isToday ? "#9b6dff" : "rgba(238,240,248,0.22)" }}>{d.day}</div>
                  {d.folgas > 0 && (
                    <div style={{ fontSize: 9, color: "rgba(238,240,248,0.22)", fontWeight: 600 }}>{d.folgas}f</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {[
          {
            label: "Gerenciar Equipe", icon: Users,
            color: "#9b6dff", bg: "rgba(155,109,255,0.1)", border: "rgba(155,109,255,0.22)",
            desc: "Adicionar e editar funcionários", href: "/admin/staff",
          },
          {
            label: "Ver Escalas", icon: Calendar,
            color: "#60a5fa", bg: "rgba(96,165,250,0.08)", border: "rgba(96,165,250,0.22)",
            desc: "Gestão de turnos e folgas", href: "/admin/escalas",
          },
          {
            label: "Logs de Auditoria", icon: FileText,
            color: "rgba(238,240,248,0.42)", bg: "rgba(255,255,255,0.035)", border: "rgba(255,255,255,0.12)",
            desc: "Histórico de ações", href: "/admin/audit",
          },
          {
            label: "Configurações", icon: Settings,
            color: "#2dd4bf", bg: "rgba(45,212,191,0.08)", border: "rgba(45,212,191,0.22)",
            desc: "Ajustes da propriedade", href: "/admin/settings",
          },
        ].map((a, i) => {
          const Icon = a.icon;
          return (
            <Link
              key={i}
              href={a.href}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10,
                padding: "16px 18px",
                background: "var(--card, #0b0e18)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16, cursor: "pointer",
                textDecoration: "none",
                transition: "all .15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.055)";
                (e.currentTarget as HTMLElement).style.borderColor = a.border;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "var(--card, #0b0e18)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)";
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: a.bg, border: `1px solid ${a.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={15} style={{ color: a.color }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--foreground, #eef0f8)" }}>{a.label}</div>
                <div style={{ fontSize: 11, color: "rgba(238,240,248,0.42)", marginTop: 2, lineHeight: 1.4 }}>{a.desc}</div>
              </div>
            </Link>
          );
        })}
      </div>

    </div>
  );
}

export default function HRDashboardPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "hr"]}>
      <HRDashboardContent />
    </RoleGuard>
  );
}
