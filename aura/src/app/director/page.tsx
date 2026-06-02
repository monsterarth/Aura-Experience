"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import {
  LayoutGrid, Calendar, Users, BarChart2,
  TrendingUp, AlertTriangle, Wrench, ChevronRight,
  Heart, Star, RefreshCw, Bell, Building2,
  Phone, Mail, X, Clock, Cake,
} from "lucide-react";
import { createClientBrowserAuto } from "@/lib/supabase-browser";
import { StaffService } from "@/services/staff-service";
import { resolveEffectiveDaySchedule } from "@/lib/schedule-calculator";
import { Staff, StaffSchedule, StaffScheduleOverride, ScheduleCheckpoint } from "@/types/aura";

// ── Styles ──────────────────────────────────────────────────────────────────

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
.dir-shell *  { box-sizing: border-box; }
.dir-shell    { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
.dir-scroll   { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.dir-scroll::-webkit-scrollbar { display: none; }
@keyframes dir-spin { to { transform: rotate(360deg) } }
@keyframes dir-pulse { 0%,100% { opacity:1 } 50% { opacity:.35 } }
@keyframes dir-slide-up { from { transform: translateY(100%); opacity:0 } to { transform: translateY(0); opacity:1 } }
.dir-shell button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.dir-shell button:not([disabled]):active { opacity: .7; transform: scale(.97); }
`;

// ── Design tokens ───────────────────────────────────────────────────────────

const T = {
  bg:           "#06080f",
  glass:        "rgba(255,255,255,0.035)",
  glass2:       "rgba(255,255,255,0.055)",
  glass3:       "rgba(255,255,255,0.08)",
  border:       "rgba(255,255,255,0.08)",
  border2:      "rgba(255,255,255,0.13)",
  text:         "#eef0f8",
  muted:        "rgba(238,240,248,0.42)",
  muted2:       "rgba(238,240,248,0.22)",
  g1:           "#9b6dff",
  g2:           "#4ec9d4",
  grad:         "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
  gradSoft:     "linear-gradient(135deg,rgba(155,109,255,0.18) 0%,rgba(78,201,212,0.18) 100%)",
  green:        "#2dd4bf",
  greenBg:      "rgba(45,212,191,0.1)",
  greenBorder:  "rgba(45,212,191,0.25)",
  amber:        "#f59e0b",
  amberBg:      "rgba(245,158,11,0.1)",
  amberBorder:  "rgba(245,158,11,0.28)",
  blue:         "#60a5fa",
  blueBg:       "rgba(96,165,250,0.1)",
  blueBorder:   "rgba(96,165,250,0.25)",
  violet:       "#c084fc",
  violetBg:     "rgba(192,132,252,0.1)",
  violetBorder: "rgba(192,132,252,0.25)",
  orange:       "#fb923c",
  orangeBg:     "rgba(251,146,60,0.1)",
  red:          "#f87171",
  redBg:        "rgba(248,113,113,0.1)",
  redBorder:    "rgba(248,113,113,0.25)",
  pink:         "#f472b6",
  pinkBg:       "rgba(244,114,182,0.1)",
  pinkBorder:   "rgba(244,114,182,0.25)",
};

// ── Equipe constants ─────────────────────────────────────────────────────────

type StaffWithSchedules = Staff & { schedules: StaffSchedule[] };

const ROLE_LABELS: Record<string, string> = {
  reception:   "Recepção",
  governance:  "Governanta",
  maid:        "Camareira",
  maintenance: "Coord. Manutenção",
  technician:  "Manutenção",
  kitchen:     "Cozinha",
  waiter:      "Garçom",
  porter:      "Porteiro",
  houseman:    "Mensageiro",
  marketing:   "Marketing",
  admin:       "Administrador",
  director:    "Diretor",
};

const ROLE_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  governance:  { color: "#c084fc", bg: "rgba(192,132,252,0.1)", border: "rgba(192,132,252,0.25)" },
  reception:   { color: "#2dd4bf", bg: "rgba(45,212,191,0.1)",  border: "rgba(45,212,191,0.22)"  },
  kitchen:     { color: "#fb923c", bg: "rgba(251,146,60,0.1)",  border: "rgba(251,146,60,0.22)"  },
  maintenance: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.22)"  },
  porter:      { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.22)"  },
  houseman:    { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.22)"  },
  technician:  { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.22)"  },
  marketing:   { color: "#f472b6", bg: "rgba(244,114,182,0.1)", border: "rgba(244,114,182,0.22)" },
  maid:        { color: "#9b6dff", bg: "rgba(155,109,255,0.1)", border: "rgba(155,109,255,0.22)" },
  waiter:      { color: "#4ec9d4", bg: "rgba(78,201,212,0.1)",  border: "rgba(78,201,212,0.22)"  },
};

function getRoleStyle(role: string) {
  return ROLE_COLORS[role] ?? { color: T.g1, bg: "rgba(155,109,255,0.1)", border: "rgba(155,109,255,0.22)" };
}

function toYMD(date: Date) { return date.toISOString().split("T")[0]; }
function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function getMonday(date: Date) {
  const d = new Date(date); const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); d.setHours(0, 0, 0, 0); return d;
}
function fmtTime(t: string) { return t.slice(0, 5); }
function initials(name: string) { return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(); }
function shiftLabel(start: string) { const h = parseInt(start.split(":")[0], 10); return h < 12 ? "Manhã" : h < 18 ? "Tarde" : "Noite"; }
function shiftColor(shift: string) {
  if (shift === "Manhã") return { color: T.amber, bg: T.amberBg };
  if (shift === "Tarde") return { color: T.blue,  bg: T.blueBg  };
  return { color: T.violet, bg: T.violetBg };
}

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ── Types ────────────────────────────────────────────────────────────────────

type DashData = {
  stats: {
    occupiedCabins: number; totalCabins: number;
    checkinsDone: number; checkinsTotal: number;
    checkoutsDone: number; checkoutsTotal: number;
    guestsOnProperty: number;
  };
  nps: {
    score: number | null; promoters: number; passives: number; detractors: number;
    distribution: { stars: number; count: number }[];
  };
  alerts: { type: string; title: string; desc: string; createdAt: string }[];
  ops: { hkActiveTasks: number; conciergeePending: number; fbOrdersToday: number; staffOnDuty: number };
  nextWedding: { id: string; coupleName: string; date: string; exclusive: boolean; guestCount: number; daysUntil: number } | null;
  weekOccupancy: { date: string; dayLabel: string; occupied: number; total: number; pct: number; checkinsExpected: number }[];
  monthStats: { occupancyPct: number; uniqueGuests: number; nightsSold: number; weddingsCount: number; maintenanceOrders: number; complaints: number };
  upcomingWeddings: { id: string; coupleName: string; date: string; exclusive: boolean; guestCount: number; daysUntil: number }[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function greeting(name: string) {
  const h = new Date().getHours();
  const greet = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const first = name?.split(" ")[0] ?? "";
  return `${greet}${first ? `, ${first}` : ""}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: T.glass2,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

function MiniCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      background: T.glass,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: color ?? T.text }}>{value}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2.5px solid ${T.border2}`, borderTopColor: T.g1, animation: "dir-spin .8s linear infinite" }} />
  );
}

function FinancePlaceholder({ label = "Módulo financeiro em breve" }: { label?: string }) {
  return (
    <div style={{
      border: `1.5px dashed ${T.border2}`, borderRadius: 16, padding: "20px 16px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center",
    }}>
      <TrendingUp size={28} color={T.muted2} />
      <span style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>{label}</span>
      <span style={{ fontSize: 12, color: T.muted2, lineHeight: 1.5 }}>
        Receita, ADR e RevPAR serão exibidos aqui quando o módulo for ativado
      </span>
    </div>
  );
}

// ── Tab: Hoje ────────────────────────────────────────────────────────────────

function TodayTab({ data, onOpenAgenda }: { data: DashData; onOpenAgenda: () => void }) {
  const occ = data.stats;
  const occPct = occ.totalCabins > 0 ? Math.round((occ.occupiedCabins / occ.totalCabins) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Ocupação hero */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Ocupação</div>
            <div style={{ fontSize: 42, fontWeight: 900, background: T.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.1 }}>{occPct}%</div>
            <div style={{ fontSize: 13, color: T.muted }}>{occ.occupiedCabins} / {occ.totalCabins} cabanas</div>
          </div>
          <Building2 size={32} color={T.g1} style={{ opacity: .5 }} />
        </div>
        {/* Barra */}
        <div style={{ height: 6, borderRadius: 99, background: T.glass3, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${occPct}%`, background: T.grad, borderRadius: 99, transition: "width .5s ease" }} />
        </div>
        {/* Sub-cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: T.gradSoft, border: `1px solid rgba(155,109,255,0.2)`, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Check-ins hoje</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.g1 }}>{occ.checkinsDone}<span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>/{occ.checkinsTotal}</span></div>
          </div>
          <div style={{ background: `rgba(78,201,212,0.08)`, border: `1px solid rgba(78,201,212,0.2)`, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Check-outs hoje</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.g2 }}>{occ.checkoutsDone}<span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>/{occ.checkoutsTotal}</span></div>
          </div>
        </div>
      </Card>

      {/* Receita placeholder */}
      <FinancePlaceholder />

      {/* NPS */}
      {data.nps.score !== null && (
        <Card>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Satisfação dos Hóspedes</div>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 40, fontWeight: 900, color: T.text, lineHeight: 1 }}>{data.nps.score?.toFixed(1)}</div>
              <div style={{ fontSize: 12, color: T.muted }}>/ 10 NPS</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              {data.nps.distribution.map(d => (
                <div key={d.stars} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 10, color: T.muted, width: 14 }}>{d.stars}★</div>
                  <div style={{ flex: 1, height: 4, borderRadius: 99, background: T.glass3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(d.count * 10, 100)}%`, background: T.grad, borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 10, color: T.muted2, width: 16, textAlign: "right" }}>{d.count}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "Promotores", val: data.nps.promoters, color: T.green, bg: T.greenBg },
              { label: "Neutros", val: data.nps.passives, color: T.amber, bg: T.amberBg },
              { label: "Detratores", val: data.nps.detractors, color: T.red, bg: T.redBg },
            ].map(p => (
              <div key={p.label} style={{ flex: 1, background: p.bg, borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: p.color }}>{p.val}%</div>
                <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>{p.label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Alertas */}
      {data.alerts.length > 0 && (
        <Card>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Alertas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.alerts.map((a, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "10px 12px", borderRadius: 12,
                background: a.type === 'detractor' ? T.redBg : T.amberBg,
                border: `1px solid ${a.type === 'detractor' ? T.redBorder : T.amberBorder}`,
              }}>
                {a.type === 'detractor'
                  ? <Star size={15} color={T.red} style={{ marginTop: 1, flexShrink: 0 }} />
                  : <Wrench size={15} color={T.amber} style={{ marginTop: 1, flexShrink: 0 }} />}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Operação agora */}
      <Card>
        <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Operação Agora</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <MiniCard label="Governança" value={data.ops.hkActiveTasks} color={T.violet} />
          <MiniCard label="Concierge" value={data.ops.conciergeePending} color={T.green} />
          <MiniCard label="F&B hoje" value={data.ops.fbOrdersToday} color={T.orange} />
          <MiniCard label="Hóspedes" value={occ.guestsOnProperty} color={T.blue} />
        </div>
      </Card>

      {/* Próximo evento */}
      {data.nextWedding && (
        <button onClick={onOpenAgenda} style={{
          background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16,
          display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", cursor: "pointer",
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: T.pinkBg, border: `1px solid ${T.pinkBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Heart size={20} color={T.pink} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>Próximo Casamento</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{data.nextWedding.coupleName}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{fmtDate(data.nextWedding.date)} · {data.nextWedding.guestCount} convidados</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 99,
              background: data.nextWedding.daysUntil <= 7 ? T.greenBg : T.blueBg,
              color: data.nextWedding.daysUntil <= 7 ? T.green : T.blue,
              border: `1px solid ${data.nextWedding.daysUntil <= 7 ? T.greenBorder : T.blueBorder}`,
            }}>{data.nextWedding.daysUntil}d</div>
            <ChevronRight size={14} color={T.muted2} />
          </div>
        </button>
      )}
    </div>
  );
}

// ── Tab: Semana ──────────────────────────────────────────────────────────────

function WeekTab({ data }: { data: DashData }) {
  const today = new Date().toISOString().split('T')[0];
  const maxPct = Math.max(...data.weekOccupancy.map(d => d.pct), 1);
  const totalCheckins = data.weekOccupancy.reduce((s, d) => s + d.checkinsExpected, 0);
  const avgOcc = Math.round(data.weekOccupancy.reduce((s, d) => s + d.pct, 0) / 7);
  const peakDay = data.weekOccupancy.reduce((best, d) => d.pct > best.pct ? d : best, data.weekOccupancy[0]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 14 }}>Ocupação — Próximos 7 dias</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
          {data.weekOccupancy.map(d => {
            const isToday = d.date === today;
            const barH = maxPct > 0 ? Math.max((d.pct / maxPct) * 64, 4) : 4;
            return (
              <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? T.g1 : T.muted }}>{d.pct}%</div>
                <div style={{
                  width: "100%", height: barH, borderRadius: 6,
                  background: isToday ? T.grad : T.glass3,
                  border: isToday ? "none" : `1px solid ${T.border}`,
                  transition: "height .3s ease",
                }} />
                <div style={{ fontSize: 10, color: isToday ? T.g1 : T.muted2, fontWeight: isToday ? 700 : 400 }}>{d.dayLabel}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <FinancePlaceholder label="Receita prevista — em breve" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <MiniCard label="Check-ins esperados" value={totalCheckins} color={T.g1} />
        <MiniCard label="Ocupação média" value={`${avgOcc}%`} color={T.g2} />
        <MiniCard label="Pico da semana" value={`${peakDay?.pct ?? 0}%`} color={T.violet} />
        <MiniCard label="Casamentos" value={data.upcomingWeddings.filter(w => w.daysUntil <= 7).length} color={T.pink} />
      </div>

      <Card>
        <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Chegadas por dia</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.weekOccupancy.filter(d => d.checkinsExpected > 0).map(d => (
            <div key={d.date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{d.dayLabel}</span>
                <span style={{ fontSize: 12, color: T.muted, marginLeft: 6 }}>{fmtDate(d.date)}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.g1 }}>{d.checkinsExpected} chegadas</div>
            </div>
          ))}
          {data.weekOccupancy.every(d => d.checkinsExpected === 0) && (
            <div style={{ fontSize: 13, color: T.muted2, textAlign: "center", padding: "8px 0" }}>Nenhuma chegada nos próximos 7 dias</div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Tab: Mês ──────────────────────────────────────────────────────────────────

function MonthTab({ data }: { data: DashData }) {
  const m = data.monthStats;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <FinancePlaceholder label="Receita do mês — em breve" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <MiniCard label="Ocupação" value={`${m.occupancyPct}%`} color={T.g1} />
        <MiniCard label="Hóspedes únicos" value={m.uniqueGuests} color={T.g2} />
        <MiniCard label="Diárias vendidas" value={m.nightsSold} color={T.violet} />
        <MiniCard label="Casamentos" value={m.weddingsCount} color={T.pink} />
      </div>

      <Card>
        <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Indicadores de Qualidade</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "NPS médio", val: data.nps.score !== null ? `${data.nps.score.toFixed(1)} / 10` : "–", color: T.green },
            { label: "Reclamações (NPS ≤ 6)", val: m.complaints, color: T.red },
            { label: "Ordens de manutenção", val: m.maintenanceOrders, color: T.amber },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 13, color: T.muted }}>{item.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.val}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Seção: Agenda ────────────────────────────────────────────────────────────

function AgendaSection({ data }: { data: DashData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Casamentos — próximos 30 dias</div>
      {data.upcomingWeddings.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: T.muted2, fontSize: 14 }}>Nenhum casamento agendado</div>
      )}
      {data.upcomingWeddings.map(w => (
        <div key={w.id} style={{
          background: T.glass2, border: `1px solid ${T.pinkBorder}`, borderRadius: 16, padding: 16,
          display: "flex", gap: 12, alignItems: "center",
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: T.pinkBg, border: `1px solid ${T.pinkBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Heart size={18} color={T.pink} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{w.coupleName}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              {fmtDate(w.date)} · {w.guestCount} convidados
              {w.exclusive && <span style={{ marginLeft: 6, fontSize: 10, color: T.violet, fontWeight: 600 }}>EXCLUSIVO</span>}
            </div>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99,
            background: w.daysUntil <= 7 ? T.greenBg : T.blueBg,
            color: w.daysUntil <= 7 ? T.green : T.blue,
            border: `1px solid ${w.daysUntil <= 7 ? T.greenBorder : T.blueBorder}`,
          }}>{w.daysUntil}d</div>
        </div>
      ))}
    </div>
  );
}

// ── Staff Profile Drawer ─────────────────────────────────────────────────────

function StaffProfileDrawer({ staff, eff, onClose }: {
  staff: StaffWithSchedules;
  eff: { isWork: boolean; startTime?: string; endTime?: string };
  onClose: () => void;
}) {
  const rs = getRoleStyle(staff.role);
  const shift = eff.isWork && eff.startTime ? shiftLabel(eff.startTime) : null;
  const sc = shift ? shiftColor(shift) : null;
  const age = staff.birthDate
    ? new Date().getFullYear() - new Date(staff.birthDate + "T12:00:00").getFullYear()
    : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }} onClick={onClose} />

      {/* Sheet */}
      <div style={{
        position: "relative", background: "#0d0f1a", borderRadius: "24px 24px 0 0",
        border: `1px solid ${T.border2}`, padding: "0 0 env(safe-area-inset-bottom,0px)",
        animation: "dir-slide-up .25s ease",
        maxHeight: "80dvh", overflowY: "auto",
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 99, background: T.border2, margin: "12px auto 0" }} />

        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 16, width: 32, height: 32, borderRadius: 99,
          background: T.glass3, border: `1px solid ${T.border}`, display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer", color: T.muted,
        }}><X size={14} /></button>

        {/* Avatar + nome */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "20px 20px 0" }}>
          {staff.profilePictureUrl ? (
            <img
              src={staff.profilePictureUrl}
              alt={staff.fullName}
              style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: `2px solid ${rs.color}` }}
            />
          ) : (
            <div style={{
              width: 80, height: 80, borderRadius: "50%", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 28, fontWeight: 800,
              background: rs.bg, border: `2px solid ${rs.border}`, color: rs.color,
            }}>{initials(staff.fullName)}</div>
          )}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{staff.fullName}</div>
            <div style={{
              display: "inline-block", fontSize: 12, fontWeight: 700, padding: "3px 10px",
              borderRadius: 99, background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color, marginTop: 6,
            }}>{ROLE_LABELS[staff.role] ?? staff.role}</div>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "16px 20px 0" }}>
          {eff.isWork && shift && sc && (
            <div style={{ background: sc.bg, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>Turno hoje</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: sc.color }}>{shift}</div>
              {eff.startTime && eff.endTime && (
                <div style={{ fontSize: 11, color: T.muted }}>{fmtTime(eff.startTime)}–{fmtTime(eff.endTime)}</div>
              )}
            </div>
          )}
          {!eff.isWork && (
            <div style={{ background: T.glass, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>Hoje</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.muted }}>Folga</div>
            </div>
          )}
          {age !== null && (
            <div style={{ background: T.glass, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>Idade</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{age} anos</div>
            </div>
          )}
          {staff.hireDate && (
            <div style={{ background: T.glass, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>Na empresa</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                desde {new Date(staff.hireDate + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
              </div>
            </div>
          )}
        </div>

        {/* Contatos */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 20px 24px" }}>
          {staff.email && (
            <a href={`mailto:${staff.email}`} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12,
              textDecoration: "none", color: T.text,
            }}>
              <Mail size={15} color={T.muted} />
              <span style={{ fontSize: 13 }}>{staff.email}</span>
            </a>
          )}
          {staff.phone && (
            <a href={`tel:${staff.phone}`} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12,
              textDecoration: "none", color: T.text,
            }}>
              <Phone size={15} color={T.muted} />
              <span style={{ fontSize: 13 }}>{staff.phone}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Folgas Hoje ───────────────────────────────────────────────────────────────

function FolgasHoje({ todaySchedules, onSelect }: {
  todaySchedules: { staff: StaffWithSchedules; eff: { isWork: boolean; startTime?: string; endTime?: string } }[];
  onSelect: (ts: { staff: StaffWithSchedules; eff: { isWork: boolean; startTime?: string; endTime?: string } }) => void;
}) {
  const [open, setOpen] = useState(false);
  const off = todaySchedules.filter(ts => !ts.eff.isWork);
  if (off.length === 0) return null;

  return (
    <div style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", background: "none", border: "none", cursor: "pointer",
        }}
      >
        {/* Avatares compactos empilhados */}
        <div style={{ display: "flex", flexShrink: 0 }}>
          {off.slice(0, 4).map((ts, i) => {
            const s = ts.staff;
            const rs = getRoleStyle(s.role);
            return s.profilePictureUrl ? (
              <img key={s.id} src={s.profilePictureUrl} alt={s.fullName} style={{
                width: 28, height: 28, borderRadius: "50%", objectFit: "cover",
                border: `2px solid ${T.bg}`, marginLeft: i === 0 ? 0 : -8, position: "relative", zIndex: 4 - i,
              }} />
            ) : (
              <div key={s.id} style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 10, fontWeight: 800,
                background: rs.bg, border: `2px solid ${T.bg}`, color: rs.color,
                marginLeft: i === 0 ? 0 : -8, position: "relative", zIndex: 4 - i,
              }}>{initials(s.fullName)}</div>
            );
          })}
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>Folgas hoje</span>
          <span style={{
            marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
            background: T.glass3, color: T.muted,
          }}>{off.length}</span>
        </div>
        <span style={{ fontSize: 14, color: T.muted2, transition: "transform .2s", display: "inline-block", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {off.map(ts => {
            const s = ts.staff;
            const rs = getRoleStyle(s.role);
            return (
              <button key={s.id} onClick={() => onSelect(ts)} style={{ display: "flex", gap: 10, alignItems: "center", opacity: 0.7, background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%", textAlign: "left" }}>
                {s.profilePictureUrl ? (
                  <img src={s.profilePictureUrl} alt={s.fullName} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: `2px solid ${rs.border}`, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: rs.bg, border: `2px solid ${rs.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: rs.color }}>
                    {initials(s.fullName)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.fullName}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{ROLE_LABELS[s.role] ?? s.role}</div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: T.glass3, color: T.muted }}>Folga</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Seção: Equipe ─────────────────────────────────────────────────────────────

function EquipeSection({ propertyId }: { propertyId: string }) {
  const [allStaff, setAllStaff] = useState<StaffWithSchedules[]>([]);
  const [overrides, setOverrides] = useState<StaffScheduleOverride[]>([]);
  const [checkpoints, setCheckpoints] = useState<ScheduleCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftFilter, setShiftFilter] = useState<"todos" | "manhã" | "tarde" | "noite">("todos");
  const [selectedStaff, setSelectedStaff] = useState<{ staff: StaffWithSchedules; eff: { isWork: boolean; startTime?: string; endTime?: string } } | null>(null);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = toYMD(today);
  const monday = getMonday(today);
  const fromYMD = toYMD(monday);
  const toYMDStr = toYMD(addDays(monday, 6));
  const currentMonth = today.getMonth();

  useEffect(() => {
    (async () => {
      try {
        const [sv, ov, cp] = await Promise.all([
          StaffService.getPropertyScheduleView(propertyId),
          StaffService.getPropertyScheduleOverrides(propertyId, fromYMD, toYMDStr),
          StaffService.getPropertyCheckpoints(propertyId),
        ]);
        setAllStaff((sv ?? []) as StaffWithSchedules[]);
        setOverrides(ov ?? []);
        setCheckpoints(cp ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [propertyId]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2.5px solid ${T.border2}`, borderTopColor: T.g1, animation: "dir-spin .8s linear infinite" }} />
    </div>
  );

  const todaySchedules = allStaff.map(s => {
    const ovDay = overrides.filter(o => o.date === todayStr);
    const eff = resolveEffectiveDaySchedule(s, s.schedules ?? [], ovDay, new Date(todayStr + "T00:00:00"), checkpoints);
    return { staff: s, eff };
  });

  const onDutyToday = todaySchedules.filter(ts => ts.eff.isWork);
  const activeStaff = allStaff.filter(s => s.active !== false).length;
  const birthdaysThisMonth = allStaff.filter(s => s.birthDate && new Date(s.birthDate + "T12:00:00").getMonth() === currentMonth);
  const offThisWeek = overrides.filter(o => !o.startTime).length;

  const weekCounts = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const dStr = toYMD(d);
    const count = allStaff.filter(s => {
      const ovDay = overrides.filter(o => o.date === dStr);
      return resolveEffectiveDaySchedule(s, s.schedules ?? [], ovDay, new Date(dStr + "T00:00:00"), checkpoints).isWork;
    }).length;
    return { dayLabel: DAY_SHORT[d.getDay()], date: dStr, count };
  });
  const maxCount = Math.max(...weekCounts.map(w => w.count), 1);

  const roleDist = allStaff.reduce((acc, s) => { acc[s.role] = (acc[s.role] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const roleEntries = Object.entries(roleDist).sort((a, b) => b[1] - a[1]);

  const filteredToday = shiftFilter === "todos"
    ? onDutyToday
    : onDutyToday.filter(ts => ts.eff.startTime && shiftLabel(ts.eff.startTime).toLowerCase() === shiftFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: "Equipe ativa", val: activeStaff, color: T.g1 },
          { label: "Hoje em turno", val: onDutyToday.length, color: T.g2 },
          { label: "Aniversários no mês", val: birthdaysThisMonth.length, color: T.pink },
          { label: "Folgas esta semana", val: offThisWeek, color: T.amber },
        ].map(k => (
          <div key={k.label} style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color, marginTop: 4 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Escala da semana */}
      <div style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 14 }}>Escala da Semana</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
          {weekCounts.map(w => {
            const isToday = w.date === todayStr;
            const barH = Math.max((w.count / maxCount) * 60, 4);
            return (
              <div key={w.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? T.g1 : T.muted }}>{w.count}</div>
                <div style={{ width: "100%", height: barH, borderRadius: 6, background: isToday ? T.grad : T.glass3, border: isToday ? "none" : `1px solid ${T.border}` }} />
                <div style={{ fontSize: 10, color: isToday ? T.g1 : T.muted2, fontWeight: isToday ? 700 : 400 }}>{w.dayLabel}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Distribuição por setor */}
      <div style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Por Setor</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {roleEntries.map(([role, count]) => {
            const rs = getRoleStyle(role);
            const pct = activeStaff > 0 ? Math.round((count / activeStaff) * 100) : 0;
            return (
              <div key={role}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: rs.color, fontWeight: 600 }}>{ROLE_LABELS[role] ?? role}</span>
                  <span style={{ fontSize: 12, color: T.muted }}>{count} ({pct}%)</span>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: T.glass3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: rs.color, borderRadius: 99, opacity: .8 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Equipe hoje */}
      <div style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Equipe Hoje</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {(["todos", "manhã", "tarde", "noite"] as const).map(f => (
            <button key={f} onClick={() => setShiftFilter(f)} style={{
              padding: "5px 12px", borderRadius: 99,
              border: `1px solid ${shiftFilter === f ? T.g1 : T.border}`,
              background: shiftFilter === f ? "rgba(155,109,255,0.15)" : T.glass,
              color: shiftFilter === f ? T.g1 : T.muted,
              fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
            }}>
              {f === "todos" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredToday.length === 0 && (
            <div style={{ textAlign: "center", padding: "16px 0", color: T.muted2, fontSize: 13 }}>Nenhum membro neste turno</div>
          )}
          {filteredToday.map(ts => {
            const { staff: s, eff } = ts;
            const rs = getRoleStyle(s.role);
            const shift = eff.startTime ? shiftLabel(eff.startTime) : "Turno";
            const sc = shiftColor(shift);
            return (
              <button key={s.id} onClick={() => setSelectedStaff({ staff: s, eff })} style={{
                display: "flex", gap: 12, alignItems: "center", background: "none",
                border: "none", cursor: "pointer", padding: 0, textAlign: "left", width: "100%",
              }}>
                {s.profilePictureUrl ? (
                  <img src={s.profilePictureUrl} alt={s.fullName} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid ${rs.border}` }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: rs.bg, border: `2px solid ${rs.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: rs.color }}>
                    {initials(s.fullName)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.fullName}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{ROLE_LABELS[s.role] ?? s.role}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                  {eff.startTime && eff.endTime && (
                    <div style={{ fontSize: 11, color: T.muted2 }}>{fmtTime(eff.startTime)}–{fmtTime(eff.endTime)}</div>
                  )}
                  <div style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: sc.bg, color: sc.color }}>{shift}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Folgas hoje */}
      <FolgasHoje todaySchedules={todaySchedules} onSelect={setSelectedStaff} />

      {/* Aniversários do mês */}
      {birthdaysThisMonth.length > 0 && (
        <div style={{ background: T.glass2, border: `1px solid ${T.pinkBorder}`, borderRadius: 16, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Cake size={13} color={T.pink} />
            <div style={{ fontSize: 11, color: T.pink, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Aniversários do Mês</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {birthdaysThisMonth.map(s => {
              const bDate = new Date(s.birthDate! + "T12:00:00");
              const thisYearBday = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
              const daysUntil = Math.ceil((thisYearBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const isSoon = daysUntil >= 0 && daysUntil <= 7;
              return (
                <button key={s.id} onClick={() => {
                  const ts = todaySchedules.find(t => t.staff.id === s.id);
                  setSelectedStaff({ staff: s as StaffWithSchedules, eff: ts?.eff ?? { isWork: false } });
                }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {s.profilePictureUrl ? (
                      <img src={s.profilePictureUrl} alt={s.fullName} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: `2px solid ${T.pinkBorder}` }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.pinkBg, border: `2px solid ${T.pinkBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: T.pink }}>
                        {initials(s.fullName)}
                      </div>
                    )}
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{s.fullName}</div>
                      <div style={{ fontSize: 11, color: T.muted }}>{ROLE_LABELS[s.role] ?? s.role}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <div style={{ fontSize: 12, color: T.muted }}>{bDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</div>
                    {isSoon && (
                      <div style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: T.pinkBg, color: T.pink, border: `1px solid ${T.pinkBorder}` }}>
                        {daysUntil === 0 ? "Hoje!" : `em ${daysUntil}d`}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Drawer de perfil */}
      {selectedStaff && (
        <StaffProfileDrawer
          staff={selectedStaff.staff}
          eff={selectedStaff.eff}
          onClose={() => setSelectedStaff(null)}
        />
      )}
    </div>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────

type NavSection = "home" | "agenda" | "equipe" | "relatorios";

function BottomNav({ active, onChange }: { active: NavSection; onChange: (s: NavSection) => void }) {
  const items: { id: NavSection; label: string; Icon: React.ElementType }[] = [
    { id: "home",       label: "Início",     Icon: LayoutGrid },
    { id: "agenda",     label: "Agenda",     Icon: Calendar },
    { id: "equipe",     label: "Equipe",     Icon: Users },
    { id: "relatorios", label: "Relatórios", Icon: BarChart2 },
  ];
  return (
    <div style={{
      display: "flex", borderTop: `1px solid ${T.border}`,
      background: "rgba(6,8,15,0.95)", backdropFilter: "blur(12px)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {items.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button key={id} onClick={() => onChange(id)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            gap: 4, padding: "10px 0", border: "none", background: "none", cursor: "pointer",
            color: isActive ? T.g1 : T.muted2,
          }}>
            <Icon size={20} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500 }}>{label}</span>
            {isActive && <div style={{ width: 18, height: 2, borderRadius: 99, background: T.g1 }} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function DirectorPage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();

  const [section, setSection] = useState<NavSection>("home");
  const [tab, setTab] = useState<"hoje" | "semana" | "mes">("hoje");
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const subscribedRef = useRef(false);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!property?.id) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/director/dashboard?propertyId=${property.id}`);
      if (res.ok) setData(await res.json());
    } finally {
      if (!silent) setLoading(false);
    }
  }, [property?.id]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Realtime
  useEffect(() => {
    if (!property?.id) return;
    const supabase = createClientBrowserAuto();
    const channel = supabase.channel(`director_rt_${property.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stays', filter: `propertyId=eq.${property.id}` }, () => loadDashboard(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `propertyId=eq.${property.id}` }, () => loadDashboard(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'concierge_requests', filter: `propertyId=eq.${property.id}` }, () => loadDashboard(true))
      .subscribe((status: string) => { subscribedRef.current = status === 'SUBSCRIBED'; });
    return () => { supabase.removeChannel(channel); };
  }, [property?.id, loadDashboard]);

  const handleNavChange = (s: NavSection) => {
    setSection(s);
  };

  if (loading) {
    return (
      <>
        <style>{STYLE}</style>
        <div className="dir-shell" style={{ display: "flex", flexDirection: "column", height: "100dvh", background: T.bg, color: T.text, overflow: "hidden", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Spinner />
          <span style={{ fontSize: 13, color: T.muted }}>Carregando dashboard…</span>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <style>{STYLE}</style>
        <div className="dir-shell" style={{ display: "flex", flexDirection: "column", height: "100dvh", background: T.bg, color: T.text, overflow: "hidden", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <AlertTriangle size={28} color={T.red} />
          <span style={{ fontSize: 13, color: T.muted }}>Erro ao carregar dados</span>
          <button onClick={() => loadDashboard()} style={{ fontSize: 12, color: T.g1, background: "none", border: "none", cursor: "pointer" }}>Tentar novamente</button>
        </div>
      </>
    );
  }

  const occPct = data.stats.totalCabins > 0 ? Math.round((data.stats.occupiedCabins / data.stats.totalCabins) * 100) : 0;

  return (
    <>
      <style>{STYLE}</style>
      <div className="dir-shell" style={{ display: "flex", flexDirection: "column", height: "100dvh", background: T.bg, color: T.text, overflow: "hidden" }}>

        {/* Scroll area */}
        <div className="dir-scroll" style={{ flex: 1 }}>
          <div style={{ padding: "20px 16px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Header */}
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{greeting(userData?.fullName ?? "")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.muted }}>
                  <span>{property?.name}</span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, animation: "dir-pulse 2s ease-in-out infinite", display: "inline-block" }} />
                  <span style={{ color: T.green, fontSize: 11, fontWeight: 600 }}>Sistema ativo</span>
                </div>
              </div>
              {data.stats.guestsOnProperty > 0 && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8,
                  fontSize: 12, fontWeight: 600, color: T.g2,
                  background: "rgba(78,201,212,0.08)", border: `1px solid rgba(78,201,212,0.2)`,
                  borderRadius: 99, padding: "3px 10px",
                }}>
                  <Bell size={11} />
                  {data.stats.guestsOnProperty} hóspedes agora na propriedade
                </div>
              )}
            </div>

            {/* Conteúdo por seção */}
            {section === "home" && (
              <>
                {/* Tabs */}
                <div style={{ display: "flex", gap: 4, background: T.glass, borderRadius: 12, padding: 4 }}>
                  {(["hoje", "semana", "mes"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                      flex: 1, padding: "8px 0", borderRadius: 9, border: "none", cursor: "pointer",
                      fontWeight: 700, fontSize: 13,
                      background: tab === t ? T.glass3 : "transparent",
                      color: tab === t ? T.text : T.muted,
                      transition: "all .2s",
                    }}>
                      {t === "hoje" ? "Hoje" : t === "semana" ? "Semana" : "Mês"}
                    </button>
                  ))}
                </div>

                {tab === "hoje" && <TodayTab data={data} onOpenAgenda={() => setSection("agenda")} />}
                {tab === "semana" && <WeekTab data={data} />}
                {tab === "mes" && <MonthTab data={data} />}
              </>
            )}

            {section === "agenda" && <AgendaSection data={data} />}

            {section === "equipe" && property?.id && <EquipeSection propertyId={property.id} />}

            {section === "relatorios" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 60 }}>
                <BarChart2 size={48} color={T.muted2} />
                <div style={{ fontSize: 16, fontWeight: 700, color: T.muted }}>Relatórios em breve</div>
                <div style={{ fontSize: 13, color: T.muted2, textAlign: "center", lineHeight: 1.6, maxWidth: 260 }}>
                  Relatórios gerenciais, exportações e análises comparativas serão disponibilizados em breve.
                </div>
              </div>
            )}

            {/* Botão de refresh */}
            <button onClick={() => loadDashboard()} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px", background: T.glass, border: `1px solid ${T.border}`,
              borderRadius: 12, color: T.muted2, fontSize: 12, cursor: "pointer", width: "100%",
            }}>
              <RefreshCw size={13} />
              Atualizar
            </button>

          </div>
        </div>

        <BottomNav active={section} onChange={handleNavChange} />
      </div>
    </>
  );
}
