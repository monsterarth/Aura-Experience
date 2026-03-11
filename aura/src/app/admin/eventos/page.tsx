"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { EventService } from "@/services/event-service";
import { Event, EventType, EventStatus, EventCategory } from "@/types/aura";
import { supabase } from "@/lib/supabase";
import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { ImageUpload } from "@/components/admin/ImageUpload";
import {
  Loader2, Plus, Calendar, List, MapPin, Clock, Tag,
  ChevronLeft, ChevronRight, ExternalLink, Edit2, Trash2,
  Eye, EyeOff, Ticket, Search, X, Star, Globe, Building2,
  Zap, Music, Utensils, Dumbbell, Palette, Moon, Briefcase,
  Heart, Cake, HelpCircle, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==========================================
// CONSTANTS
// ==========================================

const CATEGORY_LABELS: Record<EventCategory, string> = {
  entertainment: "Entretenimento",
  gastronomy: "Gastronomia",
  sports: "Esportes",
  culture: "Cultura",
  nightlife: "Vida Noturna",
  corporate: "Corporativo",
  wedding: "Casamento",
  birthday: "Aniversário",
  other: "Outro",
};

const CATEGORY_ICONS: Record<EventCategory, React.ElementType> = {
  entertainment: Zap,
  gastronomy: Utensils,
  sports: Dumbbell,
  culture: Palette,
  nightlife: Moon,
  corporate: Briefcase,
  wedding: Heart,
  birthday: Cake,
  other: HelpCircle,
};

const TYPE_LABELS: Record<EventType, string> = {
  local: "Na Pousada",
  external: "Externo",
  private: "Privado",
};

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  cancelled: "Cancelado",
  finished: "Encerrado",
};

const STATUS_COLORS: Record<EventStatus, string> = {
  draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  published: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  finished: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const TYPE_COLORS: Record<EventType, string> = {
  local: "bg-primary/10 text-primary border-primary/20",
  external: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  private: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const WEEK_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// ==========================================
// EMPTY FORM STATE
// ==========================================

const emptyForm = (): Partial<Event> => ({
  title: "",
  titleEn: "",
  titleEs: "",
  description: "",
  descriptionEn: "",
  descriptionEs: "",
  type: "external",
  category: "entertainment",
  status: "draft",
  visibility: "all_guests",
  featured: false,
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: "",
  startTime: "",
  endTime: "",
  location: "",
  locationUrl: "",
  price: undefined,
  priceDescription: "",
  maxCapacity: undefined,
  imageUrl: "",
  externalUrl: "",
});

// ==========================================
// HELPER: format date PT
// ==========================================

function formatDatePT(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${day} ${months[parseInt(month) - 1]} ${year}`;
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function EventosPage() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));

  // Filters
  const [filterType, setFilterType] = useState<"" | EventType>("");
  const [filterStatus, setFilterStatus] = useState<"" | EventStatus>("");
  const [search, setSearch] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [form, setForm] = useState<Partial<Event>>(emptyForm());
  const [savingForm, setSavingForm] = useState(false);
  const [langTab, setLangTab] = useState<"pt" | "en" | "es">("pt");
  const [confirmDelete, setConfirmDelete] = useState<Event | null>(null);

  // Calendar selected day
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      const data = await EventService.getEvents(property.id);
      setEvents(data);
    } catch {
      toast.error("Erro ao carregar eventos");
    } finally {
      setLoading(false);
    }
  }, [property?.id]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Realtime subscription
  useEffect(() => {
    if (!property?.id) return;
    const channel = supabase
      .channel("admin-events-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `propertyId=eq.${property.id}` }, () => loadEvents())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [property?.id, loadEvents]);

  // ==========================================
  // FILTERED EVENTS
  // ==========================================

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterType && e.type !== filterType) return false;
      if (filterStatus && e.status !== filterStatus) return false;
      if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.location?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [events, filterType, filterStatus, search]);

  // ==========================================
  // CALENDAR HELPERS
  // ==========================================

  const calendarGrid = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Mon-first
    const cells: (number | null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    return cells;
  }, [currentMonth]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, Event[]> = {};
    const year = currentMonth.getFullYear();
    const month = String(currentMonth.getMonth() + 1).padStart(2, "0");
    events.filter(e => e.status !== "cancelled").forEach((e) => {
      const start = e.startDate;
      const end = e.endDate || e.startDate;
      // simple single-date dot: show on startDate
      const key = start;
      if (key.startsWith(`${year}-${month}`)) {
        if (!map[key]) map[key] = [];
        map[key].push(e);
      }
      // also show on endDate if different month
      if (end !== start && end.startsWith(`${year}-${month}`)) {
        if (!map[end]) map[end] = [];
        map[end].push(e);
      }
    });
    return map;
  }, [events, currentMonth]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    return eventsByDate[selectedDay] || [];
  }, [selectedDay, eventsByDate]);

  // ==========================================
  // MODAL HANDLERS
  // ==========================================

  const openCreate = () => {
    setEditingEvent(null);
    setForm(emptyForm());
    setLangTab("pt");
    setShowModal(true);
  };

  const openEdit = (event: Event) => {
    setEditingEvent(event);
    setForm({ ...event });
    setLangTab("pt");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingEvent(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (!property?.id || !userData?.id) return;
    if (!form.title?.trim()) { toast.error("O título é obrigatório"); return; }
    if (!form.startDate) { toast.error("A data de início é obrigatória"); return; }

    setSavingForm(true);
    try {
      if (editingEvent) {
        await EventService.updateEvent(property.id, editingEvent.id, form as Partial<Event>, userData.id, userData.fullName);
        toast.success("Evento atualizado!");
      } else {
        await EventService.createEvent(property.id, form as Omit<Event, "id" | "createdAt" | "updatedAt">, userData.id, userData.fullName);
        toast.success("Evento criado!");
      }
      closeModal();
      loadEvents();
    } catch {
      toast.error("Erro ao salvar evento");
    } finally {
      setSavingForm(false);
    }
  };

  const handlePublishToggle = async (event: Event) => {
    if (!property?.id || !userData?.id) return;
    const newStatus = event.status === "published" ? "draft" : "published";
    try {
      await EventService.updateEvent(property.id, event.id, { status: newStatus }, userData.id, userData.fullName);
      toast.success(newStatus === "published" ? "Evento publicado!" : "Evento despublicado");
      loadEvents();
    } catch {
      toast.error("Erro ao alterar status");
    }
  };

  const handleDelete = async (event: Event) => {
    if (!property?.id || !userData?.id) return;
    try {
      await EventService.deleteEvent(property.id, event.id, userData.id, userData.fullName);
      toast.success("Evento cancelado");
      setConfirmDelete(null);
      loadEvents();
    } catch {
      toast.error("Erro ao cancelar evento");
    }
  };

  // ==========================================
  // GUARD
  // ==========================================

  if (!property) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>Selecione uma propriedade para continuar.</p>
      </div>
    );
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Eventos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {events.filter(e => e.status === "published").length} publicados · {events.filter(e => e.status === "draft").length} rascunhos
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex bg-secondary rounded-xl p-1 border border-white/5">
            <button
              onClick={() => setViewMode("list")}
              className={cn("p-2 rounded-lg transition-all", viewMode === "list" ? "bg-primary text-black" : "text-muted-foreground hover:text-foreground")}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={cn("p-2 rounded-lg transition-all", viewMode === "calendar" ? "bg-primary text-black" : "text-muted-foreground hover:text-foreground")}
            >
              <Calendar size={16} />
            </button>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-black font-black uppercase text-xs tracking-widest rounded-xl hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={16} /> Novo Evento
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar evento..."
            className="w-full bg-secondary border border-white/5 rounded-xl pl-8 pr-4 py-2 text-sm focus:outline-none focus:border-primary/50"
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as "" | EventType)}
          className="bg-secondary border border-white/5 rounded-xl px-3 py-2 text-sm text-muted-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="">Todos os tipos</option>
          <option value="local">Na Pousada</option>
          <option value="external">Externo</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "" | EventStatus)}
          className="bg-secondary border border-white/5 rounded-xl px-3 py-2 text-sm text-muted-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="published">Publicado</option>
          <option value="finished">Encerrado</option>
          <option value="cancelled">Cancelado</option>
        </select>

        {(filterType || filterStatus || search) && (
          <button onClick={() => { setFilterType(""); setFilterStatus(""); setSearch(""); }} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        )}
      </div>

      {/* LOADING */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-primary w-8 h-8" />
        </div>
      )}

      {/* LIST VIEW */}
      {!loading && viewMode === "list" && (
        <div className="space-y-3">
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground space-y-3 border border-white/5 rounded-2xl bg-card">
              <Ticket size={48} className="opacity-20" />
              <p className="font-semibold">Nenhum evento encontrado</p>
              <button onClick={openCreate} className="text-xs text-primary hover:underline">Criar primeiro evento</button>
            </div>
          ) : (
            filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onEdit={() => openEdit(event)}
                onTogglePublish={() => handlePublishToggle(event)}
                onDelete={() => setConfirmDelete(event)}
              />
            ))
          )}
        </div>
      )}

      {/* CALENDAR VIEW */}
      {!loading && viewMode === "calendar" && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                <ChevronLeft size={20} />
              </button>
              <h2 className="font-black uppercase text-lg tracking-tight">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </h2>
              <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Calendar grid */}
            <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-7 border-b border-white/5">
                {WEEK_DAYS.map(d => (
                  <div key={d} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {calendarGrid.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="aspect-square border-b border-r border-white/5 opacity-20" />;
                  const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayEvents = eventsByDate[dateStr] || [];
                  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
                  const isSelected = selectedDay === dateStr;

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                      className={cn(
                        "aspect-square border-b border-r border-white/5 p-1 flex flex-col items-start transition-colors relative",
                        isSelected ? "bg-primary/10" : "hover:bg-secondary/50",
                      )}
                    >
                      <span className={cn(
                        "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full",
                        isToday && "bg-primary text-black",
                        !isToday && "text-foreground",
                      )}>{day}</span>
                      {dayEvents.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {dayEvents.slice(0, 3).map((e) => (
                            <span
                              key={e.id}
                              className={cn("w-1.5 h-1.5 rounded-full", e.type === "local" ? "bg-primary" : "bg-purple-400")}
                            />
                          ))}
                          {dayEvents.length > 3 && <span className="text-[8px] text-muted-foreground">+{dayEvents.length - 3}</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 px-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-primary" /> Na Pousada
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-purple-400" /> Externo
              </div>
            </div>
          </div>

          {/* Day detail panel */}
          <div className="lg:col-span-1">
            {selectedDay ? (
              <div className="bg-card border border-white/5 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-black uppercase text-sm tracking-tight">{formatDatePT(selectedDay)}</h3>
                  <button onClick={() => setSelectedDay(null)} className="p-1 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                    <X size={14} />
                  </button>
                </div>
                {selectedDayEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento neste dia.</p>
                ) : (
                  selectedDayEvents.map((event) => (
                    <div key={event.id} className="p-3 bg-secondary/50 rounded-xl border border-white/5 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold leading-tight">{event.title}</p>
                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0", TYPE_COLORS[event.type])}>
                          {TYPE_LABELS[event.type]}
                        </span>
                      </div>
                      {event.startTime && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock size={10} />{event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}</p>}
                      {event.location && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin size={10} />{event.location}</p>}
                      <div className="flex gap-1 pt-1">
                        <button onClick={() => openEdit(event)} className="flex-1 text-[10px] font-bold px-2 py-1 bg-secondary rounded-lg hover:bg-primary hover:text-black transition-colors">Editar</button>
                      </div>
                    </div>
                  ))
                )}
                <button onClick={openCreate} className="w-full text-xs font-bold py-2 border border-dashed border-white/10 rounded-xl text-muted-foreground hover:text-primary hover:border-primary/30 transition-all">
                  + Novo evento neste dia
                </button>
              </div>
            ) : (
              <div className="bg-card border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-muted-foreground text-center h-full min-h-48">
                <Calendar size={32} className="opacity-20 mb-3" />
                <p className="text-sm">Clique em um dia no calendário para ver os eventos</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================================
          CREATE / EDIT MODAL
      ========================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative ml-auto w-full max-w-2xl bg-card border-l border-white/5 h-full overflow-y-auto shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-white/5 sticky top-0 bg-card z-10">
              <h2 className="text-lg font-black uppercase tracking-tight">
                {editingEvent ? "Editar Evento" : "Novo Evento"}
              </h2>
              <button onClick={closeModal} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 p-6 space-y-6">

              {/* Image */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Imagem do Evento</label>
                <div className="w-full h-48 rounded-2xl overflow-hidden border border-white/5 bg-secondary">
                  <ImageUpload
                    value={form.imageUrl || ""}
                    onUploadSuccess={(url) => setForm(f => ({ ...f, imageUrl: url }))}
                    path="events"
                  />
                </div>
              </div>

              {/* Language tabs */}
              <div>
                <div className="flex bg-secondary rounded-xl p-1 mb-4 w-fit border border-white/5">
                  {(["pt", "en", "es"] as const).map((l) => (
                    <button key={l} onClick={() => setLangTab(l)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all", langTab === l ? "bg-primary text-black" : "text-muted-foreground hover:text-foreground")}>
                      {l}
                    </button>
                  ))}
                </div>

                {langTab === "pt" && (
                  <div className="space-y-3">
                    <div>
                      <label className="field-label">Título (PT) *</label>
                      <input value={form.title || ""} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Show de Rock ao Vivo" className="field-input w-full" />
                    </div>
                    <div>
                      <label className="field-label">Descrição (PT)</label>
                      <textarea value={form.description || ""} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Descreva o evento..." className="field-input w-full resize-none" />
                    </div>
                  </div>
                )}
                {langTab === "en" && (
                  <div className="space-y-3">
                    <div>
                      <label className="field-label">Title (EN)</label>
                      <input value={form.titleEn || ""} onChange={(e) => setForm(f => ({ ...f, titleEn: e.target.value }))} placeholder="Event title in English" className="field-input w-full" />
                    </div>
                    <div>
                      <label className="field-label">Description (EN)</label>
                      <textarea value={form.descriptionEn || ""} onChange={(e) => setForm(f => ({ ...f, descriptionEn: e.target.value }))} rows={3} placeholder="Describe the event..." className="field-input w-full resize-none" />
                    </div>
                  </div>
                )}
                {langTab === "es" && (
                  <div className="space-y-3">
                    <div>
                      <label className="field-label">Título (ES)</label>
                      <input value={form.titleEs || ""} onChange={(e) => setForm(f => ({ ...f, titleEs: e.target.value }))} placeholder="Título del evento en español" className="field-input w-full" />
                    </div>
                    <div>
                      <label className="field-label">Descripción (ES)</label>
                      <textarea value={form.descriptionEs || ""} onChange={(e) => setForm(f => ({ ...f, descriptionEs: e.target.value }))} rows={3} placeholder="Describe el evento..." className="field-input w-full resize-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* Type */}
              <div>
                <label className="field-label">Tipo de Evento</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["local", "external"] as EventType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className={cn(
                        "p-3 rounded-xl border text-sm font-bold flex items-center gap-2 transition-all",
                        form.type === t ? "border-primary bg-primary/10 text-primary" : "border-white/10 bg-secondary text-muted-foreground hover:border-white/20"
                      )}
                    >
                      {t === "local" ? <Building2 size={16} /> : <Globe size={16} />}
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="field-label">Categoria</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(CATEGORY_LABELS) as EventCategory[]).filter(c => c !== "wedding" && c !== "corporate").map((cat) => {
                    const Icon = CATEGORY_ICONS[cat];
                    return (
                      <button
                        key={cat}
                        onClick={() => setForm(f => ({ ...f, category: cat }))}
                        className={cn(
                          "p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all",
                          form.category === cat ? "border-primary bg-primary/10 text-primary" : "border-white/10 bg-secondary text-muted-foreground hover:border-white/20"
                        )}
                      >
                        <Icon size={16} />
                        {CATEGORY_LABELS[cat]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status + Featured */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Status</label>
                  <select value={form.status || "draft"} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as EventStatus }))} className="field-input w-full">
                    <option value="draft">Rascunho</option>
                    <option value="published">Publicado</option>
                    <option value="finished">Encerrado</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Destaque</label>
                  <button
                    onClick={() => setForm(f => ({ ...f, featured: !f.featured }))}
                    className={cn("w-full p-2.5 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all", form.featured ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400" : "border-white/10 bg-secondary text-muted-foreground")}
                  >
                    <Star size={16} className={form.featured ? "fill-yellow-400" : ""} />
                    {form.featured ? "Destaque" : "Normal"}
                  </button>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Data de Início *</label>
                  <input type="date" value={form.startDate || ""} onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))} className="field-input w-full" />
                </div>
                <div>
                  <label className="field-label">Data de Fim (opcional)</label>
                  <input type="date" value={form.endDate || ""} onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value || undefined }))} className="field-input w-full" />
                </div>
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Horário de Início</label>
                  <input type="time" value={form.startTime || ""} onChange={(e) => setForm(f => ({ ...f, startTime: e.target.value || undefined }))} className="field-input w-full" />
                </div>
                <div>
                  <label className="field-label">Horário de Fim</label>
                  <input type="time" value={form.endTime || ""} onChange={(e) => setForm(f => ({ ...f, endTime: e.target.value || undefined }))} className="field-input w-full" />
                </div>
              </div>

              {/* Location */}
              <div className="space-y-3">
                <div>
                  <label className="field-label">Local</label>
                  <input value={form.location || ""} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Ex: Palco Central, Bar da Praia..." className="field-input w-full" />
                </div>
                <div>
                  <label className="field-label">Link do Local (Maps)</label>
                  <input value={form.locationUrl || ""} onChange={(e) => setForm(f => ({ ...f, locationUrl: e.target.value }))} placeholder="https://maps.google.com/..." className="field-input w-full" />
                </div>
              </div>

              {/* Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Preço (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, price: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    placeholder="0 = gratuito"
                    className="field-input w-full"
                  />
                </div>
                <div>
                  <label className="field-label">Descrição do Preço</label>
                  <input value={form.priceDescription || ""} onChange={(e) => setForm(f => ({ ...f, priceDescription: e.target.value }))} placeholder="Ex: R$ 80/pessoa" className="field-input w-full" />
                </div>
              </div>

              {/* External URL + Capacity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Link Externo (ingressos)</label>
                  <input value={form.externalUrl || ""} onChange={(e) => setForm(f => ({ ...f, externalUrl: e.target.value }))} placeholder="https://..." className="field-input w-full" />
                </div>
                <div>
                  <label className="field-label">Capacidade Máxima</label>
                  <input
                    type="number"
                    min="1"
                    value={form.maxCapacity ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, maxCapacity: e.target.value ? parseInt(e.target.value) : undefined }))}
                    placeholder="Ilimitado"
                    className="field-input w-full"
                  />
                </div>
              </div>

            </div>

            {/* Modal footer */}
            <div className="p-6 border-t border-white/5 sticky bottom-0 bg-card flex gap-3">
              <button onClick={closeModal} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold hover:bg-secondary transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={savingForm}
                className="flex-1 py-3 bg-primary text-black font-black uppercase text-xs tracking-widest rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingForm ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {editingEvent ? "Salvar" : "Criar Evento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-white/5 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={24} className="text-red-400" />
            </div>
            <div className="text-center">
              <h3 className="font-black uppercase text-lg">Cancelar Evento?</h3>
              <p className="text-sm text-muted-foreground mt-1">O evento <strong>&ldquo;{confirmDelete.title}&rdquo;</strong> será marcado como cancelado.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 border border-white/10 rounded-xl text-sm font-bold hover:bg-secondary transition-colors">
                Voltar
              </button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-2.5 bg-red-500 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-red-600 transition-colors">
                Cancelar Evento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// EVENT CARD COMPONENT
// ==========================================

function EventCard({
  event,
  onEdit,
  onTogglePublish,
  onDelete,
}: {
  event: Event;
  onEdit: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
}) {
  const CategoryIcon = CATEGORY_ICONS[event.category];

  return (
    <div className="bg-card border border-white/5 rounded-2xl overflow-hidden flex hover:border-white/10 transition-all group">
      {/* Image */}
      <div className="w-32 h-auto shrink-0 bg-secondary relative overflow-hidden">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CategoryIcon size={32} className="text-muted-foreground opacity-30" />
          </div>
        )}
        {event.featured && (
          <div className="absolute top-2 left-2 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center shadow-md">
            <Star size={10} className="fill-white text-white" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider", STATUS_COLORS[event.status])}>
                {STATUS_LABELS[event.status]}
              </span>
              <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider", TYPE_COLORS[event.type])}>
                {TYPE_LABELS[event.type]}
              </span>
            </div>
            <h3 className="font-black text-base truncate">{event.title}</h3>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar size={11} /> {formatDatePT(event.startDate)}
            {event.endDate && event.endDate !== event.startDate && ` → ${formatDatePT(event.endDate)}`}
          </span>
          {event.startTime && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock size={11} /> {event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}
            </span>
          )}
          {event.location && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 truncate max-w-48">
              <MapPin size={11} /> {event.location}
            </span>
          )}
          {event.priceDescription && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Tag size={11} /> {event.priceDescription}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 p-3 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onTogglePublish}
          title={event.status === "published" ? "Despublicar" : "Publicar"}
          className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-emerald-400"
        >
          {event.status === "published" ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button onClick={onEdit} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-primary">
          <Edit2 size={16} />
        </button>
        {event.externalUrl && (
          <a href={event.externalUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-blue-400">
            <ExternalLink size={16} />
          </a>
        )}
        <button onClick={onDelete} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-red-400">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
