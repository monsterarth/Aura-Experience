"use client";

import React, { useEffect, useRef, useState } from "react";
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Gift, LayoutGrid, List, Ticket, BedDouble } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useProperty } from "@/context/PropertyContext";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import {
  PageShell, PageHeader, SegmentedTabs, FilterChips, Button, IconButton, Card, Pill, KpiGrid, KpiCard, Loadable, PageSkeleton, EmptyState, Dialog, useIsMobile,
} from "@/components/aura";
import { useCalendarData } from "./_components/useCalendarData";
import { ALL_LAYER_KEYS, DaySummaryContent, DotRow, formatDatePT, LAYERS, summaryTotal, WEEK_DAYS, type DotGroup, type LayerKey } from "./_components/calendar-utils";

type ViewMode = "grid" | "agenda";

export default function CalendarioPage() {
  const { currentProperty: property } = useProperty();
  const isMobile = useIsMobile();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [visibleLayers, setVisibleLayers] = useState<LayerKey[]>(ALL_LAYER_KEYS);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const userPickedView = useRef(false);
  useEffect(() => { if (!userPickedView.current) setViewMode(isMobile ? "agenda" : "grid"); }, [isMobile]);
  const pickView = (m: ViewMode) => { userPickedView.current = true; setViewMode(m); };

  const cal = useCalendarData(property?.id, currentMonth);
  const hidden = (k: LayerKey) => !visibleLayers.includes(k);
  const goMonth = (delta: number) => { setCurrentMonth(m => (delta > 0 ? addMonths(m, 1) : subMonths(m, 1))); setSelectedDay(null); };
  const selectedSummary = cal.summaryFor(selectedDay);
  const hiddenCount = ALL_LAYER_KEYS.length - visibleLayers.length;

  if (!property) return <PageShell><EmptyState icon={Building2} title="Selecione uma propriedade" description="O calendário mostra a operação da propriedade ativa." /></PageShell>;

  const monthNav = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <IconButton icon={ChevronLeft} label="Mês anterior" variant="secondary" onClick={() => goMonth(-1)} />
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: T.text, textTransform: "capitalize", letterSpacing: "-.2px" }}>{format(currentMonth, "MMMM yyyy", { locale: ptBR })}</h2>
      <IconButton icon={ChevronRight} label="Próximo mês" variant="secondary" onClick={() => goMonth(1)} />
    </div>
  );

  const kpis = (daySummary = selectedSummary, cols: 2 | 4 = 4) => (
    <KpiGrid cols={cols} stagger={false}>
      <KpiCard compact label="Hospedagens" icon={BedDouble} tone="green" value={daySummary ? daySummary.checkIns.length + daySummary.checkOuts.length + daySummary.inHouse.length : cal.stays.length} />
      <KpiCard compact label="Eventos" icon={Ticket} tone="brand" value={daySummary ? daySummary.events.length : cal.publishedEvents} />
      <KpiCard compact label="Estruturas" icon={CalendarDays} tone="neutral" value={daySummary ? daySummary.structureBookings.length : cal.structureBookings.length} />
      <KpiCard compact label="Aniversários" icon={Gift} tone="amber" value={daySummary ? daySummary.birthdays.length : cal.birthdayDaysCount} />
    </KpiGrid>
  );

  return (
    <PageShell>
      <PageHeader
        icon={CalendarDays}
        title="Calendário"
        subtitle="Visão unificada de eventos, hospedagens e estruturas"
        actions={(
          <>
            <SegmentedTabs<ViewMode> items={[{ id: "grid", label: "Grade", icon: LayoutGrid }, { id: "agenda", label: "Agenda", icon: List }]} value={viewMode} onChange={pickView} size="sm" ariaLabel="Modo de visualização" iconOnlyOnMobile />
            <Button variant="secondary" onClick={() => { setCurrentMonth(startOfMonth(new Date())); setSelectedDay(null); }}>Hoje</Button>
          </>
        )}
      />

      {/* Camadas */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <FilterChips<LayerKey> multiple ariaLabel="Camadas" items={LAYERS.map(l => ({ id: l.key, label: l.label, tone: l.tone }))} values={visibleLayers} onChange={setVisibleLayers} />
        {hiddenCount > 0 && <Button variant="link" size="sm" onClick={() => setVisibleLayers(ALL_LAYER_KEYS)}>Mostrar todas ({hiddenCount} ocultas)</Button>}
      </div>

      <Loadable loading={cal.loading} skeleton={<PageSkeleton kpis={4} rows={6} />} error={cal.error} onRetry={() => void cal.reload()}>
        {viewMode === "agenda" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {monthNav}
            {kpis(null)}
            {cal.agendaDays.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Nenhum item neste mês" description="Check-ins, eventos, estruturas e aniversários aparecem aqui." />
            ) : cal.agendaDays.map(({ dateStr, summary }) => {
              const isToday = dateStr === cal.todayStr;
              return (
                <Card key={dateStr} pad={0} style={{ borderColor: isToday ? T.g1Border : undefined, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: T.text, textTransform: "uppercase", letterSpacing: ".02em" }}>{formatDatePT(dateStr)}</span>
                    {isToday && <Pill tone="brand" label="Hoje" />}
                  </div>
                  <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}><DaySummaryContent summary={summary} /></div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              {monthNav}
              <Card pad={0} style={{ overflow: "hidden" }}>
                <div className="grid grid-cols-7" style={{ borderBottom: `1px solid ${T.border}` }}>
                  {WEEK_DAYS.map(d => <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted }}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7">
                  {cal.calendarGrid.map((day, idx) => {
                    if (!day) return <div key={`e-${idx}`} className="min-h-[60px] md:min-h-[80px]" style={{ borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, background: T.glass, opacity: .5 }} />;
                    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const summary = cal.summaryByDate[dateStr];
                    const isToday = dateStr === cal.todayStr;
                    const isSelected = selectedDay === dateStr;
                    const occupancy = summary ? summary.checkIns.filter(s => s.countsForOccupancy !== false).length + summary.inHouse.filter(s => s.countsForOccupancy !== false).length : 0;
                    const isLotado = cal.totalCabins > 0 && occupancy >= cal.totalCabins;
                    const isQuaseCheia = cal.totalCabins > 0 && !isLotado && occupancy / cal.totalCabins >= 0.8;
                    const hasItems = !!summary && summaryTotal(summary) > 0;
                    const groups: DotGroup[] = [];
                    if (summary) {
                      const add = (count: number, tone: LayerKey extends never ? never : Parameters<typeof toneOf>[0], soft?: boolean) => { if (count > 0) groups.push({ count, color: soft ? `color-mix(in srgb, ${toneOf(tone).color} 45%, transparent)` : toneOf(tone).color }); };
                      if (!hidden("checkin") && !isLotado) add(summary.checkIns.length < 5 ? summary.checkIns.length : 0, "green");
                      if (!hidden("checkout")) add(summary.checkOuts.length < 5 ? summary.checkOuts.length : 0, "orange");
                      if (!hidden("inhouse") && !isLotado && !isQuaseCheia) add(summary.inHouse.length, "blue");
                      if (!hidden("evlocal")) add(summary.events.filter(e => e.type === "local").length, "brand");
                      if (!hidden("evext")) add(summary.events.filter(e => e.type !== "local").length, "violet");
                      if (!hidden("structure")) add(summary.structureBookings.length, "neutral");
                      if (!hidden("bdInhouse")) add(summary.birthdays.filter(b => b.isInHouse).length, "amber");
                      if (!hidden("bdOut")) add(summary.birthdays.filter(b => !b.isInHouse && !b.isStaff).length, "amber", true);
                      if (!hidden("bdStaff")) add(summary.birthdays.filter(b => b.isStaff).length, "rose");
                    }
                    return (
                      <button key={day} type="button" onClick={() => setSelectedDay(isSelected ? null : dateStr)} className="ak-focus min-h-[60px] md:min-h-[80px]" aria-pressed={isSelected} aria-label={`Dia ${day}`}
                        style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: 6, textAlign: "left", cursor: "pointer", fontFamily: "inherit", border: "none", borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, background: isSelected ? toneOf("brand").bg : "transparent", boxShadow: isSelected ? `inset 0 0 0 1px ${T.g1Border}` : "none", minWidth: 0 }}>
                        <span style={{ width: 24, height: 24, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, background: isToday ? T.grad : "transparent", color: isToday ? "#fff" : hasItems ? T.text : T.muted }}>{day}</span>
                        {summary && (
                          <span style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%", minWidth: 0 }}>
                            {isLotado && <span style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em", textAlign: "center", borderRadius: 6, padding: "2px 0", background: T.blueBg, color: T.blue, border: `1px solid ${T.blueBorder}` }}>Lotado</span>}
                            {isQuaseCheia && <span style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".06em", textAlign: "center", borderRadius: 6, padding: "2px 0", background: T.blueBg, color: T.blue }}>{occupancy} estadias</span>}
                            {summary.checkIns.length >= 5 && !isLotado && <span style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", textAlign: "center", borderRadius: 6, padding: "2px 0", background: T.greenBg, color: T.green }}>{summary.checkIns.length} entradas</span>}
                            {summary.checkOuts.length >= 5 && <span style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", textAlign: "center", borderRadius: 6, padding: "2px 0", background: T.orangeBg, color: T.orange }}>{summary.checkOuts.length} saídas</span>}
                            {groups.length > 0 && <DotRow groups={groups} />}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* Painel do dia (desktop) */}
            <div className="hidden lg:flex" style={{ flexDirection: "column", gap: 12, minWidth: 0 }}>
              {selectedDay && selectedSummary ? (
                <Card pad={16} style={{ overflow: "hidden" }} header={{ title: formatDatePT(selectedDay), sub: `${summaryTotal(selectedSummary)} ite${summaryTotal(selectedSummary) === 1 ? "m" : "ns"}`, aside: <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>Fechar</Button> }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 600, overflowY: "auto", margin: "0 -4px", padding: "0 4px" }}>
                    {summaryTotal(selectedSummary) === 0 ? <p style={{ margin: 0, fontSize: 13, color: T.muted, textAlign: "center", padding: "24px 0" }}>Nenhum item neste dia.</p> : <DaySummaryContent summary={selectedSummary} />}
                  </div>
                </Card>
              ) : (
                <Card><EmptyState compact icon={CalendarDays} title="Clique em um dia para ver o resumo" description="Check-ins, eventos e reservas de estrutura" /></Card>
              )}
              <span style={{ fontSize: 9, color: T.muted2, textAlign: "center", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 800 }}>{selectedSummary ? `Resumo do dia ${formatDatePT(selectedDay!)}` : "Totais do mês"}</span>
              {kpis(selectedSummary, 2)}
            </div>

            {/* Celular: totais do mês + dia selecionado em sheet */}
            <div className="lg:hidden" style={{ display: "flex", flexDirection: "column", gap: 12 }}>{kpis(null)}</div>
            <Dialog open={!isMobile ? false : !!selectedDay} onClose={() => setSelectedDay(null)} presentation="sheet" size="md" title={selectedDay ? formatDatePT(selectedDay) : ""} subtitle={selectedSummary ? `${summaryTotal(selectedSummary)} itens` : undefined}>
              {selectedSummary && (summaryTotal(selectedSummary) === 0 ? <p style={{ margin: 0, fontSize: 13, color: T.muted, textAlign: "center", padding: "16px 0" }}>Nenhum item neste dia.</p> : <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><DaySummaryContent summary={selectedSummary} /></div>)}
            </Dialog>
          </div>
        )}
      </Loadable>
    </PageShell>
  );
}
