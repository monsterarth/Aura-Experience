"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { StaffService } from "@/services/staff-service";
import { resolveEffectiveDaySchedule } from "@/lib/schedule-calculator";
import { Staff, StaffSchedule, StaffScheduleOverride, ScheduleCheckpoint } from "@/types/aura";
import { ArrowLeft, Users, Clock, Cake } from "lucide-react";

// ── Styles ────────────────────────────────────────────────────────────────────

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
.dir-shell *  { box-sizing: border-box; }
.dir-shell    { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
.dir-scroll   { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.dir-scroll::-webkit-scrollbar { display: none; }
@keyframes dir-spin { to { transform: rotate(360deg) } }
.dir-shell button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.dir-shell button:not([disabled]):active { opacity: .7; transform: scale(.97); }
`;

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
  green:        "#2dd4bf",
  greenBg:      "rgba(45,212,191,0.1)",
  greenBorder:  "rgba(45,212,191,0.25)",
  amber:        "#f59e0b",
  amberBg:      "rgba(245,158,11,0.1)",
  blue:         "#60a5fa",
  blueBg:       "rgba(96,165,250,0.1)",
  pink:         "#f472b6",
  pinkBg:       "rgba(244,114,182,0.1)",
  pinkBorder:   "rgba(244,114,182,0.25)",
  violet:       "#c084fc",
  violetBg:     "rgba(192,132,252,0.1)",
  violetBorder: "rgba(192,132,252,0.25)",
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
};

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ── Helpers ───────────────────────────────────────────────────────────────────

type StaffWithSchedules = Staff & { schedules: StaffSchedule[] };

function toYMD(date: Date) { return date.toISOString().split("T")[0]; }
function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function fmtTime(t: string) { return t.slice(0, 5); }

function shiftLabel(start: string): string {
  const h = parseInt(start.split(":")[0], 10);
  if (h < 12) return "Manhã";
  if (h < 18) return "Tarde";
  return "Noite";
}

function shiftColor(shift: string) {
  if (shift === "Manhã")  return { color: T.amber, bg: T.amberBg };
  if (shift === "Tarde")  return { color: T.blue,  bg: T.blueBg };
  if (shift === "Noite")  return { color: T.violet, bg: T.violetBg };
  return { color: T.g2, bg: T.greenBg };
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function getRoleStyle(role: string) {
  return ROLE_COLORS[role] ?? { color: T.g1, bg: "rgba(155,109,255,0.1)", border: "rgba(155,109,255,0.22)" };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DirectorEquipePage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();
  const router = useRouter();

  const [allStaff, setAllStaff] = useState<StaffWithSchedules[]>([]);
  const [overrides, setOverrides] = useState<StaffScheduleOverride[]>([]);
  const [checkpoints, setCheckpoints] = useState<ScheduleCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftFilter, setShiftFilter] = useState<"todos" | "manhã" | "tarde" | "noite">("todos");

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = toYMD(today);
  const monday = getMonday(today);
  const fromYMD = toYMD(monday);
  const toYMDStr = toYMD(addDays(monday, 6));
  const currentMonth = today.getMonth();

  useEffect(() => {
    if (!property?.id) return;
    (async () => {
      try {
        const [sv, ov, cp] = await Promise.all([
          StaffService.getPropertyScheduleView(property.id),
          StaffService.getPropertyScheduleOverrides(property.id, fromYMD, toYMDStr),
          StaffService.getPropertyCheckpoints(property.id),
        ]);
        setAllStaff((sv ?? []) as StaffWithSchedules[]);
        setOverrides(ov ?? []);
        setCheckpoints(cp ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [property?.id]);

  // Escala de hoje para cada membro
  const todaySchedules = allStaff.map(s => {
    const todayDate = new Date(todayStr + "T00:00:00");
    const overridesForDay = overrides.filter(o => o.date === todayStr);
    const eff = resolveEffectiveDaySchedule(s, s.schedules ?? [], overridesForDay, todayDate, checkpoints);
    return { staff: s, eff };
  });

  const onDutyToday = todaySchedules.filter(ts => ts.eff.isWork);

  // KPIs
  const activeStaff = allStaff.filter(s => s.active !== false).length;
  const onDutyCount = onDutyToday.length;
  const birthdaysThisMonth = allStaff.filter(s => {
    if (!s.birthDate) return false;
    return new Date(s.birthDate + "T12:00:00").getMonth() === currentMonth;
  });
  const offThisWeek = overrides.filter(o => !o.startTime).length;

  // Escala da semana (contagem por dia)
  const weekCounts = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const dStr = toYMD(d);
    const count = allStaff.filter(s => {
      const d2 = new Date(dStr + "T00:00:00");
      const ovDay = overrides.filter(o => o.date === dStr);
      const eff = resolveEffectiveDaySchedule(s, s.schedules ?? [], ovDay, d2, checkpoints);
      return eff.isWork;
    }).length;
    return { dayLabel: DAY_SHORT[d.getDay()], date: dStr, count };
  });
  const maxCount = Math.max(...weekCounts.map(w => w.count), 1);

  // Distribuição por role
  const roleDist = allStaff.reduce((acc, s) => {
    acc[s.role] = (acc[s.role] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const roleEntries = Object.entries(roleDist).sort((a, b) => b[1] - a[1]);

  // Filtro de turno
  const filteredToday = shiftFilter === "todos"
    ? onDutyToday
    : onDutyToday.filter(ts => {
        if (!ts.eff.startTime) return false;
        const s = shiftLabel(ts.eff.startTime).toLowerCase();
        return s === shiftFilter;
      });

  // Aniversários do mês
  const nextWeek = addDays(today, 7);

  if (loading) {
    return (
      <>
        <style>{STYLE}</style>
        <div className="dir-shell" style={{ display: "flex", flexDirection: "column", height: "100dvh", background: T.bg, color: T.text, overflow: "hidden", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2.5px solid ${T.border2}`, borderTopColor: T.g1, animation: "dir-spin .8s linear infinite" }} />
          <span style={{ fontSize: 13, color: T.muted }}>Carregando equipe…</span>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLE}</style>
      <div className="dir-shell" style={{ display: "flex", flexDirection: "column", height: "100dvh", background: T.bg, color: T.text, overflow: "hidden" }}>
        <div className="dir-scroll" style={{ flex: 1 }}>
          <div style={{ padding: "20px 16px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => router.push("/director")} style={{
                width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border2}`,
                background: T.glass, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: T.muted, flexShrink: 0,
              }}>
                <ArrowLeft size={16} />
              </button>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Equipe</div>
                <div style={{
                  display: "inline-block", fontSize: 11, fontWeight: 600, color: T.g2,
                  background: "rgba(78,201,212,0.08)", border: `1px solid rgba(78,201,212,0.2)`,
                  borderRadius: 99, padding: "2px 8px", marginTop: 4,
                }}>
                  {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Equipe ativa", val: activeStaff, color: T.g1, Icon: Users },
                { label: "Hoje em turno", val: onDutyCount, color: T.g2, Icon: Clock },
                { label: "Aniversários no mês", val: birthdaysThisMonth.length, color: T.pink, Icon: Cake },
                { label: "Folgas esta semana", val: offThisWeek, color: T.amber, Icon: null },
              ].map(k => (
                <div key={k.label} style={{
                  background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 14, padding: "12px 14px",
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>{k.label}</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.val}</span>
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
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Distribuição por Setor</div>
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

            {/* Equipe hoje com filtro de turno */}
            <div style={{ background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16 }}>
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Equipe Hoje</div>

              {/* Filtros */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {(["todos", "manhã", "tarde", "noite"] as const).map(f => (
                  <button key={f} onClick={() => setShiftFilter(f)} style={{
                    padding: "5px 12px", borderRadius: 99, border: `1px solid ${shiftFilter === f ? T.g1 : T.border}`,
                    background: shiftFilter === f ? "rgba(155,109,255,0.15)" : T.glass,
                    color: shiftFilter === f ? T.g1 : T.muted,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    textTransform: "capitalize",
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
                    <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: rs.bg, border: `1px solid ${rs.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 800, color: rs.color,
                      }}>
                        {initials(s.fullName)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.fullName}</div>
                        <div style={{ fontSize: 11, color: T.muted }}>{ROLE_LABELS[s.role] ?? s.role}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        {eff.startTime && eff.endTime && (
                          <div style={{ fontSize: 11, color: T.muted2 }}>{fmtTime(eff.startTime)}–{fmtTime(eff.endTime)}</div>
                        )}
                        <div style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                          background: sc.bg, color: sc.color,
                        }}>{shift}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Aniversários do mês */}
            {birthdaysThisMonth.length > 0 && (
              <div style={{ background: T.glass2, border: `1px solid ${T.pinkBorder}`, borderRadius: 16, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <Cake size={14} color={T.pink} />
                  <div style={{ fontSize: 11, color: T.pink, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Aniversários do Mês</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {birthdaysThisMonth.map(s => {
                    const bDate = new Date(s.birthDate! + "T12:00:00");
                    const thisYearBday = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
                    const daysUntil = Math.ceil((thisYearBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const isSoon = daysUntil >= 0 && daysUntil <= 7;
                    return (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{s.fullName}</div>
                          <div style={{ fontSize: 11, color: T.muted }}>{ROLE_LABELS[s.role] ?? s.role}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                          <div style={{ fontSize: 12, color: T.muted }}>
                            {bDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                          </div>
                          {isSoon && (
                            <div style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: T.pinkBg, color: T.pink, border: `1px solid ${T.pinkBorder}` }}>
                              {daysUntil === 0 ? "Hoje!" : `em ${daysUntil}d`}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
