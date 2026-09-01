"use client";

// src/app/admin/ponto/_components/usePonto.ts
//
// Estado da página de Ponto: período, pessoa e as batidas já derivadas em dias.
//
// O período é resolvido em instantes ABSOLUTOS aqui, no navegador, e só então
// enviado ao servidor. O motivo é chato mas decisivo: a Vercel roda em UTC e a
// pousada não — se o servidor decidisse onde o mês começa, a batida das 22h do
// dia 31 cairia no mês seguinte.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { buildSessions, groupByDay } from "@/lib/timeclock";
import type { TimeClockEvent, TimeSource, UserRole } from "@/types/aura";

export interface TrackedStaff {
  id: string;
  fullName: string;
  role: UserRole;
  timeSource: TimeSource;
}

/** Primeiro instante do mês da âncora e o do mês seguinte (fim exclusivo). */
function monthRange(anchor: Date): { from: Date; to: Date } {
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1, 0, 0, 0, 0);
  return { from, to };
}

export function usePonto(selfId: string | undefined, propertyId?: string | null) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [staffId, setStaffId] = useState<string | undefined>(undefined);
  const [events, setEvents] = useState<TimeClockEvent[]>([]);
  const [staff, setStaff] = useState<TrackedStaff[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => monthRange(anchor), [anchor]);
  const viewingId = staffId ?? selfId;
  const viewingSelf = !staffId || staffId === selfId;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      if (staffId) params.set("staffId", staffId);
      // O super_admin não tem propriedade fixa — sem isto, a lista de quem
      // registra ponto viria vazia para justamente quem administra.
      if (propertyId) params.set("propertyId", propertyId);
      const res = await fetch(`/api/admin/timeclock?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar o ponto.");
      setEvents(data.events ?? []);
      setStaff(data.staff ?? []);
      setCanManage(!!data.canManage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o ponto.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, staffId, propertyId]);

  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => groupByDay(buildSessions(events)), [events]);

  const totals = useMemo(() => {
    const minutes = days.reduce((sum, d) => sum + d.minutes, 0);
    const worked = days.filter(d => d.minutes > 0).length;
    const pending = days.filter(d => d.hasPending).length;
    return {
      minutes,
      days: worked,
      average: worked > 0 ? Math.round(minutes / worked) : 0,
      pending,
    };
  }, [days]);

  /** Toda mutação recarrega o período: o pareamento das jornadas depende dos
   *  vizinhos, então mexer numa batida pode mudar o dia inteiro. */
  const mutate = useCallback(async (body: Record<string, unknown>, successMessage: string) => {
    const res = await fetch("/api/admin/timeclock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, ...body }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Não foi possível salvar."); return false; }
    toast.success(successMessage);
    await load();
    return true;
  }, [load, propertyId]);

  return {
    anchor, setAnchor,
    range,
    staffId, setStaffId, viewingId, viewingSelf,
    staff, canManage,
    events, days, totals,
    loading, error, reload: load,
    addManual: (payload: { ts: string; kind: "in" | "out"; note?: string }) =>
      mutate({ action: "manual", staffId: viewingId, ...payload }, "Batida lançada."),
    adjust: (payload: { eventId: string; ts: string; note?: string }) =>
      mutate({ action: "adjust", ...payload }, "Horário corrigido."),
    remove: (payload: { eventId: string; reason?: string }) =>
      mutate({ action: "delete", ...payload }, "Batida excluída."),
  };
}

export type PontoState = ReturnType<typeof usePonto>;
