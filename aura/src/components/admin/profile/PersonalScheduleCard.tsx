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

export function PersonalScheduleCard({ staff }: Props) {
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
      StaffService.getStaffSchedules(staff.id).catch(() => [] as StaffSchedule[]),
      StaffService.getScheduleOverrides(staff.id, from, to).catch(() => [] as StaffScheduleOverride[]),
      StaffService.getStaffCheckpoints(staff.id).catch(() => [] as ScheduleCheckpoint[]),
    ]).then(([s, o, c]) => {
      setSchedules(s);
      setOverrides(o);
      setCheckpoints(c);
    }).finally(() => setLoading(false));
  }, [staff.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = toYMD(new Date());

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={16} className="text-cyan-400 flex-shrink-0" />
        <span className="text-[13px] font-extrabold text-foreground uppercase tracking-wider">
          Minha Semana
        </span>
      </div>

      {loading ? (
        <div className="flex gap-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="flex-1 h-[72px] rounded-xl bg-muted opacity-40 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {weekDates.map((date, i) => {
            const dateStr = toYMD(date);
            const isToday = dateStr === today;
            const dayOverrides = overrides.filter(o => o.date === dateStr);
            const result = resolveEffectiveDaySchedule(staff, schedules, dayOverrides, date, checkpoints);

            return (
              <div
                key={i}
                className="flex-1 min-w-[44px] rounded-xl flex flex-col items-center gap-1 py-2 px-1.5 text-center relative"
                style={{
                  border: isToday
                    ? "1.5px solid rgba(155,109,255,0.55)"
                    : "1px solid var(--border)",
                  background: isToday
                    ? "linear-gradient(135deg,rgba(155,109,255,0.12),rgba(78,201,212,0.12))"
                    : result.isWork
                      ? "rgba(78,201,212,0.05)"
                      : "var(--muted)",
                }}
              >
                {isToday && (
                  <div
                    className="absolute -top-px left-1/2 -translate-x-1/2 w-4 h-[3px] rounded-full"
                    style={{ background: "linear-gradient(135deg,#9b6dff,#4ec9d4)" }}
                  />
                )}

                <span
                  className="text-[10px] font-extrabold uppercase tracking-widest"
                  style={{ color: isToday ? "#9b6dff" : "var(--muted-foreground)" }}
                >
                  {DAYS_PT[date.getDay()]}
                </span>

                <span
                  className="text-sm font-black"
                  style={{ color: isToday ? "#9b6dff" : "var(--foreground)" }}
                >
                  {date.getDate()}
                </span>

                {result.hasOverride && (
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: result.isWork ? "#60a5fa" : "#f87171" }}
                  />
                )}

                {result.isWork ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <div
                      className="w-6 h-[3px] rounded-full"
                      style={{ background: "linear-gradient(135deg,#9b6dff,#4ec9d4)" }}
                    />
                    {result.startTime && (
                      <span className="text-[9px] font-bold text-cyan-400">
                        {result.startTime.slice(0, 5)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[9px] font-semibold text-muted-foreground">
                    folga
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-[3px] rounded-full"
              style={{ background: "linear-gradient(135deg,#9b6dff,#4ec9d4)" }}
            />
            <span className="text-[11px] text-muted-foreground">Trabalho</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[11px] text-muted-foreground">Override</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={11} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground capitalize">
              {staff.scheduleType ?? "custom"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
