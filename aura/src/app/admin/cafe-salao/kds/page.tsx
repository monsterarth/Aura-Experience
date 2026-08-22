// src/app/admin/cafe-salao/kds/page.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, ChefHat, Clock, Coffee, Printer } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useProperty } from "@/context/PropertyContext";
import { BreakfastSalonService } from "@/services/breakfast-salon-service";
import { supabase, safeRemoveChannel } from "@/lib/supabase";
import { RoleGuard } from "@/components/auth/RoleGuard";
import type { BreakfastSession, BreakfastTable, FBOrder } from "@/types/aura";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { PageShell, PageHeader, KpiGrid, KpiCard, SegmentedTabs, Card, Pill, Button, IconButton, Loadable, SkeletonCards, EmptyState } from "@/components/aura";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending:   { label: "Pendente",   tone: "amber" },
  confirmed: { label: "Confirmado", tone: "blue" },
  preparing: { label: "Preparando", tone: "orange" },
  delivered: { label: "Pronto",     tone: "green" },
  cancelled: { label: "Cancelado",  tone: "neutral" },
};

function OrderCard({ order, tableName, onAccept, onReady, onPrint, busy }: {
  order: FBOrder; tableName: string; onAccept: () => void; onReady: () => void; onPrint: () => void; busy?: boolean;
}) {
  const st = STATUS[order.status] ?? STATUS.pending;
  const t = toneOf(st.tone);
  const minutesAgo = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  return (
    <Card pad={16} style={{ borderColor: t.border, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.text, letterSpacing: "-.3px", lineHeight: 1.1 }}>{tableName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11, color: T.muted, fontWeight: 600 }}>
            <Clock size={11} /> {minutesAgo} min · {format(new Date(order.createdAt), "HH:mm")} · {order.requestedBy === "guest" ? "hóspede" : "garçom"}
          </div>
        </div>
        <Pill tone={st.tone} dot label={st.label} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {order.items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: T.glass2, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: T.text, flexShrink: 0 }}>{item.quantity}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{item.name}</span>
            {item.flavor && <span style={{ fontSize: 12, color: T.muted }}>({item.flavor})</span>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
        {order.status === "pending" && <Button variant="primary" tone="orange" size="lg" icon={ChefHat} onClick={onAccept} loading={busy} style={{ flex: 1 }}>Aceitar</Button>}
        {order.status === "preparing" && <Button variant="primary" tone="green" size="lg" icon={Check} onClick={onReady} loading={busy} style={{ flex: 1 }}>Pronto</Button>}
        {(order.status === "delivered" || order.status === "confirmed" || order.status === "cancelled") && <span style={{ flex: 1 }} />}
        <IconButton icon={Printer} label="Reimprimir" size="lg" variant="secondary" onClick={onPrint} />
      </div>
    </Card>
  );
}

type Filter = "active" | "all";

export default function KdsPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "kitchen"]}>
      <KdsInner />
    </RoleGuard>
  );
}

function KdsInner() {
  const { currentProperty } = useProperty();
  const propertyId = currentProperty?.id ?? "";

  const [session, setSession] = useState<BreakfastSession | null>(null);
  const [tables, setTables] = useState<BreakfastTable[]>([]);
  const [orders, setOrders] = useState<FBOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    try {
      const sess = await BreakfastSalonService.getTodaySession(propertyId);
      setSession(sess);
      if (sess) {
        const [tbls, ords] = await Promise.all([
          BreakfastSalonService.getTablesForSession(sess.id),
          BreakfastSalonService.getOrdersBySession(propertyId, sess.id),
        ]);
        setTables(tbls);
        setOrders(ords);
      } else {
        setTables([]); setOrders([]);
      }
      setError(null);
    } catch {
      setError("Não foi possível carregar os pedidos.");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Fallback: atualiza a cada 30s mesmo sem realtime
  useEffect(() => {
    const timer = setInterval(() => { void loadData(); }, 30000);
    return () => clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (!propertyId) return;
    let subscribed = false;
    const channel = supabase.channel(`kds_${propertyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fb_orders", filter: `property_id=eq.${propertyId}` }, () => { void loadData(); })
      .subscribe((status: string) => { if (status === "SUBSCRIBED") subscribed = true; });
    return () => { safeRemoveChannel(channel, subscribed); };
  }, [propertyId, loadData]);

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try { await fn(); } catch { toast.error("Não foi possível atualizar o pedido."); } finally { setBusyId(null); }
  };
  const handleAccept = (orderId: string) => withBusy(orderId, async () => { await BreakfastSalonService.updateOrderStatus(orderId, "preparing"); await loadData(); });
  const handleReady = (orderId: string) => withBusy(orderId, async () => { await BreakfastSalonService.updateOrderStatus(orderId, "delivered"); toast.success("Pedido marcado como pronto!"); await loadData(); });
  const handlePrint = async (orderId: string) => {
    const result = await BreakfastSalonService.printOrder(orderId);
    if (result.queued) toast.info("Impressão na fila (impressora não configurada).");
  };

  const activeOrders = orders.filter(o => o.status !== "delivered" && o.status !== "cancelled");
  const visibleOrders = filter === "active" ? activeOrders : orders;
  const pendingCount = orders.filter(o => o.status === "pending").length;
  const preparingCount = orders.filter(o => o.status === "preparing").length;
  const tableName = (tableId?: string) => tables.find(t => t.id === tableId)?.name ?? "Mesa";
  const open = session?.status === "open";

  return (
    <PageShell>
      <PageHeader
        icon={Coffee}
        iconTone="orange"
        title="KDS — Cozinha"
        badge={session ? <Pill tone={open ? "green" : "neutral"} dot label={open ? "Salão aberto" : "Salão fechado"} /> : undefined}
        subtitle={<span style={{ textTransform: "capitalize" }}>{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>}
        tabs={(
          <SegmentedTabs<Filter>
            items={[{ id: "active", label: "Ativos", count: activeOrders.length || undefined }, { id: "all", label: "Todos", count: orders.length || undefined }]}
            value={filter}
            onChange={setFilter}
            ariaLabel="Filtrar pedidos"
          />
        )}
      />

      <KpiGrid cols={2}>
        <KpiCard label="Pendentes" value={pendingCount} sub="aguardando aceite" icon={Clock} tone="amber" compact />
        <KpiCard label="Preparando" value={preparingCount} sub="na cozinha agora" icon={ChefHat} tone="orange" compact />
      </KpiGrid>

      <Loadable loading={loading} skeleton={<SkeletonCards n={4} minWidth={260} />} error={error} onRetry={() => void loadData()}
        isEmpty={visibleOrders.length === 0}
        empty={<EmptyState icon={ChefHat} title={session ? "Nenhum pedido" : "Salão ainda não aberto hoje"} description={session ? "Os pedidos aparecem aqui em tempo real." : "Quando a sessão do café abrir, os pedidos entram aqui."} />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibleOrders.map(o => (
            <OrderCard key={o.id} order={o} tableName={tableName(o.tableId)} busy={busyId === o.id}
              onAccept={() => void handleAccept(o.id)} onReady={() => void handleReady(o.id)} onPrint={() => void handlePrint(o.id)} />
          ))}
        </div>
      </Loadable>
    </PageShell>
  );
}
