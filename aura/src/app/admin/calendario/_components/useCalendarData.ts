"use client";

// Dados do calendário do mês: eventos, estadias, reservas de estrutura e aniversários
// (lógica de carregamento portada da página original; sem joins — RLS bloqueia no browser).
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { EventosApi } from "@/lib/eventos-api";
import type { Event } from "@/types/aura";
import { supabase } from "@/lib/supabase";
import { stayDisplayName } from "@/lib/stay-display";
import { EMPTY_SUMMARY, getMonthBounds, summaryTotal, toLocalDateStr, type BirthdayRecord, type DaySummary, type StayEntry, type StructureBookingEntry } from "./calendar-utils";


export function useCalendarData(propertyId: string | undefined, currentMonth: Date) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [stays, setStays] = useState<StayEntry[]>([]);
  const [structureBookings, setStructureBookings] = useState<StructureBookingEntry[]>([]);
  const [birthdayRecords, setBirthdayRecords] = useState<BirthdayRecord[]>([]);
  const [totalCabins, setTotalCabins] = useState(0);

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const { start, end, year, month } = getMonthBounds(currentMonth);
      const [eventsData, staysResult, structuresResult] = await Promise.all([
        EventosApi.month(propertyId, year, month),
        supabase.from("stays").select("id, checkIn, checkOut, guestId, cabinId, internalUse, internalLabel").eq("propertyId", propertyId).lte("checkIn", end).gte("checkOut", start).not("status", "in", '("cancelled","archived")'),
        supabase.from("structure_bookings").select("id, date, startTime, endTime, status, structureId, guestId, guestName").eq("propertyId", propertyId).gte("date", start).lte("date", end).not("status", "in", '("cancelled","rejected","expired")'),
      ]);
      setEvents(eventsData);
      const rawStays: any[] = staysResult.data || [];
      const rawSbs: any[] = structuresResult.data || [];

      const stayGuestIds = rawStays.map(s => s.guestId).filter(Boolean) as string[];
      const sbGuestIds = rawSbs.map(b => b.guestId).filter(Boolean) as string[];
      const allGuestIds = Array.from(new Set(stayGuestIds.concat(sbGuestIds)));
      const allStructureIds = Array.from(new Set(rawSbs.map((b: any) => b.structureId).filter(Boolean))) as string[];

      const [guestNamesMap, guestBdayResult, cabinsResult, structuresNameResult, staffBdayResult] = await Promise.all([
        allGuestIds.length > 0
          ? fetch("/api/admin/guests/names", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: allGuestIds }) }).then(r => r.json() as Promise<Record<string, string>>)
          : Promise.resolve({} as Record<string, string>),
        allGuestIds.length > 0 ? supabase.from("guests").select("id, fullName, birthDate").in("id", allGuestIds) : Promise.resolve({ data: [] }),
        supabase.from("cabins").select("id, name, ignoreInOccupancy").eq("propertyId", propertyId),
        allStructureIds.length > 0 ? supabase.from("structures").select("id, name").in("id", allStructureIds) : Promise.resolve({ data: [] }),
        supabase.from("staff").select("id, fullName, birthDate").eq("propertyId", propertyId).eq("active", true).not("birthDate", "is", null),
      ]);

      const cabinRows = (cabinsResult.data || []) as any[];
      setTotalCabins(cabinRows.filter(c => !c.ignoreInOccupancy).length);
      const ignoredCabinSet = new Set(cabinRows.filter(c => c.ignoreInOccupancy).map(c => c.id as string));
      const cabinNameMap: Record<string, string> = {};
      for (const c of cabinRows) cabinNameMap[c.id] = c.name;
      const structureNameMap: Record<string, string> = {};
      for (const s of (structuresNameResult.data || []) as any[]) structureNameMap[s.id] = s.name;

      setStays(rawStays.map(s => ({
        id: s.id, checkIn: toLocalDateStr(s.checkIn), checkOut: toLocalDateStr(s.checkOut),
        guestName: stayDisplayName(s, guestNamesMap[s.guestId]), cabinName: cabinNameMap[s.cabinId] || undefined,
        internalUse: !!s.internalUse, countsForOccupancy: !s.cabinId || !ignoredCabinSet.has(s.cabinId),
      })));
      setStructureBookings(rawSbs.map(b => ({
        id: b.id, date: b.date, startTime: b.startTime, endTime: b.endTime, status: b.status,
        structureName: structureNameMap[b.structureId] || "Estrutura", guestName: guestNamesMap[b.guestId] ?? b.guestName ?? undefined,
      })));

      // Aniversários do mês (hóspedes + equipe)
      const currentYear = currentMonth.getFullYear();
      const currentMonthNum = currentMonth.getMonth() + 1;
      const list: BirthdayRecord[] = [];
      const stayGuestMap: Record<string, { checkIn: string; checkOut: string }[]> = {};
      for (const s of rawStays) {
        if (!s.guestId) continue;
        (stayGuestMap[s.guestId] ||= []).push({ checkIn: toLocalDateStr(s.checkIn), checkOut: toLocalDateStr(s.checkOut) });
      }
      const addBirthdays = (people: any[], isStaff = false, nameOverride?: (p: any) => string) => {
        for (const p of people) {
          if (!p.birthDate) continue;
          const parts = p.birthDate.split("-");
          if (parts.length < 3) continue;
          const bMonth = parseInt(parts[1], 10), bDay = parseInt(parts[2], 10), bYear = parseInt(parts[0], 10);
          if (bMonth !== currentMonthNum) continue;
          const dateStr = `${currentYear}-${String(bMonth).padStart(2, "0")}-${String(bDay).padStart(2, "0")}`;
          const age = currentYear - bYear;
          const isInHouse = !isStaff && (stayGuestMap[p.id] || []).some(s => s.checkIn <= dateStr && dateStr <= s.checkOut);
          list.push({ dateStr, guestName: nameOverride ? nameOverride(p) : (guestNamesMap[p.id] || p.fullName || "Hóspede"), age: age > 0 && age < 150 ? age : undefined, isInHouse, isStaff });
        }
      };
      addBirthdays((guestBdayResult.data || []) as any[]);
      addBirthdays((staffBdayResult.data || []) as any[], true, p => p.fullName || "Funcionário");
      setBirthdayRecords(list);
    } catch (err) {
      console.error("Erro ao carregar calendário:", err);
      setError("Não foi possível carregar o calendário.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, currentMonth]);

  useEffect(() => { void loadData(); }, [loadData]);

  const calendarGrid = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    const cells: (number | null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    return cells;
  }, [currentMonth]);

  const summaryByDate = useMemo((): Record<string, DaySummary> => {
    const map: Record<string, DaySummary> = {};
    const { start: boundsStart, end: boundsEnd } = getMonthBounds(currentMonth);
    const ensure = (d: string) => { if (!map[d]) map[d] = { checkIns: [], checkOuts: [], inHouse: [], events: [], structureBookings: [], birthdays: [] }; };
    stays.forEach(s => {
      const cur = new Date(s.checkIn + "T00:00:00");
      const endD = new Date(s.checkOut + "T00:00:00");
      while (cur <= endD) {
        const d = cur.toISOString().split("T")[0];
        if (d >= boundsStart && d <= boundsEnd) {
          ensure(d);
          if (d === s.checkIn) map[d].checkIns.push(s);
          else if (d === s.checkOut) map[d].checkOuts.push(s);
          else map[d].inHouse.push(s);
        }
        cur.setDate(cur.getDate() + 1);
      }
    });
    events.forEach(e => {
      const end = e.endDate || e.startDate;
      const cur = new Date(e.startDate + "T00:00:00");
      const endD = new Date(end + "T00:00:00");
      while (cur <= endD) {
        const d = cur.toISOString().split("T")[0];
        if (d >= boundsStart && d <= boundsEnd) { ensure(d); map[d].events.push(e); }
        cur.setDate(cur.getDate() + 1);
      }
    });
    structureBookings.forEach(b => { ensure(b.date); map[b.date].structureBookings.push(b); });
    birthdayRecords.forEach(b => { ensure(b.dateStr); map[b.dateStr].birthdays.push({ guestName: b.guestName, age: b.age, isInHouse: b.isInHouse, isStaff: b.isStaff }); });
    return map;
  }, [stays, events, structureBookings, birthdayRecords, currentMonth]);

  const agendaDays = useMemo(() => Object.keys(summaryByDate).filter(d => summaryTotal(summaryByDate[d]) > 0).sort().map(d => ({ dateStr: d, summary: summaryByDate[d] })), [summaryByDate]);
  const birthdayDaysCount = useMemo(() => new Set(birthdayRecords.map(b => b.dateStr)).size, [birthdayRecords]);
  const publishedEvents = events.filter(e => e.status === "published").length;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return { loading, error, reload: loadData, events, stays, structureBookings, totalCabins, calendarGrid, summaryByDate, agendaDays, birthdayDaysCount, publishedEvents, todayStr, summaryFor: (d: string | null) => (d ? summaryByDate[d] || EMPTY_SUMMARY : null) };
}
