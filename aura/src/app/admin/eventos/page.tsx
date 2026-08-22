"use client";

import React from "react";
import { Plus, Calendar, List, ChevronLeft, ChevronRight, Ticket, Clock, MapPin, Building2, Edit2 } from "lucide-react";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { EventStatus, EventType } from "@/types/aura";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import {
  PageShell, PageHeader, SegmentedTabs, FilterChips, SearchInput, Button, IconButton, Card, Pill, Loadable, SkeletonList, EmptyState, Dialog, useIsMobile, useTabParam,
} from "@/components/aura";
import { useEventos, type ViewMode } from "./_components/useEventos";
import { EventCard } from "./_components/EventCard";
import { EventFormDialog } from "./_components/EventFormDialog";
import { TYPE_LABELS, TYPE_TONE, WEEK_DAYS, formatDatePT } from "./_components/eventos-utils";

const VIEWS: ViewMode[] = ["list", "calendar"];

export default function EventosPage() {
  const ev = useEventos();
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useTabParam<ViewMode>("view", "list", VIEWS);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const hasFilters = !!(ev.filterType || ev.filterStatus || ev.search);

  if (!ev.property) return <PageShell><EmptyState icon={Building2} title="Selecione uma propriedade" description="Os eventos são por propriedade." /></PageShell>;

  const published = ev.events.filter(e => e.status === "published").length;
  const drafts = ev.events.filter(e => e.status === "draft").length;

  const dayPanel = ev.selectedDay ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {ev.selectedDayEvents.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: T.muted, textAlign: "center", padding: "16px 0" }}>Nenhum evento neste dia.</p>
      ) : ev.selectedDayEvents.map(event => (
        <div key={event.id} style={{ padding: 12, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.text, lineHeight: 1.3 }}>{event.title}</p>
            <Pill tone={TYPE_TONE[event.type]} label={TYPE_LABELS[event.type]} />
          </div>
          {event.startTime && <p style={{ margin: 0, fontSize: 11, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}><Clock size={10} />{event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}</p>}
          {event.location && <p style={{ margin: 0, fontSize: 11, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={10} />{event.location}</p>}
          <Button variant="ghost" size="sm" icon={Edit2} onClick={() => ev.openEdit(event)} style={{ alignSelf: "flex-start", marginTop: 2 }}>Editar</Button>
        </div>
      ))}
      <Button variant="outline" icon={Plus} fullWidth onClick={() => ev.openCreate(ev.selectedDay!)}>Novo evento neste dia</Button>
    </div>
  ) : null;

  return (
    <PageShell>
      <PageHeader
        icon={Ticket}
        title="Eventos"
        subtitle={`${published} publicados · ${drafts} rascunhos`}
        primaryAction={{ label: "Novo evento", icon: Plus, onClick: () => ev.openCreate() }}
        actions={<SegmentedTabs<ViewMode> items={[{ id: "list", label: "Lista", icon: List }, { id: "calendar", label: "Calendário", icon: Calendar }]} value={viewMode} onChange={setViewMode} size="sm" iconOnlyOnMobile ariaLabel="Modo de visualização" />}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <SearchInput value={ev.search} onChange={ev.setSearch} placeholder="Buscar evento ou local…" wrapStyle={{ flex: "1 1 220px", maxWidth: 360 }} />
          <FilterChips<"" | EventType> items={[{ id: "", label: "Todos os tipos" }, { id: "local", label: "Na Pousada", tone: "brand" }, { id: "external", label: "Externo", tone: "violet" }]} value={ev.filterType} onChange={ev.setFilterType} scroll={false} ariaLabel="Tipo" />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <FilterChips<"" | EventStatus> items={[{ id: "", label: "Todos os status" }, { id: "draft", label: "Rascunho", tone: "amber" }, { id: "published", label: "Publicado", tone: "green" }, { id: "finished", label: "Encerrado", tone: "blue" }, { id: "cancelled", label: "Cancelado", tone: "red" }]} value={ev.filterStatus} onChange={ev.setFilterStatus} ariaLabel="Status" />
          {hasFilters && <Button variant="link" size="sm" onClick={ev.clearFilters} style={{ flexShrink: 0 }}>Limpar</Button>}
        </div>
      </div>

      <Loadable loading={ev.loading} skeleton={<SkeletonList rows={5} avatar={false} />}>
        {viewMode === "list" ? (
          ev.filteredEvents.length === 0 ? (
            <EmptyState icon={Ticket} title={ev.events.length === 0 ? "Nenhum evento ainda" : "Nenhum evento encontrado"} description={ev.events.length === 0 ? "Crie o primeiro evento para aparecer na agenda do hóspede." : "Ajuste os filtros ou a busca."} action={ev.events.length === 0 ? { label: "Novo evento", icon: Plus, onClick: () => ev.openCreate() } : undefined} secondaryAction={hasFilters ? { label: "Limpar filtros", onClick: ev.clearFilters } : undefined} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ev.filteredEvents.map(event => (
                <EventCard key={event.id} event={event} onEdit={() => ev.openEdit(event)} onTogglePublish={() => ev.handlePublishToggle(event)} onDelete={() => ev.handleDelete(event)} />
              ))}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <IconButton icon={ChevronLeft} label="Mês anterior" variant="secondary" onClick={() => ev.setCurrentMonth(m => subMonths(m, 1))} />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: T.text, textTransform: "capitalize" }}>{format(ev.currentMonth, "MMMM yyyy", { locale: ptBR })}</h2>
                <IconButton icon={ChevronRight} label="Próximo mês" variant="secondary" onClick={() => ev.setCurrentMonth(m => addMonths(m, 1))} />
              </div>
              <Card pad={0} style={{ overflow: "hidden" }}>
                <div className="grid grid-cols-7" style={{ borderBottom: `1px solid ${T.border}` }}>
                  {WEEK_DAYS.map(d => <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted }}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7">
                  {ev.calendarGrid.map((day, idx) => {
                    if (!day) return <div key={`e-${idx}`} className="aspect-square" style={{ borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, background: T.glass, opacity: .5 }} />;
                    const dateStr = `${ev.currentMonth.getFullYear()}-${String(ev.currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayEvents = ev.eventsByDate[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    const isSelected = ev.selectedDay === dateStr;
                    return (
                      <button key={day} type="button" onClick={() => ev.setSelectedDay(isSelected ? null : dateStr)} className="ak-focus aspect-square" aria-pressed={isSelected} aria-label={`Dia ${day}`}
                        style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: 6, border: "none", borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, background: isSelected ? toneOf("brand").bg : "transparent", boxShadow: isSelected ? `inset 0 0 0 1px ${T.g1Border}` : "none", cursor: "pointer", fontFamily: "inherit", minWidth: 0 }}>
                        <span style={{ width: 24, height: 24, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, background: isToday ? T.grad : "transparent", color: isToday ? "#fff" : dayEvents.length ? T.text : T.muted }}>{day}</span>
                        {dayEvents.length > 0 && (
                          <span style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
                            {dayEvents.slice(0, 3).map(e => <span key={e.id} style={{ width: 6, height: 6, borderRadius: "50%", background: toneOf(TYPE_TONE[e.type]).color }} />)}
                            {dayEvents.length > 3 && <span style={{ fontSize: 8, color: T.muted }}>+{dayEvents.length - 3}</span>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Card>
              <div style={{ display: "flex", gap: 14, fontSize: 12, color: T.muted, padding: "0 4px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: toneOf("brand").color }} /> Na Pousada</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: toneOf("violet").color }} /> Externo</span>
              </div>
            </div>

            {/* Painel do dia — card no desktop, sheet no celular */}
            <div className="hidden lg:block">
              {ev.selectedDay ? (
                <Card header={{ title: formatDatePT(ev.selectedDay), sub: `${ev.selectedDayEvents.length} evento${ev.selectedDayEvents.length === 1 ? "" : "s"}`, aside: <Button variant="ghost" size="sm" onClick={() => ev.setSelectedDay(null)}>Fechar</Button> }}>
                  {dayPanel}
                </Card>
              ) : (
                <Card><EmptyState compact icon={Calendar} title="Clique em um dia" description="para ver os eventos daquela data" /></Card>
              )}
            </div>
            <Dialog open={isMobile && !!ev.selectedDay} onClose={() => ev.setSelectedDay(null)} presentation="sheet" size="md" title={ev.selectedDay ? formatDatePT(ev.selectedDay) : ""} subtitle={`${ev.selectedDayEvents.length} evento${ev.selectedDayEvents.length === 1 ? "" : "s"}`}>
              {dayPanel}
            </Dialog>
          </div>
        )}
      </Loadable>

      <EventFormDialog open={ev.showModal} editing={ev.editingEvent} form={ev.form} setForm={ev.setForm} saving={ev.savingForm} onClose={ev.closeModal} onSave={ev.handleSave} />
    </PageShell>
  );
}
