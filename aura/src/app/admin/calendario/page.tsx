"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { EventService } from "@/services/event-service";
import { Event } from "@/types/aura";
import { supabase } from "@/lib/supabase";
import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, ChevronLeft, ChevronRight, X, Ticket, CalendarDays, LogIn, LogOut as LogOutIcon, Gift, BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";

// ==========================================
// TYPES
// ==========================================

interface StayEntry {
  id: string;
  checkIn: string;
  checkOut: string;
  guestName?: string;
  cabinName?: string;
}

interface StructureBookingEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  structureName?: string;
  guestName?: string;
  status: string;
}

interface BirthdayEntry {
  guestName: string;
  age?: number;
  isInHouse: boolean;
  isStaff?: boolean;
}

interface BirthdayRecord {
  dateStr: string;
  guestName: string;
  age?: number;
  isInHouse: boolean;
  isStaff?: boolean;
}

interface DaySummary {
  checkIns: StayEntry[];
  checkOuts: StayEntry[];
  inHouse: StayEntry[];
  events: Event[];
  structureBookings: StructureBookingEntry[];
  birthdays: BirthdayEntry[];
}

const WEEK_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// ==========================================
// HELPERS
// ==========================================

function getMonthBounds(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  return { start, end, year, month };
}

function toLocalDateStr(isoStr: string): string {
  if (!isoStr) return "";
  return isoStr.split("T")[0];
}

function formatDatePT(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${day} ${months[parseInt(month) - 1]} ${year}`;
}

// ==========================================
// DOT STACK
// ==========================================

function dotCount(n: number) {
  if (n <= 4) return n;
  if (n <= 6) return 4;
  return 4 + Math.ceil((n - 6) / 3);
}

interface DotGroup { count: number; color: string; textColor: string; }

function DotRow({ groups }: { groups: DotGroup[] }) {
  // Build a flat list of dots with their absolute x position
  const allDots: { color: string; x: number; groupIdx: number }[] = [];
  let x = 0;
  groups.forEach((g, gi) => {
    const dots = dotCount(g.count);
    for (let i = 0; i < dots; i++) {
      allDots.push({ color: g.color, x, groupIdx: gi });
      x += 6;
    }
  });
  const totalW = x;

  // For hover count labels, track start x and width per group
  const groupMeta: { startX: number; width: number; group: DotGroup }[] = [];
  let cx = 0;
  groups.forEach((g) => {
    const dots = dotCount(g.count);
    const w = dots * 6;
    groupMeta.push({ startX: cx, width: w, group: g });
    cx += w;
  });

  return (
    <span className="relative inline-flex shrink-0" style={{ width: totalW, height: 6 }}>
      {allDots.map((d, i) => (
        <span
          key={i}
          className={cn("absolute w-1.5 h-1.5 rounded-full", d.color)}
          style={{ left: d.x, top: 0 }}
        />
      ))}
      {groupMeta.map(({ startX, width, group }, gi) =>
        group.count > 4 ? (
          <span
            key={`label-${gi}`}
            className={cn(
              "absolute flex items-center justify-center text-[6px] font-black leading-none",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              group.textColor,
              "[text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000]",
            )}
            style={{ left: startX, width, top: 0, height: 6 }}
          >
            {group.count}
          </span>
        ) : null
      )}
    </span>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function CalendarioPage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();

  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());

  const [events, setEvents] = useState<Event[]>([]);
  const [stays, setStays] = useState<StayEntry[]>([]);
  const [structureBookings, setStructureBookings] = useState<StructureBookingEntry[]>([]);
  const [birthdayRecords, setBirthdayRecords] = useState<BirthdayRecord[]>([]);

  const toggleLayer = (key: string) =>
    setHiddenLayers((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [totalCabins, setTotalCabins] = useState(0);

  const loadData = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      const { start, end, year, month } = getMonthBounds(currentMonth);

      // Step 1: Load raw data in parallel (no joins — RLS blocks them from browser)
      const [eventsData, staysResult, structuresResult] = await Promise.all([
        EventService.getEventsForCalendar(property.id, year, month),

        supabase
          .from("stays")
          .select("id, checkIn, checkOut, guestId, cabinId")
          .eq("propertyId", property.id)
          .lte("checkIn", end)
          .gte("checkOut", start)
          .not("status", "in", '("cancelled","archived")'),

        supabase
          .from("structure_bookings")
          .select("id, date, startTime, endTime, status, structureId, guestId, guestName")
          .eq("propertyId", property.id)
          .gte("date", start)
          .lte("date", end)
          .not("status", "in", '("cancelled","rejected")'),
      ]);

      setEvents(eventsData);

      const rawStays: any[] = staysResult.data || [];
      const rawSbs: any[] = structuresResult.data || [];

      // Step 2: Collect IDs for bulk resolution
      const stayGuestIds = rawStays.map((s) => s.guestId).filter(Boolean) as string[];
      const sbGuestIds = rawSbs.map((b) => b.guestId).filter(Boolean) as string[];
      const allGuestIds = Array.from(new Set(stayGuestIds.concat(sbGuestIds)));
      const allCabinIds = Array.from(new Set(rawStays.map((s: any) => s.cabinId).filter(Boolean))) as string[];
      const allStructureIds = Array.from(new Set(rawSbs.map((b: any) => b.structureId).filter(Boolean))) as string[];

      // Step 3: Resolve names + birthday data in parallel
      const [guestNamesMap, guestBdayResult, cabinsResult, structuresNameResult, staffBdayResult] = await Promise.all([
        allGuestIds.length > 0
          ? fetch("/api/admin/guests/names", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: allGuestIds }),
            }).then((r) => r.json() as Promise<Record<string, string>>)
          : Promise.resolve({} as Record<string, string>),

        allGuestIds.length > 0
          ? supabase.from("guests").select("id, fullName, birthDate").in("id", allGuestIds)
          : Promise.resolve({ data: [] }),

        supabase.from("cabins").select("id, name").eq("propertyId", property.id),

        allStructureIds.length > 0
          ? supabase.from("structures").select("id, name").in("id", allStructureIds)
          : Promise.resolve({ data: [] }),

        supabase
          .from("staff")
          .select("id, fullName, birthDate")
          .eq("propertyId", property.id)
          .eq("active", true)
          .not("birthDate", "is", null),
      ]);

      // Build lookup maps
      setTotalCabins(cabinsResult.data ? cabinsResult.data.length : 0);

      const cabinNameMap: Record<string, string> = {};
      for (const c of (cabinsResult.data || []) as any[]) cabinNameMap[c.id] = c.name;

      const structureNameMap: Record<string, string> = {};
      for (const s of (structuresNameResult.data || []) as any[]) structureNameMap[s.id] = s.name;

      // Step 4: Map stays
      const staysMapped: StayEntry[] = rawStays.map((s) => ({
        id: s.id,
        checkIn: toLocalDateStr(s.checkIn),
        checkOut: toLocalDateStr(s.checkOut),
        guestName: guestNamesMap[s.guestId] || "Hóspede",
        cabinName: cabinNameMap[s.cabinId] || undefined,
      }));
      setStays(staysMapped);

      // Step 5: Map structure bookings
      const sbMapped: StructureBookingEntry[] = rawSbs.map((b) => ({
        id: b.id,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        structureName: structureNameMap[b.structureId] || "Estrutura",
        guestName: guestNamesMap[b.guestId] ?? b.guestName ?? undefined,
      }));
      setStructureBookings(sbMapped);

      // Step 6: Compute birthday records for current month (guests + staff)
      const currentYear = currentMonth.getFullYear();
      const currentMonthNum = currentMonth.getMonth() + 1;
      const birthdayList: BirthdayRecord[] = [];

      // Build a map guestId → [{checkIn, checkOut}] to detect in-house status
      const stayGuestMap: Record<string, { checkIn: string; checkOut: string }[]> = {};
      for (const s of rawStays) {
        if (!s.guestId) continue;
        if (!stayGuestMap[s.guestId]) stayGuestMap[s.guestId] = [];
        stayGuestMap[s.guestId].push({ checkIn: toLocalDateStr(s.checkIn), checkOut: toLocalDateStr(s.checkOut) });
      }

      const addBirthdays = (people: any[], isStaff = false, nameOverride?: (p: any) => string) => {
        for (const p of people) {
          if (!p.birthDate) continue;
          const parts = p.birthDate.split("-");
          if (parts.length < 3) continue;
          const bMonth = parseInt(parts[1], 10);
          const bDay = parseInt(parts[2], 10);
          const bYear = parseInt(parts[0], 10);
          if (bMonth !== currentMonthNum) continue;
          const dateStr = `${currentYear}-${String(bMonth).padStart(2, "0")}-${String(bDay).padStart(2, "0")}`;
          const age = currentYear - bYear;
          const isInHouse = !isStaff && (stayGuestMap[p.id] || []).some(
            (s) => s.checkIn <= dateStr && dateStr <= s.checkOut
          );
          birthdayList.push({
            dateStr,
            guestName: nameOverride ? nameOverride(p) : (guestNamesMap[p.id] || p.fullName || "Hóspede"),
            age: age > 0 && age < 150 ? age : undefined,
            isInHouse,
            isStaff,
          });
        }
      };

      addBirthdays((guestBdayResult.data || []) as any[]);
      addBirthdays((staffBdayResult.data || []) as any[], true, (p) => p.fullName || "Funcionário");

      setBirthdayRecords(birthdayList);

    } catch (err) {
      console.error("Erro ao carregar calendário:", err);
    } finally {
      setLoading(false);
    }
  }, [property?.id, currentMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ==========================================
  // CALENDAR GRID
  // ==========================================

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

    const ensure = (d: string) => {
      if (!map[d]) map[d] = { checkIns: [], checkOuts: [], inHouse: [], events: [], structureBookings: [], birthdays: [] };
    };

    stays.forEach((s) => {
      let cur = new Date(s.checkIn + "T00:00:00");
      const endD = new Date(s.checkOut + "T00:00:00");
      while (cur <= endD) {
        const d = cur.toISOString().split("T")[0];
        if (d >= boundsStart && d <= boundsEnd) {
          ensure(d);
          if (d === s.checkIn) {
            map[d].checkIns.push(s);
          } else if (d === s.checkOut) {
            map[d].checkOuts.push(s);
          } else {
            map[d].inHouse.push(s);
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    });

    // Spread multi-day events across all days in range
    events.forEach((e) => {
      const end = e.endDate || e.startDate;
      let cur = new Date(e.startDate + "T00:00:00");
      const endD = new Date(end + "T00:00:00");
      while (cur <= endD) {
        const d = cur.toISOString().split("T")[0];
        if (d >= boundsStart && d <= boundsEnd) {
          ensure(d);
          map[d].events.push(e);
        }
        cur.setDate(cur.getDate() + 1);
      }
    });

    structureBookings.forEach((b) => {
      ensure(b.date);
      map[b.date].structureBookings.push(b);
    });

    birthdayRecords.forEach((b) => {
      ensure(b.dateStr);
      map[b.dateStr].birthdays.push({ guestName: b.guestName, age: b.age, isInHouse: b.isInHouse, isStaff: b.isStaff });
    });

    return map;
  }, [stays, events, structureBookings, birthdayRecords, currentMonth]);

  const selectedDaySummary = useMemo((): DaySummary | null => {
    if (!selectedDay) return null;
    return summaryByDate[selectedDay] || { checkIns: [], checkOuts: [], inHouse: [], events: [], structureBookings: [], birthdays: [] };
  }, [selectedDay, summaryByDate]);

  const totalSelectedItems = selectedDaySummary
    ? selectedDaySummary.checkIns.length +
      selectedDaySummary.checkOuts.length +
      selectedDaySummary.inHouse.length +
      selectedDaySummary.events.length +
      selectedDaySummary.structureBookings.length +
      selectedDaySummary.birthdays.length
    : 0;

  const birthdayDaysCount = useMemo(
    () => new Set(birthdayRecords.map((b) => b.dateStr)).size,
    [birthdayRecords]
  );

  if (!property) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>Selecione uma propriedade para continuar.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Calendário</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão unificada de eventos, hospedagens e estruturas</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setCurrentMonth(startOfMonth(new Date())); setSelectedDay(null); }} className="px-3 py-2 text-xs font-bold border border-white/10 rounded-xl hover:bg-secondary transition-colors">
            Hoje
          </button>
        </div>
      </div>

      {/* Legend — click to toggle layers */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {([
          { key: "checkin",   color: "bg-emerald-400", label: "Check-in" },
          { key: "checkout",  color: "bg-orange-400",  label: "Check-out" },
          { key: "inhouse",   color: "bg-blue-400",    label: "Hospedados" },
          { key: "evlocal",   color: "bg-primary",     label: "Evento local" },
          { key: "evext",     color: "bg-purple-400",  label: "Evento externo" },
          { key: "structure", color: "bg-slate-400",   label: "Estrutura" },
          { key: "bdInhouse", color: "bg-amber-400",   label: "Aniversário (in-house)" },
          { key: "bdOut",     color: "bg-amber-400/30",label: "Aniversário (fora)" },
          { key: "bdStaff",   color: "bg-indigo-400",  label: "Aniversário (equipe)" },
        ] as const).map(({ key, color, label }) => {
          const hidden = hiddenLayers.has(key);
          return (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all select-none",
                hidden
                  ? "border-white/5 text-muted-foreground/30 opacity-50"
                  : "border-white/10 text-muted-foreground hover:border-white/20",
              )}
            >
              <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", color, hidden && "opacity-30")} />
              {label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-primary w-8 h-8" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Calendar */}
          <div className="lg:col-span-2">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { setCurrentMonth(m => subMonths(m, 1)); setSelectedDay(null); }} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                <ChevronLeft size={20} />
              </button>
              <h2 className="font-black uppercase text-lg tracking-tight">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </h2>
              <button onClick={() => { setCurrentMonth(m => addMonths(m, 1)); setSelectedDay(null); }} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
              {/* Week headers */}
              <div className="grid grid-cols-7 border-b border-white/5">
                {WEEK_DAYS.map((d) => (
                  <div key={d} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {calendarGrid.map((day, idx) => {
                  if (!day) return <div key={`e-${idx}`} className="min-h-[80px] border-b border-r border-white/5 bg-secondary/10 opacity-30" />;

                  const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const summary = summaryByDate[dateStr];
                  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
                  const isSelected = selectedDay === dateStr;
                  const occupancy = summary ? summary.checkIns.length + summary.inHouse.length : 0;
                  const isLotado = totalCabins > 0 && occupancy >= totalCabins;
                  const isQuaseCheia = totalCabins > 0 && !isLotado && occupancy / totalCabins >= 0.8;

                  const hasItems = summary && (
                    summary.checkIns.length +
                    summary.checkOuts.length +
                    summary.inHouse.length +
                    summary.events.length +
                    summary.structureBookings.length +
                    summary.birthdays.length
                  ) > 0;

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                      className={cn(
                        "group min-h-[80px] border-b border-r border-white/5 p-1.5 flex flex-col items-center text-left transition-all relative",
                        isSelected ? "bg-primary/20 ring-1 ring-inset ring-primary/40" : hasItems ? "hover:bg-secondary/50" : "hover:bg-secondary/20",
                      )}
                    >
                      <span className={cn(
                        "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 shrink-0 self-start",
                        isToday ? "bg-primary text-black" : "text-foreground/70",
                      )}>{day}</span>

                      {summary && (
                        <div className="flex flex-col gap-1 w-full flex-1">
                          {isLotado && (
                            <span className="text-[8px] font-black uppercase bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded-md w-full text-center tracking-widest shrink-0">Lotado</span>
                          )}
                          {isQuaseCheia && (
                            <span className="text-[8px] font-black uppercase bg-blue-500/10 text-blue-400/80 px-1 py-0.5 rounded-md w-full text-center tracking-widest shrink-0">{occupancy} Estadias</span>
                          )}
                          {summary.checkIns.length >= 5 && !isLotado && (
                            <span className="text-[8px] font-black uppercase bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded-md w-full text-center shrink-0">{summary.checkIns.length} Entradas</span>
                          )}
                          {summary.checkOuts.length >= 5 && (
                            <span className="text-[8px] font-black uppercase bg-orange-500/20 text-orange-400 px-1 py-0.5 rounded-md w-full text-center shrink-0">{summary.checkOuts.length} Saídas</span>
                          )}

                          {/* Dot row — all categories in one continuous strip */}
                          {(() => {
                            const groups: DotGroup[] = [];
                            const add = (count: number, color: string, textColor: string) => { if (count > 0) groups.push({ count, color, textColor }); };
                            if (!hiddenLayers.has("checkin") && !isLotado) add(summary.checkIns.length < 5 ? summary.checkIns.length : 0, "bg-emerald-400", "text-emerald-400");
                            if (!hiddenLayers.has("checkout")) add(summary.checkOuts.length < 5 ? summary.checkOuts.length : 0, "bg-orange-400", "text-orange-400");
                            if (!hiddenLayers.has("inhouse") && !isLotado) add(summary.inHouse.length, "bg-blue-400", "text-blue-400");
                            if (!hiddenLayers.has("evlocal")) add(summary.events.filter(e => e.type === "local").length, "bg-primary", "text-primary");
                            if (!hiddenLayers.has("evext")) add(summary.events.filter(e => e.type !== "local").length, "bg-purple-400", "text-purple-400");
                            if (!hiddenLayers.has("structure")) add(summary.structureBookings.length, "bg-slate-400", "text-slate-400");
                            if (!hiddenLayers.has("bdInhouse")) add(summary.birthdays.filter(b => b.isInHouse).length, "bg-amber-400", "text-amber-400");
                            if (!hiddenLayers.has("bdOut")) add(summary.birthdays.filter(b => !b.isInHouse && !b.isStaff).length, "bg-amber-400/40", "text-amber-400/60");
                            if (!hiddenLayers.has("bdStaff")) add(summary.birthdays.filter(b => b.isStaff).length, "bg-indigo-400", "text-indigo-400");
                            return groups.length > 0 ? <DotRow groups={groups} /> : null;
                          })()}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Day detail panel */}
          <div className="lg:col-span-1">
            {selectedDay && selectedDaySummary ? (
              <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                  <h3 className="font-black uppercase text-sm tracking-tight">{formatDatePT(selectedDay)}</h3>
                  <button onClick={() => setSelectedDay(null)} className="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                    <X size={14} />
                  </button>
                </div>

                <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                  {totalSelectedItems === 0 && (
                    <p className="text-sm text-muted-foreground py-8 text-center">Nenhum item neste dia.</p>
                  )}

                  {/* Check-ins */}
                  {selectedDaySummary.checkIns.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <LogIn size={12} className="text-emerald-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Check-ins ({selectedDaySummary.checkIns.length})</span>
                      </div>
                      <div className="space-y-2">
                        {selectedDaySummary.checkIns.map((s) => (
                          <div key={s.id} className="p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                            <p className="text-sm font-bold">{s.guestName || "Hóspede"}</p>
                            {s.cabinName && <p className="text-[10px] text-muted-foreground">{s.cabinName}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Check-outs */}
                  {selectedDaySummary.checkOuts.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <LogOutIcon size={12} className="text-orange-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">Check-outs ({selectedDaySummary.checkOuts.length})</span>
                      </div>
                      <div className="space-y-2">
                        {selectedDaySummary.checkOuts.map((s) => (
                          <div key={s.id} className="p-2.5 bg-orange-500/5 border border-orange-500/10 rounded-xl">
                            <p className="text-sm font-bold">{s.guestName || "Hóspede"}</p>
                            {s.cabinName && <p className="text-[10px] text-muted-foreground">{s.cabinName}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hospedados (In House) */}
                  {selectedDaySummary.inHouse.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <BedDouble size={12} className="text-blue-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Hospedados ({selectedDaySummary.inHouse.length})</span>
                      </div>
                      <div className="space-y-2">
                        {selectedDaySummary.inHouse.map((s) => (
                          <div key={s.id} className="p-2.5 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                            <p className="text-sm font-bold">{s.guestName || "Hóspede"}</p>
                            {s.cabinName && <p className="text-[10px] text-muted-foreground">{s.cabinName}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Events */}
                  {selectedDaySummary.events.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Ticket size={12} className="text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Eventos ({selectedDaySummary.events.length})</span>
                      </div>
                      <div className="space-y-2">
                        {selectedDaySummary.events.map((e) => (
                          <div key={e.id} className="p-2.5 bg-primary/5 border border-primary/10 rounded-xl">
                            <p className="text-sm font-bold">{e.title}</p>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              {e.startTime && <p className="text-[10px] text-muted-foreground">{e.startTime}{e.endTime ? ` – ${e.endTime}` : ""}</p>}
                              {e.location && <p className="text-[10px] text-muted-foreground">{e.location}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Structure Bookings */}
                  {selectedDaySummary.structureBookings.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <CalendarDays size={12} className="text-slate-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estruturas ({selectedDaySummary.structureBookings.length})</span>
                      </div>
                      <div className="space-y-2">
                        {selectedDaySummary.structureBookings.map((b) => (
                          <div key={b.id} className="p-2.5 bg-slate-500/5 border border-slate-500/10 rounded-xl">
                            <p className="text-sm font-bold">{b.structureName || "Estrutura"}</p>
                            <div className="flex gap-2 mt-1">
                              <p className="text-[10px] text-muted-foreground">{b.startTime} – {b.endTime}</p>
                              {b.guestName && <p className="text-[10px] text-muted-foreground">{b.guestName}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Birthdays — in-house */}
                  {selectedDaySummary.birthdays.some((b) => b.isInHouse) && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Gift size={12} className="text-amber-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                          Aniversários · In-house ({selectedDaySummary.birthdays.filter((b) => b.isInHouse).length})
                        </span>
                      </div>
                      <div className="space-y-2">
                        {selectedDaySummary.birthdays.filter((b) => b.isInHouse).map((b, i) => (
                          <div key={i} className="p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                            <p className="text-sm font-bold">{b.guestName}</p>
                            {b.age !== undefined && <p className="text-[10px] text-muted-foreground">{b.age} anos</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Birthdays — staff */}
                  {selectedDaySummary.birthdays.some((b) => b.isStaff) && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Gift size={12} className="text-indigo-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                          Equipe ({selectedDaySummary.birthdays.filter((b) => b.isStaff).length})
                        </span>
                      </div>
                      <div className="space-y-2">
                        {selectedDaySummary.birthdays.filter((b) => b.isStaff).map((b, i) => (
                          <div key={i} className="p-2.5 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                            <p className="text-sm font-bold text-indigo-300">{b.guestName}</p>
                            {b.age !== undefined && <p className="text-[10px] text-indigo-400/60">{b.age} anos</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Birthdays — guests not in-house */}
                  {selectedDaySummary.birthdays.some((b) => !b.isInHouse && !b.isStaff) && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Gift size={12} className="text-amber-400/40" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                          Aniversários · Fora ({selectedDaySummary.birthdays.filter((b) => !b.isInHouse && !b.isStaff).length})
                        </span>
                      </div>
                      <div className="space-y-2">
                        {selectedDaySummary.birthdays.filter((b) => !b.isInHouse && !b.isStaff).map((b, i) => (
                          <div key={i} className="p-2 bg-muted/20 border border-white/5 rounded-xl">
                            <p className="text-sm text-muted-foreground">{b.guestName}</p>
                            {b.age !== undefined && <p className="text-[10px] text-muted-foreground/50">{b.age} anos</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-card border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-muted-foreground text-center min-h-64">
                <CalendarDays size={40} className="opacity-20 mb-3" />
                <p className="text-sm font-medium">Clique em um dia para ver o resumo</p>
                <p className="text-xs mt-1 opacity-60">Check-ins, eventos e reservas de estrutura</p>
              </div>
            )}

            {/* Stats — day if selected, month totals otherwise */}
            <p className="mt-4 text-[9px] text-muted-foreground/50 text-center uppercase tracking-widest">
              {selectedDaySummary ? `Resumo do dia ${formatDatePT(selectedDay!)}` : "Totais do mês"}
            </p>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <div className="bg-card border border-white/5 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-emerald-400">
                  {selectedDaySummary ? selectedDaySummary.checkIns.length + selectedDaySummary.checkOuts.length + selectedDaySummary.inHouse.length : stays.length}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Hospedagens</p>
              </div>
              <div className="bg-card border border-white/5 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-primary">
                  {selectedDaySummary ? selectedDaySummary.events.length : events.filter(e => e.status === "published").length}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Eventos</p>
              </div>
              <div className="bg-card border border-white/5 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-slate-400">
                  {selectedDaySummary ? selectedDaySummary.structureBookings.length : structureBookings.length}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Estruturas</p>
              </div>
              <div className="bg-card border border-white/5 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-amber-400">
                  {selectedDaySummary ? selectedDaySummary.birthdays.length : birthdayDaysCount}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Aniversários</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
