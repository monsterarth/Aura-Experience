"use client";

// Dados da recepção: snapshot via /api/admin/reception/dashboard + realtime
// (tarefas de governança, pedidos de concierge, stays e liberação de cabanas).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase, safeRemoveChannel } from "@/lib/supabase";
import { HousekeepingService } from "@/services/housekeeping-service";
import { ConciergeService } from "@/services/concierge-service";
import { fbService } from "@/services/fb-service";
import { useProperty } from "@/context/PropertyContext";
import type { HousekeepingTask, ConciergeRequest, FBOrder, StructureBooking, Structure, Cabin } from "@/types/aura";
import { formatTimeAgo, type AlertItem, type StructureAgendaItem } from "./reception-utils";

export type BreakfastMode = "buffet" | "delivery";
type TodayArrival = { cabinId: string; cabinName: string; guestName: string };

export interface ReceptionStats {
  checkinsDone: number; checkinsTotal: number; checkoutsDone: number; checkoutsTotal: number;
  occupiedCabins: number; totalCabins: number; walkIns: number;
}

const EMPTY_STATS: ReceptionStats = { checkinsDone: 0, checkinsTotal: 0, checkoutsDone: 0, checkoutsTotal: 0, occupiedCabins: 0, totalCabins: 0, walkIns: 0 };

export function useReceptionLive() {
  const { currentProperty: property, setProperty } = useProperty();
  const propertyId = property?.id;

  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ReceptionStats>(EMPTY_STATS);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [hkTasks, setHkTasks] = useState<HousekeepingTask[]>([]);
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [structureBookings, setStructureBookings] = useState<(StructureBooking & { bookingCabinName?: string | null })[]>([]);
  const [detractors, setDetractors] = useState<any[]>([]);
  const [msgFailures, setMsgFailures] = useState<any[]>([]);
  const [petExceptions, setPetExceptions] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ConciergeRequest[]>([]);
  const [breakfastOrders, setBreakfastOrders] = useState<(FBOrder & { cabinName?: string })[]>([]);
  const [breakfastMode, setBreakfastMode] = useState<BreakfastMode>("delivery");
  const [savingMode, setSavingMode] = useState(false);
  // Espelho do state para o callback realtime (sem closure velha).
  const todayArrivalsRef = useRef<TodayArrival[]>([]);

  // Relógio (minuto a minuto)
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // Modalidade do café persistida na propriedade
  useEffect(() => {
    const saved = property?.settings?.fbSettings?.breakfast?.dailyMode as BreakfastMode | undefined;
    if (saved) setBreakfastMode(saved);
  }, [property?.id, property?.settings?.fbSettings?.breakfast?.dailyMode]);

  const load = useCallback(async (silent = false) => {
    if (!propertyId) return;
    if (!silent) { setLoading(true); setError(null); }
    try {
      const res = await fetch(`/api/admin/reception/dashboard?${new URLSearchParams({ propertyId })}`);
      if (!res.ok) throw new Error("fetch-error");
      const data = await res.json();
      setStats(data.stats ?? EMPTY_STATS);
      setCabins(data.cabins ?? []);
      const map: Record<string, string> = {};
      (data.staff ?? []).forEach((s: any) => { map[s.id] = s.fullName; });
      setStaffMap(map);
      setStructures(data.structures ?? []);
      setStructureBookings(data.structureBookings ?? []);
      setDetractors(data.detractors ?? []);
      setMsgFailures(data.msgFailures ?? []);
      setPetExceptions(data.petExceptions ?? []);
      setBreakfastOrders(data.breakfastOrders ?? []);
      todayArrivalsRef.current = data.todayArrivals ?? [];
    } catch {
      if (silent) toast.error("Erro ao atualizar dados da recepção.");
      else setError("Não foi possível carregar a recepção.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [propertyId]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!propertyId) return;
    void load();

    const unsubHK = HousekeepingService.listenToActiveTasks(propertyId, setHkTasks);
    const unsubConcierge = ConciergeService.listenToPendingRequests(propertyId, setPendingRequests);

    let staysSubscribed = false;
    const staysChannel = supabase.channel(`reception_stays_${propertyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stays", filter: `propertyId=eq.${propertyId}` }, () => { void loadRef.current(true); })
      .subscribe((status: string) => { if (status === "SUBSCRIBED") staysSubscribed = true; });

    let cabinsSubscribed = false;
    const cabinsChannel = supabase.channel(`reception_cabins_${propertyId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cabins", filter: `propertyId=eq.${propertyId}` },
        (payload: any) => {
          const updated = payload.new as Cabin;
          if (updated.status !== "available") return;
          const arrival = todayArrivalsRef.current.find(a => a.cabinId === updated.id);
          if (!arrival) return;
          toast.success(`${arrival.cabinName} liberada pela governanta 🛎️`, {
            description: `${arrival.guestName} pode fazer check-in agora.`,
            duration: 12000,
          });
        })
      .subscribe((status: string) => { if (status === "SUBSCRIBED") cabinsSubscribed = true; });

    return () => {
      unsubHK();
      unsubConcierge();
      safeRemoveChannel(staysChannel, staysSubscribed);
      safeRemoveChannel(cabinsChannel, cabinsSubscribed);
    };
  }, [propertyId, load]);

  const setBreakfastModeRemote = useCallback(async (mode: BreakfastMode) => {
    if (!property?.id || mode === breakfastMode) return;
    const previous = breakfastMode;
    setBreakfastMode(mode);
    setSavingMode(true);
    try {
      // A Property fresca volta da rota: sem alimentar o contexto, o efeito de
      // sincronização reverteria o switch para o valor velho no próximo render.
      const fresh = await fbService.setDailyBreakfastMode(property.id, mode);
      if (fresh) setProperty(fresh);
      toast.success(mode === "delivery" ? "Café de hoje: Cesta Delivery." : "Café de hoje: Buffet Salão.");
    } catch (e) {
      setBreakfastMode(previous);
      toast.error((e as Error).message || "Erro ao salvar modalidade do café.");
    } finally {
      setSavingMode(false);
    }
  }, [property, breakfastMode, setProperty]);

  // ── Derivados ──
  const derived = useMemo(() => {
    const activeTasks = hkTasks
      .filter(t => ["pending", "in_progress", "waiting_conference"].includes(t.status))
      .map(t => ({
        task: t,
        location: t.cabinId ? (cabins.find(c => c.id === t.cabinId)?.name ?? "—") : (structures.find(s => s.id === t.structureId)?.name ?? "—"),
        assignees: (t.assignedTo ?? []).map(id => staffMap[id] ?? "—").join(", ") || "—",
      }));

    const recentlyReleasedCabins = hkTasks
      .filter(t => t.status === "completed" && t.cabinId && t.finishedAt && Date.now() - new Date(t.finishedAt as string).getTime() < 4 * 60 * 60 * 1000)
      .map(t => cabins.find(c => c.id === t.cabinId)?.name ?? t.cabinId!);

    const nowHHMM = currentTime.toTimeString().slice(0, 5);
    const nowMins = currentTime.getHours() * 60 + currentTime.getMinutes();
    const structureAgenda: StructureAgendaItem[] = structureBookings.map(b => {
      const structure = structures.find(s => s.id === b.structureId);
      const guestLabel = b.bookingCabinName || b.guestName || "—";
      let status: StructureAgendaItem["status"];
      if (b.status === "completed") status = "freed";
      else if (b.startTime <= nowHHMM && nowHHMM < b.endTime) status = "in_use";
      else status = "upcoming";
      const [eh, em] = b.endTime.split(":").map(Number);
      const freeMins = Math.max(0, nowMins - (eh * 60 + em));
      return {
        id: b.id, name: structure?.name ?? "—", status, by: guestLabel, until: b.endTime, at: b.startTime,
        freedAgo: freeMins < 60 ? `há ${freeMins} min` : `há ${Math.floor(freeMins / 60)} h`,
        needCleaning: status === "freed" && !!structure?.requiresTurnover,
      };
    });

    const alertItems: AlertItem[] = [
      // Exceção de pet vem PRIMEIRO: é a única da lista que tem prazo — depois da
      // chegada do hóspede não há mais o que decidir, só constrangimento no balcão.
      ...petExceptions.map((p: any) => {
        const marcas: string[] = [];
        if (p.inBlackout) marcas.push("período de alta");
        if (p.overlapping?.length) marcas.push(`já há ${p.overlapping.length} exceção aprovada nestas datas`);
        const chegada = new Date(p.checkIn);
        const dias = Math.ceil((chegada.getTime() - currentTime.getTime()) / 86400000);
        return {
          id: `pet-${p.stayId}`, type: "pet_exception" as const,
          title: "Pet fora da política — decisão pendente",
          desc: `${p.guestName}${p.cabinName ? ` · ${p.cabinName}` : ""} — ${(p.reasons ?? []).join(" · ") || "fora da Política Pet"}.${marcas.length ? ` (${marcas.join("; ")})` : ""}`,
          time: dias <= 0 ? "chega hoje" : dias === 1 ? "chega amanhã" : `chega em ${dias} dias`,
          petException: p,
        };
      }),
      ...detractors.map((r, i) => {
        const parts: string[] = [];
        if (r.metrics?.npsScore != null) parts.push(`NPS ${r.metrics.npsScore}/10`);
        if (r.metrics?.averageRating != null) parts.push(`${r.metrics.averageRating}/5 estrelas`);
        return {
          id: `rev-${r.id ?? i}`, type: "review" as const,
          title: "Avaliação negativa (detrator)",
          desc: `${r.cabinName} — ${parts.length ? parts.join(" · ") : "sem nota registrada"}.`,
          time: formatTimeAgo(r.createdAt),
        };
      }),
      // Nem toda falha é do robô: disparo em massa e conversa manual caem na mesma tabela.
      ...msgFailures.map((m, i) => {
        const origin = m.isAutomated ? `automação: ${m.triggerEvent || "gatilho"}` : m.scheduledFor ? "disparo em massa" : "mensagem manual";
        return {
          id: `msg-${m.id ?? i}`, type: "message_error" as const,
          title: m.isAutomated ? "Falha: mensagem automática" : "Falha no envio de WhatsApp",
          desc: `Não foi possível enviar (${origin}) para ${m.to || "hóspede"}.`,
          time: formatTimeAgo(m.createdAt),
        };
      }),
    ].slice(0, 5);

    return { activeTasks, recentlyReleasedCabins, structureAgenda, alertItems, petExceptions };
  }, [hkTasks, cabins, structures, staffMap, structureBookings, detractors, msgFailures, petExceptions, currentTime]);

  return {
    property, loading, error, reload: () => load(false), currentTime,
    stats, pendingRequests, breakfastOrders, breakfastMode, savingMode, setBreakfastMode: setBreakfastModeRemote,
    ...derived,
  };
}
