"use client";

// Estado do Café Salão (sessão do dia, presença, mesas, visitantes, pedidos) + realtime.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { BreakfastSalonService } from "@/services/breakfast-salon-service";
import { supabase, safeRemoveChannel } from "@/lib/supabase";
import { useConfirm, usePrompt } from "@/components/aura";
import type { BreakfastSession, BreakfastAttendance, BreakfastTable, BreakfastVisitor, FBOrder } from "@/types/aura";

export interface TableWithGuests extends BreakfastTable {
  attendances: BreakfastAttendance[];
  visitors: BreakfastVisitor[];
}

export function useCafeSalao() {
  const { userData } = useAuth();
  const { currentProperty } = useProperty();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const propertyId = currentProperty?.id ?? "";
  const actorName = userData?.fullName ?? "Garçom";
  const actorId = userData?.id ?? "waiter";

  const [session, setSession] = useState<BreakfastSession | null>(null);
  const [attendances, setAttendances] = useState<BreakfastAttendance[]>([]);
  const [tables, setTables] = useState<BreakfastTable[]>([]);
  const [visitors, setVisitors] = useState<BreakfastVisitor[]>([]);
  const [orders, setOrders] = useState<FBOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    try {
      const sess = await BreakfastSalonService.getTodaySession(propertyId);
      setSession(sess);
      if (sess) {
        const [att, tbls, vis, ords] = await Promise.all([
          BreakfastSalonService.getAttendanceList(propertyId, sess.id),
          BreakfastSalonService.getTablesForSession(sess.id),
          BreakfastSalonService.getVisitorsForSession(sess.id),
          BreakfastSalonService.getOrdersBySession(propertyId, sess.id),
        ]);
        setAttendances(att); setTables(tbls); setVisitors(vis); setOrders(ords);
      } else {
        setAttendances([]); setTables([]); setVisitors([]); setOrders([]);
      }
      setError(null);
    } catch {
      setError("Não foi possível carregar o salão.");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (!propertyId) return;
    let subscribed = false;
    const reload = () => { void loadData(); };
    const channel = supabase.channel(`cafe_salao_${propertyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "breakfast_attendance", filter: `propertyId=eq.${propertyId}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "breakfast_tables", filter: `propertyId=eq.${propertyId}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "breakfast_visitors", filter: `propertyId=eq.${propertyId}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "fb_orders", filter: `property_id=eq.${propertyId}` }, reload)
      .subscribe((status: string) => { if (status === "SUBSCRIBED") subscribed = true; });
    return () => { safeRemoveChannel(channel, subscribed); };
  }, [propertyId, loadData]);

  /** Executa uma ação por item com estado de progresso e erro tratado. */
  const act = async (id: string, fn: () => Promise<void>, okMsg?: string) => {
    setBusyId(id);
    try { await fn(); if (okMsg) toast.success(okMsg); await loadData(); }
    catch { toast.error("Não foi possível concluir a ação."); }
    finally { setBusyId(null); }
  };

  const handleOpenSalon = async () => {
    setSessionBusy(true);
    try {
      const sess = await BreakfastSalonService.openSession(propertyId, actorName);
      setSession(sess);
      toast.success("Salão aberto!");
      await loadData();
    } catch { toast.error("Não foi possível abrir o salão."); }
    finally { setSessionBusy(false); }
  };

  const handleCloseSalon = async () => {
    if (!session) return;
    const ok = await confirm({ title: "Fechar o salão?", description: "Encerra a sessão de hoje do café. Pedidos e mesas ficam no histórico.", confirmLabel: "Fechar salão", tone: "danger" });
    if (!ok) return;
    setSessionBusy(true);
    try {
      await BreakfastSalonService.closeSession(session.id);
      setSession(prev => (prev ? { ...prev, status: "closed" } : null));
      toast.success("Salão fechado.");
    } catch { toast.error("Não foi possível fechar o salão."); }
    finally { setSessionBusy(false); }
  };

  const handleCreateTable = async () => {
    if (!session) return;
    const name = await prompt({ title: "Nova mesa", label: "Nome da mesa", placeholder: "Ex.: Mesa varanda", required: true, confirmLabel: "Criar mesa" });
    if (!name?.trim()) return;
    try {
      await BreakfastSalonService.createTable(propertyId, session.id, name.trim(), actorName);
      toast.success("Mesa criada!");
      await loadData();
    } catch { toast.error("Não foi possível criar a mesa."); }
  };

  const handlePlaceOrder = async (tableId: string, attendanceId: string | null, items: any[]) => {
    const att = attendances.find(a => a.id === attendanceId);
    await BreakfastSalonService.placeWaiterOrder(propertyId, att?.stayId ?? null, tableId, attendanceId, items, actorId, actorName, att?.guestName ?? null, att?.cabinName ?? null);
    toast.success("Pedido enviado para a cozinha!");
    await loadData();
  };

  const derived = useMemo(() => {
    const activeOrders = orders.filter(o => o.status !== "delivered" && o.status !== "cancelled");
    const pendingOrdersCount = orders.filter(o => o.status === "pending").length;
    const tablesWithGuests: TableWithGuests[] = tables.map(t => ({
      ...t,
      attendances: attendances.filter(a => a.tableId === t.id && a.status === "seated"),
      visitors: visitors.filter(v => v.tableId === t.id),
    }));
    const seatedCount = attendances.filter(a => a.status === "seated").length;
    const expectedCount = attendances.filter(a => a.status === "expected").length;
    return { activeOrders, pendingOrdersCount, tablesWithGuests, seatedCount, expectedCount };
  }, [orders, tables, attendances, visitors]);

  return {
    propertyId, actorName, session, attendances, tables, visitors, orders, loading, error, busyId, sessionBusy,
    reload: loadData, act, handleOpenSalon, handleCloseSalon, handleCreateTable, handlePlaceOrder,
    isOpen: session?.status === "open",
    ...derived,
  };
}

export type CafeSalaoState = ReturnType<typeof useCafeSalao>;
