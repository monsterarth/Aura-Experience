"use client";

import { useState, useEffect } from "react";
import { Staff, StaffSchedule, StaffScheduleOverride, ScheduleCheckpoint } from "@/types/aura";
import { resolveEffectiveDaySchedule } from "@/lib/schedule-calculator";
import { StaffService } from "@/services/staff-service";
import { CalendarDays, Clock } from "lucide-react";

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getWeekDates(): Date[] {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  staff: Staff;
  propertyId: string;
}

export function PersonalScheduleCard({ staff, propertyId }: Props) {
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [overrides, setOverrides] = useState<StaffScheduleOverride[]>([]);
  const [checkpoints, setCheckpoints] = useState<ScheduleCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);

  const weekDates = getWeekDates();

  useEffect(() => {
    if (!staff.id) return;
    const from = toYMD(weekDates[0]);
    const to = toYMD(weekDates[6]);

    Promise.all([
      StaffService.getStaffSchedules(staff.id),
      StaffService.getScheduleOverrides(staff.id, from, to),
      StaffService.getStaffCheckpoints(staff.id),
    ]).then(([s, o, c]) => {
      setSchedules(s);
      setOverrides(o);
      setCheckpoints(c);
      setLoading(false);
    });
  }, [staff.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = toYMD(new Date());

  const T = {
    grad: "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
    gradSoft: "linear-gradient(135deg,rgba(155,109,255,0.15) 0%,rgba(78,201,212,0.15) 100%)",
    g2: "#4ec9d4",
  };

  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <CalendarDays size={16} style={{ color: T.g2, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)", letterSpacing: ".04em", textTransform: "uppercase" }}>
          Minha Semana
        </span>
      </div>

      {loading ? (
        <div style={{ display: "flex", gap: 6 }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} style={{
              flex: 1, height: 72, borderRadius: 10,
              background: "var(--muted)", opacity: 0.4, animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {weekDates.map((date, i) => {
            const dateStr = toYMD(date);
            const isToday = dateStr === today;
            const dayOverrides = overrides.filter(o => o.date === dateStr);
            const result = resolveEffectiveDaySchedule(staff, schedules, dayOverrides, date, checkpoints);

            return (
              <div key={i} style={{
                flex: 1, minWidth: 44,
                borderRadius: 10, padding: "8px 6px",
                textAlign: "center",
                border: isToday ? "1.5px solid rgba(155,109,255,0.6)" : "1px solid var(--border)",
                background: isToday
                  ? T.gradSoft
                  : result.isWork
                    ? "rgba(78,201,212,0.05)"
                    : "var(--muted)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                position: "relative",
              }}>
                {isToday && (
                  <div style={{
                    position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)",
                    width: 16, height: 3, borderRadius: 999, background: T.grad,
                  }} />
                )}
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
                  color: isToday ? "#9b6dff" : "var(--muted-foreground)",
                }}>
                  {DAYS_PT[date.getDay()]}
                </span>
                <span style={{
                  fontSize: 14, fontWeight: 900,
                  color: isToday ? "#9b6dff" : "var(--foreground)",
                }}>
                  {date.getDate()}
                </span>
                {result.hasOverride ? (
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: result.isWork ? "#60a5fa" : "#f87171",
                    flexShrink: 0,
                  }} />
                ) : null}
                {result.isWork ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "center" }}>
                    <div style={{
                      width: 24, height: 3, borderRadius: 999,
                      background: T.grad,
                    }} />
                    {result.startTime && (
                      <span style={{ fontSize: 9, color: T.g2, fontWeight: 700 }}>
                        {result.startTime.slice(0, 5)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: 9, color: "var(--muted-foreground)", fontWeight: 600 }}>
                    folga
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 3, borderRadius: 999, background: T.grad }} />
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Trabalho</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa" }} />
            <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Override</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={11} style={{ color: "var(--muted-foreground)" }} />
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", textTransform: "capitalize" }}>
              {staff.scheduleType ?? "custom"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
