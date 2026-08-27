"use client";

// Estado, carregamento, realtime e ações do módulo de Eventos (lógica portada do page.tsx).
import { useCallback, useEffect, useMemo, useState } from "react";
import { startOfMonth } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { EventService } from "@/services/event-service";
import type { Event, EventStatus, EventType } from "@/types/aura";
import { supabase, safeRemoveChannel } from "@/lib/supabase";
import { useConfirm } from "@/components/aura";
import { buildCalendarGrid, emptyForm, groupEventsByDate } from "./eventos-utils";

export type ViewMode = "list" | "calendar";

export function useEventos() {
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();
  const confirm = useConfirm();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [filterType, setFilterType] = useState<"" | EventType>("");
  const [filterStatus, setFilterStatus] = useState<"" | EventStatus>("");
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [form, setForm] = useState<Partial<Event>>(emptyForm());
  const [savingForm, setSavingForm] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    if (!property?.id) return;
    try {
      const data = await EventService.getEvents(property.id);
      setEvents(data);
    } catch {
      toast.error("Erro ao carregar eventos");
    } finally {
      setLoading(false);
    }
  }, [property?.id]);

  useEffect(() => { setLoading(true); void loadEvents(); }, [loadEvents]);

  // Realtime — uma assinatura por propriedade.
  useEffect(() => {
    if (!property?.id) return;
    let subscribed = false;
    const channel = supabase
      .channel("admin-events-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "events", filter: `propertyId=eq.${property.id}` }, () => loadEvents())
      .subscribe((status: string) => { if (status === "SUBSCRIBED") subscribed = true; });
    return () => { safeRemoveChannel(channel, subscribed); };
  }, [property?.id, loadEvents]);

  const filteredEvents = useMemo(() => events.filter(e => {
    if (filterType && e.type !== filterType) return false;
    if (filterStatus && e.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.title.toLowerCase().includes(q) && !e.location?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [events, filterType, filterStatus, search]);

  const calendarGrid = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth]);
  const eventsByDate = useMemo(() => groupEventsByDate(events, currentMonth), [events, currentMonth]);
  const selectedDayEvents = useMemo(() => (selectedDay ? eventsByDate[selectedDay] || [] : []), [selectedDay, eventsByDate]);

  const openCreate = (startDate?: string) => {
    setEditingEvent(null);
    setForm({ ...emptyForm(), ...(startDate ? { startDate } : {}) });
    setShowModal(true);
  };
  const openEdit = (event: Event) => { setEditingEvent(event); setForm({ ...event }); setShowModal(true); };
  const closeModal = () => { setShowModal(false); };

  const handleSave = async () => {
    if (!property?.id || !userData?.id) return;
    if (!form.title?.trim()) { toast.error("O título é obrigatório"); return; }
    if (!form.startDate) { toast.error("A data de início é obrigatória"); return; }
    // `endDate` é coluna `date` no banco e o formulário nasce com "" — string
    // vazia não é data válida para o Postgres. Vira null, que é a forma de
    // dizer "evento de um dia" que o resto do código já entende.
    // `null` explícito (e não omissão) para que limpar a data de fim no
    // formulário realmente limpe no banco.
    const payload = { ...form, endDate: form.endDate || null } as Partial<Event>;
    setSavingForm(true);
    try {
      if (editingEvent) {
        await EventService.updateEvent(property.id, editingEvent.id, payload, userData.id, userData.fullName);
        toast.success("Evento atualizado!");
      } else {
        await EventService.createEvent(property.id, payload as Omit<Event, "id" | "createdAt" | "updatedAt">, userData.id, userData.fullName);
        toast.success("Evento criado!");
      }
      setShowModal(false);
      void loadEvents();
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
      void loadEvents();
    } catch {
      toast.error("Erro ao alterar status");
    }
  };

  const handleDelete = async (event: Event) => {
    if (!property?.id || !userData?.id) return;
    const ok = await confirm({ title: "Cancelar evento?", description: `O evento “${event.title}” será marcado como cancelado.`, confirmLabel: "Cancelar evento", cancelLabel: "Voltar", tone: "danger" });
    if (!ok) return;
    try {
      await EventService.deleteEvent(property.id, event.id, userData.id, userData.fullName);
      toast.success("Evento cancelado");
      void loadEvents();
    } catch {
      toast.error("Erro ao cancelar evento");
    }
  };

  const clearFilters = () => { setFilterType(""); setFilterStatus(""); setSearch(""); };

  return {
    property, events, loading, currentMonth, setCurrentMonth,
    filterType, setFilterType, filterStatus, setFilterStatus, search, setSearch, clearFilters, filteredEvents,
    calendarGrid, eventsByDate, selectedDay, setSelectedDay, selectedDayEvents,
    showModal, editingEvent, form, setForm, savingForm, openCreate, openEdit, closeModal, handleSave,
    handlePublishToggle, handleDelete,
  };
}
