"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import {
  LayoutGrid, Calendar, Users, BarChart2,
  TrendingUp, AlertTriangle, Wrench, ChevronRight,
  Heart, Star, RefreshCw, Bell, Building2,
} from "lucide-react";
import { createClientBrowserAuto } from "@/lib/supabase-browser";

// ── Styles ──────────────────────────────────────────────────────────────────

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
.dir-shell *  { box-sizing: border-box; }
.dir-shell    { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
.dir-scroll   { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.dir-scroll::-webkit-scrollbar { display: none; }
@keyframes dir-spin { to { transform: rotate(360deg) } }
@keyframes dir-pulse { 0%,100% { opacity:1 } 50% { opacity:.35 } }
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
  const router = useRouter();

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
    if (s === "equipe") { router.push("/director/equipe"); return; }
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
