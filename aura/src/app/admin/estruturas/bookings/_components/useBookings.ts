"use client";

// Agenda de estruturas — dados do dia, realtime e ações (lógica portada do page.tsx).
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { StructureService } from "@/services/structure-service";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import type { Structure, StructureBooking, TimeSlot } from "@/types/aura";
import { supabase, safeRemoveChannel } from "@/lib/supabase";
import type { StayLite } from "./bookings-utils";

export type ModalState = { structureId: string; unitId?: string; isFreeTime?: boolean; slot?: TimeSlot };
export type BookingType = "booking" | "maintenance_block";
export type CancelTarget = { booking: StructureBooking; structureId: string; requiresTurnover: boolean };
export type SlotTarget = { booking: StructureBooking; structure: Structure };

export function useBookings() {
  const { currentProperty } = useProperty();
  const { userData } = useAuth();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [structures, setStructures] = useState<Structure[]>([]);
  const [bookings, setBookings] = useState<StructureBooking[]>([]);
  const [activeStays, setActiveStays] = useState<StayLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal de criação
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<ModalState | null>(null);
  const [bookingType, setBookingType] = useState<BookingType>("booking");
  const [guestStayId, setGuestStayId] = useState("");
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [freeTimeStart, setFreeTimeStart] = useState("");
  const [freeTimeEnd, setFreeTimeEnd] = useState("");
  const [creating, setCreating] = useState(false);

  // Cancelamento + ações de um horário ocupado
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [slotTarget, setSlotTarget] = useState<SlotTarget | null>(null);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentProperty) return;
    setError(null);
    try {
      const dateStr = format(currentDate, "yyyy-MM-dd");
      // Rota server-side (supabaseAdmin, sem navigator.locks) — evita o congelamento no F5.
      const params = new URLSearchParams({ propertyId: currentProperty.id, date: dateStr });
      const res = await fetch(`/api/admin/structures/bookings?${params}`);
      if (!res.ok) throw new Error("fetch-error");
      const { structures: allStructures, bookings: allBookings, activeStays: allActiveStays } = await res.json();
      const validStays = (allActiveStays ?? []).filter((s: StayLite) => {
        const checkInDate = s.checkIn ? new Date(s.checkIn) : new Date();
        const checkOutDate = s.checkOut ? new Date(s.checkOut) : new Date();
        checkInDate.setHours(0, 0, 0, 0);
        checkOutDate.setHours(23, 59, 59, 999);
        return currentDate >= checkInDate && currentDate <= checkOutDate;
      });
      setStructures(allStructures ?? []);
      setBookings(allBookings ?? []);
      setActiveStays(validStays);
    } catch {
      setError("Não foi possível carregar a agenda.");
      toast.error("Erro ao carregar agenda.");
    } finally {
      setLoading(false);
    }
  }, [currentProperty, currentDate]);

  useEffect(() => { if (currentProperty) { setLoading(true); void fetchData(); } }, [currentProperty, fetchData]);

  useEffect(() => {
    if (!currentProperty) return;
    let subscribed = false;
    const channel = supabase.channel(`bookings_${currentProperty.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "structure_bookings", filter: `propertyId=eq.${currentProperty.id}` }, () => fetchData())
      .subscribe((status: string) => { if (status === "SUBSCRIBED") subscribed = true; });
    return () => { safeRemoveChannel(channel, subscribed); };
  }, [currentProperty, fetchData]);

  const handleStatusChange = async (booking: StructureBooking, newStatus: StructureBooking["status"], structureRequiresTurnover: boolean, cancellationReason?: string) => {
    if (!currentProperty || !userData) return;
    setBusyBookingId(booking.id);
    try {
      await StructureService.updateBookingStatus(currentProperty.id, booking.id, newStatus, userData.id, userData.fullName, structureRequiresTurnover, booking.structureId, cancellationReason);
      toast.success(`Reserva ${newStatus === "approved" ? "aprovada" : newStatus === "rejected" ? "rejeitada" : newStatus === "completed" ? "finalizada" : "cancelada"}.`);
      setSlotTarget(null);
      void fetchData();
    } catch {
      toast.error("Erro ao atualizar reserva.");
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleToggleRelease = async (structure: Structure, release: boolean) => {
    if (!currentProperty || !userData) return;
    const dateStr = format(currentDate, "yyyy-MM-dd");
    try {
      await StructureService.setDailyRelease(currentProperty.id, structure.id, release ? dateStr : null, userData.id, userData.fullName, structure.name);
      // Atualização otimista — o realtime de structures não está assinado nesta página
      setStructures(prev => prev.map(s => s.id === structure.id ? { ...s, releasedForDate: release ? dateStr : undefined } : s));
      toast.success(release ? `${structure.name} liberada para uso.` : `${structure.name} bloqueada.`);
    } catch {
      toast.error("Erro ao atualizar liberação.");
    }
  };

  const openCancel = (booking: StructureBooking, structureId: string, requiresTurnover: boolean) => {
    setSlotTarget(null);
    setCancelTarget({ booking, structureId, requiresTurnover });
    setCancelReason("");
  };

  const confirmCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) { toast.error("Informe o motivo do cancelamento."); return; }
    setCancelling(true);
    try {
      await handleStatusChange(cancelTarget.booking, "cancelled", cancelTarget.requiresTurnover, cancelReason.trim());
      setCancelTarget(null);
      setCancelReason("");
    } finally {
      setCancelling(false);
    }
  };

  const openCreate = (structureId: string, unitId?: string, isFreeTime = false, slot?: TimeSlot) => {
    setSelectedConfig({ structureId, unitId, isFreeTime, slot });
    setBookingType("booking");
    setGuestStayId("");
    setMaintenanceNotes("");
    setFreeTimeStart("");
    setFreeTimeEnd("");
    setCreateOpen(true);
  };

  const handleCreateBooking = async () => {
    if (!currentProperty || !userData || !selectedConfig) return;
    let startTime = selectedConfig.slot?.startTime;
    let endTime = selectedConfig.slot?.endTime;
    if (bookingType === "booking" && !guestStayId) { toast.error("Selecione o hóspede titular válido da lista."); return; }
    if (bookingType === "maintenance_block" && !maintenanceNotes) { toast.error("Preencha as observações de manutenção."); return; }
    if (selectedConfig.isFreeTime) {
      if (!freeTimeStart || !freeTimeEnd) { toast.error("Preencha os horários."); return; }
      const hasOverlap = StructureService.checkOverlap(freeTimeStart, freeTimeEnd, bookings.filter(b => b.structureId === selectedConfig.structureId), selectedConfig.unitId);
      if (hasOverlap) { toast.error("Este horário coincide com outra reserva ou bloqueio."); return; }
      startTime = freeTimeStart;
      endTime = freeTimeEnd;
    }
    setCreating(true);
    try {
      await StructureService.createBooking(currentProperty.id, {
        structureId: selectedConfig.structureId,
        propertyId: currentProperty.id,
        unitId: selectedConfig.unitId,
        type: bookingType,
        date: format(currentDate, "yyyy-MM-dd"),
        startTime: startTime!,
        endTime: endTime!,
        status: "approved",
        source: "admin",
        stayId: bookingType === "booking" && guestStayId ? guestStayId : undefined,
        guestName: bookingType === "booking" ? (activeStays.find(s => s.id === guestStayId)?.guestName || "Hóspede") : "Manutenção",
        notes: bookingType === "maintenance_block" ? maintenanceNotes : "Reserva Manual Adm",
      }, userData.id, userData.fullName);
      toast.success("Horário agendado com sucesso!");
      setCreateOpen(false);
      void fetchData();
    } catch (error) {
      console.error("DEBUG Erro onSubmit booking:", error);
      toast.error("Erro ao criar agendamento.");
    } finally {
      setCreating(false);
    }
  };

  return {
    currentProperty, currentDate, setCurrentDate, structures, bookings, activeStays, loading, error, reload: fetchData,
    createOpen, setCreateOpen, selectedConfig, bookingType, setBookingType, guestStayId, setGuestStayId, maintenanceNotes, setMaintenanceNotes,
    freeTimeStart, setFreeTimeStart, freeTimeEnd, setFreeTimeEnd, creating, openCreate, handleCreateBooking,
    cancelTarget, setCancelTarget, cancelReason, setCancelReason, cancelling, openCancel, confirmCancel,
    slotTarget, setSlotTarget, busyBookingId, handleStatusChange, handleToggleRelease,
  };
}
