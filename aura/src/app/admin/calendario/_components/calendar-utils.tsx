"use client";

// Tipos, helpers e blocos visuais puros do Calendário.
import React from "react";
import { BedDouble, CalendarDays, Gift, LogIn, LogOut, Ticket } from "lucide-react";
import type { Event } from "@/types/aura";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { Pill, SectionLabel } from "@/components/aura";

export interface StayEntry {
  id: string;
  checkIn: string;
  checkOut: string;
  guestName?: string;
  cabinName?: string;
  internalUse?: boolean;        // ocupação interna (uso da casa)
  countsForOccupancy?: boolean; // false → cabana fora da ocupação
}
export interface StructureBookingEntry { id: string; date: string; startTime: string; endTime: string; structureName?: string; guestName?: string; status: string }
export interface BirthdayEntry { guestName: string; age?: number; isInHouse: boolean; isStaff?: boolean }
export interface BirthdayRecord extends BirthdayEntry { dateStr: string }
export interface DaySummary {
  checkIns: StayEntry[]; checkOuts: StayEntry[]; inHouse: StayEntry[];
  events: Event[]; structureBookings: StructureBookingEntry[]; birthdays: BirthdayEntry[];
}
export const EMPTY_SUMMARY: DaySummary = { checkIns: [], checkOuts: [], inHouse: [], events: [], structureBookings: [], birthdays: [] };

export const WEEK_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export type LayerKey = "checkin" | "checkout" | "inhouse" | "evlocal" | "evext" | "structure" | "bdInhouse" | "bdOut" | "bdStaff";
export const LAYERS: { key: LayerKey; label: string; tone: Tone; soft?: boolean }[] = [
  { key: "checkin",   label: "Check-in",               tone: "green" },
  { key: "checkout",  label: "Check-out",              tone: "orange" },
  { key: "inhouse",   label: "Hospedados",             tone: "blue" },
  { key: "evlocal",   label: "Evento local",           tone: "brand" },
  { key: "evext",     label: "Evento externo",         tone: "violet" },
  { key: "structure", label: "Estrutura",              tone: "neutral" },
  { key: "bdInhouse", label: "Aniversário (in-house)", tone: "amber" },
  { key: "bdOut",     label: "Aniversário (fora)",     tone: "amber", soft: true },
  { key: "bdStaff",   label: "Aniversário (equipe)",   tone: "rose" },
];
export const ALL_LAYER_KEYS = LAYERS.map(l => l.key);

export function getMonthBounds(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  return { start, end, year, month };
}
export function toLocalDateStr(isoStr: string): string { return isoStr ? isoStr.split("T")[0] : ""; }
export function formatDatePT(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${day} ${months[parseInt(month) - 1]} ${year}`;
}
export function summaryTotal(s: DaySummary) {
  return s.checkIns.length + s.checkOuts.length + s.inHouse.length + s.events.length + s.structureBookings.length + s.birthdays.length;
}

// ── Pontinhos do dia (grade) ──
function dotCount(n: number) { if (n <= 4) return n; if (n <= 6) return 4; return 4 + Math.ceil((n - 6) / 3); }
export interface DotGroup { count: number; color: string }
export function DotRow({ groups }: { groups: DotGroup[] }) {
  const dots: { color: string; x: number }[] = [];
  const meta: { startX: number; width: number; group: DotGroup }[] = [];
  let x = 0;
  for (const g of groups) {
    const n = dotCount(g.count);
    meta.push({ startX: x, width: n * 6, group: g });
    for (let i = 0; i < n; i++) { dots.push({ color: g.color, x }); x += 6; }
  }
  return (
    <span className="relative inline-flex shrink-0 group" style={{ width: x, height: 6 }} aria-hidden>
      {dots.map((d, i) => <span key={i} style={{ position: "absolute", left: d.x, top: 0, width: 6, height: 6, borderRadius: "50%", background: d.color }} />)}
      {meta.map(({ startX, width, group }, gi) => group.count > 4 ? (
        <span key={`l-${gi}`} className="opacity-0 group-hover:opacity-100" style={{ position: "absolute", left: startX, width, top: 0, height: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, fontWeight: 900, color: group.color, textShadow: `0 0 2px ${T.card}` }}>{group.count}</span>
      ) : null)}
    </span>
  );
}

// ── Resumo do dia (painel lateral, sheet e agenda) ──
function Block({ icon, tone, title, count, children }: { icon: React.ReactNode; tone: Tone; title: string; count: number; children: React.ReactNode }) {
  const t = toneOf(tone);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: t.color }}>
        {icon}
        <SectionLabel style={{ color: t.color }}>{title} ({count})</SectionLabel>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}
function Row({ tone, title, sub, internal }: { tone: Tone; title: React.ReactNode; sub?: React.ReactNode; internal?: boolean }) {
  const t = toneOf(tone);
  return (
    <div style={{ padding: "8px 10px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{title}{internal && <Pill tone="amber" label="Uso da casa" />}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function DaySummaryContent({ summary }: { summary: DaySummary }) {
  const inHouseBd = summary.birthdays.filter(b => b.isInHouse);
  const staffBd = summary.birthdays.filter(b => b.isStaff);
  const outBd = summary.birthdays.filter(b => !b.isInHouse && !b.isStaff);
  return (
    <>
      {summary.checkIns.length > 0 && (
        <Block icon={<LogIn size={12} />} tone="green" title="Check-ins" count={summary.checkIns.length}>
          {summary.checkIns.map(s => <Row key={s.id} tone="green" title={s.guestName || "Hóspede"} sub={s.cabinName} internal={s.internalUse} />)}
        </Block>
      )}
      {summary.checkOuts.length > 0 && (
        <Block icon={<LogOut size={12} />} tone="orange" title="Check-outs" count={summary.checkOuts.length}>
          {summary.checkOuts.map(s => <Row key={s.id} tone="orange" title={s.guestName || "Hóspede"} sub={s.cabinName} internal={s.internalUse} />)}
        </Block>
      )}
      {summary.inHouse.length > 0 && (
        <Block icon={<BedDouble size={12} />} tone="blue" title="Hospedados" count={summary.inHouse.length}>
          {summary.inHouse.map(s => <Row key={s.id} tone="blue" title={s.guestName || "Hóspede"} sub={s.cabinName} internal={s.internalUse} />)}
        </Block>
      )}
      {summary.events.length > 0 && (
        <Block icon={<Ticket size={12} />} tone="brand" title="Eventos" count={summary.events.length}>
          {summary.events.map(e => <Row key={e.id} tone="brand" title={e.title} sub={[e.startTime ? `${e.startTime}${e.endTime ? ` – ${e.endTime}` : ""}` : null, e.location].filter(Boolean).join(" · ") || undefined} />)}
        </Block>
      )}
      {summary.structureBookings.length > 0 && (
        <Block icon={<CalendarDays size={12} />} tone="neutral" title="Estruturas" count={summary.structureBookings.length}>
          {summary.structureBookings.map(b => <Row key={b.id} tone="neutral" title={b.structureName || "Estrutura"} sub={`${b.startTime} – ${b.endTime}${b.guestName ? ` · ${b.guestName}` : ""}`} />)}
        </Block>
      )}
      {inHouseBd.length > 0 && (
        <Block icon={<Gift size={12} />} tone="amber" title="Aniversários · in-house" count={inHouseBd.length}>
          {inHouseBd.map((b, i) => <Row key={i} tone="amber" title={b.guestName} sub={b.age !== undefined ? `${b.age} anos` : undefined} />)}
        </Block>
      )}
      {staffBd.length > 0 && (
        <Block icon={<Gift size={12} />} tone="rose" title="Equipe" count={staffBd.length}>
          {staffBd.map((b, i) => <Row key={i} tone="rose" title={b.guestName} sub={b.age !== undefined ? `${b.age} anos` : undefined} />)}
        </Block>
      )}
      {outBd.length > 0 && (
        <Block icon={<Gift size={12} />} tone="neutral" title="Aniversários · fora" count={outBd.length}>
          {outBd.map((b, i) => <Row key={i} tone="neutral" title={<span style={{ color: T.muted }}>{b.guestName}</span>} sub={b.age !== undefined ? `${b.age} anos` : undefined} />)}
        </Block>
      )}
    </>
  );
}
