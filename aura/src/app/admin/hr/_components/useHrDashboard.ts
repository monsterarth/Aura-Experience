"use client";

// Dados do painel de gestão.
//
// A escala vem MATERIALIZADA do servidor (`/api/admin/rh?section=dias`), não
// recalculada aqui. Além de tirar o cálculo do navegador, é o que faz o painel
// enxergar férias, atestado e ajuste manual — o cálculo antigo só conhecia o
// padrão e mostrava como "trabalhando" quem estava de férias.
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffService } from "@/services/staff-service";
import type { StaffShift } from "@/types/hr";
import {
  addDays, DAY_LABELS, getMonday, getTurno, initialsOf, roleLabel, roleTone, toYMD,
  type BirthdayItem, type DeptItem, type PersonItem, type ShiftEntry, type StaffWithSchedules, type WeekBar,
} from "./hr-utils";

export function useHrDashboard(propertyId: string | null | undefined) {
  const [staff, setStaff] = useState<StaffWithSchedules[]>([]);
  const [dias, setDias] = useState<Map<string, StaffShift>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const weekStart = getMonday(new Date());
        const [scheduleView, shifts] = await Promise.all([
          StaffService.getPropertyScheduleView(propertyId),
          fetch(`/api/admin/rh?section=dias&propertyId=${propertyId}&from=${toYMD(weekStart)}&to=${toYMD(addDays(weekStart, 6))}`)
            .then(r => (r.ok ? r.json() : []))
            .catch(() => []),
        ]);
        if (cancelled) return;
        setStaff(scheduleView);
        setDias(new Map((Array.isArray(shifts) ? (shifts as StaffShift[]) : []).map(d => [`${d.staffId}|${d.date}`, d])));
      } catch {
        if (!cancelled) setError("Não foi possível carregar o painel.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [propertyId, tick]);

  const data = useMemo(() => {
    const today = new Date();
    const todayYMD = toYMD(today);
    const weekStart = getMonday(today);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const activeStaff = staff.filter(s => s.active && s.role !== "director");
    const doDia = (staffId: string, ymd: string) => {
      const d = dias.get(`${staffId}|${ymd}`);
      return {
        isWork: Boolean(d?.isWork),
        startTime: d?.startTime ?? undefined,
        endTime: d?.endTime ?? undefined,
        hasOverride: Boolean(d && d.origin !== "pattern"),
      };
    };

    const resolvedToday = activeStaff.map(s => ({ s, r: doDia(s.id, todayYMD) }));
    const working = resolvedToday.filter(x => x.r.isWork);
    const off = resolvedToday.filter(x => !x.r.isWork);

    const todayShifts: ShiftEntry[] = working
      .filter(x => !!x.r.startTime)
      .map(({ s, r }) => ({
        id: s.id, name: s.fullName, initials: initialsOf(s.fullName), role: roleLabel(s.role), tone: roleTone(s.role),
        profilePictureUrl: s.profilePictureUrl,
        start: r.startTime!, end: r.endTime ?? "—", turno: getTurno(r.startTime!, r.endTime),
      }))
      .sort((a, b) => a.start.localeCompare(b.start));

    const folgaList: PersonItem[] = off.map(({ s }) => ({
      id: s.id, name: s.fullName, initials: initialsOf(s.fullName), role: roleLabel(s.role), tone: roleTone(s.role), profilePictureUrl: s.profilePictureUrl,
    }));

    const currentMonth = today.getMonth() + 1;
    const birthdayList: BirthdayItem[] = activeStaff
      .filter(s => s.birthDate && parseInt(s.birthDate.split("-")[1], 10) === currentMonth)
      .map(s => {
        const [, mm, dd] = s.birthDate!.split("-").map(Number);
        const thisYear = new Date(today.getFullYear(), mm - 1, dd);
        const diff = Math.ceil((thisYear.getTime() - today.getTime()) / 86400000);
        return {
          id: s.id, name: s.fullName, initials: initialsOf(s.fullName), role: roleLabel(s.role), tone: roleTone(s.role), profilePictureUrl: s.profilePictureUrl,
          dateLabel: thisYear.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
          daysLeft: diff,
        };
      })
      // próximos primeiro; os que já passaram no mês vão para o fim
      .sort((a, b) => (a.daysLeft < 0 ? 1000 + a.daysLeft : a.daysLeft) - (b.daysLeft < 0 ? 1000 + b.daysLeft : b.daysLeft));

    const deptMap = activeStaff.reduce<Record<string, DeptItem>>((acc, s) => {
      const label = roleLabel(s.role);
      if (!acc[label]) acc[label] = { label, count: 0, tone: roleTone(s.role) };
      acc[label].count++;
      return acc;
    }, {});
    const deptDist = Object.values(deptMap).sort((a, b) => b.count - a.count);

    const weekBarData: WeekBar[] = weekDays.map((d, i) => {
      const ymd = toYMD(d);
      let shifts = 0, folgas = 0;
      for (const s of activeStaff) {
        const r = doDia(s.id, ymd);
        if (r.hasOverride && !r.isWork) folgas++;
        else if (r.isWork) shifts++;
      }
      return { day: DAY_LABELS[(i + 1) % 7], shifts, folgas, isToday: ymd === todayYMD };
    });

    const weekNumber = Math.ceil((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 604800000);

    return {
      today,
      weekStart,
      todayLabel: today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }),
      weekLabel: `Sem ${weekNumber}`,
      weekRangeLabel: `${toYMD(weekStart).slice(5).replace("-", "/")} – ${toYMD(addDays(weekStart, 6)).slice(5).replace("-", "/")}`,
      activeCount: activeStaff.length,
      todayWorkingCount: working.length,
      todayShifts,
      folgaList,
      folgaCount: off.length,
      birthdayList,
      deptDist,
      totalStaff: activeStaff.length || 1,
      weekBarData,
      maxShifts: Math.max(...weekBarData.map(d => d.shifts), 1),
      totalWeekShifts: weekBarData.reduce((a, d) => a + d.shifts, 0),
    };
  }, [staff, dias]);

  return { loading, error, reload, data };
}
