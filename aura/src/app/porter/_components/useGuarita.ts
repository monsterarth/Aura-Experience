"use client";

// Estado do app da guarita: carrega o painel numa chamada e expõe as ações.
// Toda escrita passa por /api/field/guarita (postFieldAction) — o client do
// browser pendura no lock frio nos apps de campo.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { postFieldAction } from "@/lib/field-api";
import type { ParkingRate, ParkingShift, ParkingShiftSummary, PlateLookup, VehicleMovement } from "@/types/aura";

export interface GuaritaDashboard {
  date: string;
  rate: ParkingRate | null;
  ratePresets: number[];
  shift: ParkingShift | null;
  summary: ParkingShiftSummary | null;
  patio: VehicleMovement[];
  arrivals: { id: string; guestName: string; cabinName: string | null; expectedArrivalTime: string | null; vehiclePlate: string | null }[];
  departures: { id: string; guestName: string; cabinName: string | null }[];
  /** Quem está em casa — alimenta o seletor de cabana/titular. */
  housed: { id: string; guestName: string; cabinName: string | null; status: string; hasPlate: boolean }[];
  events: { id: string; title: string; startDate: string; endDate: string }[];
}

const EMPTY: GuaritaDashboard = {
  date: "", rate: null, ratePresets: [30, 50, 80, 100, 150], shift: null, summary: null,
  patio: [], arrivals: [], departures: [], housed: [], events: [],
};

export function useGuarita() {
  const { userData } = useAuth();
  const { currentProperty } = useProperty();
  const propertyId = currentProperty?.id ?? userData?.propertyId ?? null;

  const [data, setData] = useState<GuaritaDashboard>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) return;
    try {
      const res = await fetch(`/api/field/guarita?propertyId=${encodeURIComponent(propertyId)}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* silencioso: a tela fica com o último estado bom em vez de piscar erro */
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { void load(); }, [load]);

  // A guarita fica com a tela aberta o turno inteiro — sem isto o painel
  // envelhece e o pátio mente.
  useEffect(() => {
    const t = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const r = await postFieldAction("/api/field/guarita", { propertyId, ...payload });
    if (!r.ok) throw new Error(r.error || "Não consegui registrar. Tente de novo.");
    return r.data;
  }, [propertyId]);

  const lookup = useCallback(async (plate: string): Promise<PlateLookup | null> => {
    try {
      return await post({ action: "lookup", plate }) as PlateLookup;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na consulta.");
      return null;
    }
  }, [post]);

  const registerEntry = useCallback(async (input: Record<string, unknown>) => {
    setBusy(true);
    try {
      await post({ action: "entry", ...input });
      toast.success("Entrada registrada.");
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar.");
      return false;
    } finally { setBusy(false); }
  }, [post, load]);

  const registerExit = useCallback(async (movementId: string) => {
    setBusy(true);
    try {
      await post({ action: "exit", movementId });
      toast.success("Saída registrada.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar a saída.");
    } finally { setBusy(false); }
  }, [post, load]);

  const setRate = useCallback(async (amount: number, closed = false) => {
    setBusy(true);
    try {
      await post({ action: "set_rate", amount, closed, date: data.date || undefined });
      toast.success(closed ? "Marcado como fechado hoje." : "Tarifa do dia definida.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao definir a tarifa.");
    } finally { setBusy(false); }
  }, [post, load, data.date]);

  const closeShift = useCallback(async (notes?: string) => {
    setBusy(true);
    try {
      await post({ action: "close_shift", notes });
      toast.success("Turno fechado e enviado à recepção.");
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao fechar o turno.");
      return false;
    } finally { setBusy(false); }
  }, [post, load]);

  return {
    propertyId, userData, data, loading, busy, reload: load,
    lookup, registerEntry, registerExit, setRate, closeShift,
  };
}

export type GuaritaState = ReturnType<typeof useGuarita>;
