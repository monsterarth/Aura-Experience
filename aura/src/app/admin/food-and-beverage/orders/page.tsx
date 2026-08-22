"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock, Copy, FileText, Package, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { useProperty } from "@/context/PropertyContext";
import { fbService } from "@/services/fb-service";
import { StayService } from "@/services/stay-service";
import type { FBOrder, FBCategory, FBMenuItem } from "@/types/aura";
import { T } from "@/lib/admin-tokens";
import { SegmentedTabs, Button, IconButton, Card, Pill, SectionLabel, Loadable, SkeletonCards, EmptyState, useTabParam } from "@/components/aura";
import { OrderDetailModal, ItemsByCategory } from "./_components/OrderDetailModal";
import { fmtBRL, getObservations, getRegularItems, groupByCategory, orderStatus, type StayInfo } from "./_components/orders-utils";

type DateFilter = "yesterday" | "today" | "tomorrow";
type TypeFilter = "all" | "breakfast" | "restaurant";
const DATE_FILTERS: readonly DateFilter[] = ["yesterday", "today", "tomorrow"] as const;
const TYPE_FILTERS: readonly TypeFilter[] = ["all", "breakfast", "restaurant"] as const;

export default function FBOrdersPage() {
  const { currentProperty } = useProperty();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<FBOrder[]>([]);
  const [stays, setStays] = useState<Record<string, StayInfo>>({});
  const [categories, setCategories] = useState<FBCategory[]>([]);
  const [menuItems, setMenuItems] = useState<FBMenuItem[]>([]);
  const [dateFilter, setDateFilter] = useTabParam<DateFilter>("dia", "today", DATE_FILTERS);
  const [typeFilter, setTypeFilter] = useTabParam<TypeFilter>("tipo", "all", TYPE_FILTERS);
  const [selectedOrder, setSelectedOrder] = useState<FBOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pendingDuplicate, setPendingDuplicate] = useState(false);
  const [printA4Mode, setPrintA4Mode] = useState(false);

  const propertyId = currentProperty?.id;

  const targetDate = (() => {
    const d = new Date();
    if (dateFilter === "yesterday") d.setDate(d.getDate() - 1);
    if (dateFilter === "tomorrow") d.setDate(d.getDate() + 1);
    return d;
  })();

  const loadOrders = useCallback(async (showLoader = true) => {
    if (!propertyId) return;
    if (showLoader) { setLoading(true); setError(null); }
    try {
      const isoDate = targetDate.toISOString().split("T")[0];
      const filters: { date: string; type?: "breakfast" | "restaurant" } = { date: isoDate };
      if (typeFilter !== "all") filters.type = typeFilter;
      const [fetchedOrders, cats, itms] = await Promise.all([
        fbService.getOrders(propertyId, filters),
        fbService.getCategories(propertyId),
        fbService.getMenuItems(propertyId),
      ]);
      setOrders(fetchedOrders);
      setCategories(cats.filter(c => c.type === "both" || c.type === "breakfast").sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setMenuItems(itms);
      // Nome da cabana/hóspede por estadia (cache por id)
      const missing = fetchedOrders.filter(o => o.stayId && !stays[o.stayId]);
      if (missing.length) {
        const add: Record<string, StayInfo> = {};
        for (const o of missing) {
          try {
            const info = await StayService.getStayWithGuestAndCabin(propertyId, o.stayId!);
            if (info) add[o.stayId!] = { cabinName: info.cabin?.name || "N/A", guestName: info.guest?.fullName || "Desconhecido" };
          } catch { /* ignora */ }
        }
        if (Object.keys(add).length) setStays(prev => ({ ...prev, ...add }));
      }
    } catch {
      if (showLoader) setError("Não foi possível carregar os pedidos."); else toast.error("Erro ao atualizar pedidos.");
    } finally {
      if (showLoader) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, dateFilter, typeFilter]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => {
    const id = setInterval(() => { void loadOrders(false); }, 30000);
    return () => clearInterval(id);
  }, [loadOrders]);

  const updateStatus = async (id: string, newStatus: FBOrder["status"]) => {
    try {
      await fbService.updateOrderStatus(id, newStatus);
      toast.success("Status atualizado!");
      setOrders(prev => prev.map(o => (o.id === id ? { ...o, status: newStatus } : o)));
      setSelectedOrder(prev => (prev?.id === id ? { ...prev, status: newStatus } : prev));
    } catch {
      toast.error("Erro ao atualizar status.");
    }
  };

  const handlePrintA4 = () => {
    setPrintA4Mode(true);
    setTimeout(() => { window.print(); setTimeout(() => setPrintA4Mode(false), 600); }, 250);
  };

  const openOrder = (o: FBOrder, dup = false) => { setSelectedOrder(o); setPendingDuplicate(dup); setDetailOpen(true); };
  const closeOrder = () => { setDetailOpen(false); setPendingDuplicate(false); };

  const selectedGroups = selectedOrder ? groupByCategory(getRegularItems(selectedOrder), categories, menuItems) : [];
  const dateLabel = targetDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <>
      {/* ── Impressão A4 (só no print) ── */}
      {printA4Mode && (
        <div className="hidden print:block" style={{ color: "#000", background: "#fff", padding: 32, fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, paddingBottom: 16, borderBottom: "2px solid #000" }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase", margin: 0 }}>{currentProperty?.name}</h1>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Lista de pedidos de café da manhã</h2>
            </div>
            <div style={{ textAlign: "right", fontSize: 12 }}>
              <div style={{ fontWeight: 700 }}>{targetDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</div>
              <div style={{ color: "#555" }}>Impresso em {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>
          {orders.length === 0 ? (
            <p style={{ textAlign: "center", color: "#888", padding: "40px 0" }}>Nenhum pedido para esta data.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #000" }}>
                  {["Cabana", "Horário", "Itens", "Obs.", "Status"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px 6px 0", fontWeight: 900, textTransform: "uppercase", fontSize: 10, letterSpacing: ".08em" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...orders].sort((a, b) => (a.deliveryTime ?? "").localeCompare(b.deliveryTime ?? "")).map((order, idx) => {
                  const stayData = order.stayId ? stays[order.stayId] : undefined;
                  const obs = getObservations(order);
                  const groups = groupByCategory(getRegularItems(order), categories, menuItems);
                  return (
                    <tr key={order.id} style={{ background: idx % 2 === 0 ? "#f9f9f9" : "#fff", borderBottom: "1px solid #ddd", verticalAlign: "top" }}>
                      <td style={{ padding: "8px 8px 8px 0", fontWeight: 900, fontSize: 13 }}>{stayData?.cabinName || order.cabinName || "N/A"}</td>
                      <td style={{ padding: "8px 8px 8px 0", fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" }}>{order.deliveryTime ?? "—"}</td>
                      <td style={{ padding: "8px 8px 8px 0" }}>
                        {groups.map(({ label, items }) => (
                          <div key={label} style={{ marginBottom: 4 }}>
                            <strong style={{ fontSize: 10, textTransform: "uppercase", color: "#555" }}>{label}:</strong>
                            {items.map((it, i) => <div key={i} style={{ paddingLeft: 8 }}>{it.quantity}× {it.name}{it.flavor ? ` (${it.flavor})` : ""}{it.guestName ? ` → ${it.guestName}` : ""}</div>)}
                          </div>
                        ))}
                      </td>
                      <td style={{ padding: "8px 8px 8px 0", fontSize: 11, color: "#555", maxWidth: 120 }}>{obs?.notes ?? "—"}</td>
                      <td style={{ padding: "8px 0", fontWeight: 700, fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>{orderStatus(order.status).label}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #000" }}>
                  <td colSpan={3} style={{ paddingTop: 8, fontWeight: 700, fontSize: 12 }}>Total: {orders.length} pedido{orders.length !== 1 ? "s" : ""}</td>
                  <td colSpan={2} style={{ paddingTop: 8, fontWeight: 900, fontSize: 12, textAlign: "right" }}>{fmtBRL(orders.reduce((s, o) => s + o.totalPrice, 0))}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── Tela ── */}
      <div className="print:hidden" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <SegmentedTabs<DateFilter> items={[{ id: "yesterday", label: "Ontem" }, { id: "today", label: "Hoje" }, { id: "tomorrow", label: "Amanhã" }]} value={dateFilter} onChange={setDateFilter} ariaLabel="Dia" />
          <SegmentedTabs<TypeFilter> items={[{ id: "all", label: "Todos" }, { id: "breakfast", label: "Café" }, { id: "restaurant", label: "Restaurante" }]} value={typeFilter} onChange={setTypeFilter} ariaLabel="Tipo" />
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
            <Button variant="secondary" icon={FileText} onClick={handlePrintA4}><span className="ak-hide-mobile">Imprimir </span>A4</Button>
            <IconButton icon={RefreshCcw} label="Atualizar" variant="secondary" onClick={() => void loadOrders()} />
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CalendarDays size={18} color={T.brandText} />
          <span style={{ fontSize: 15, fontWeight: 900, color: T.text, textTransform: "capitalize" }}>{dateLabel}</span>
          <Pill tone="neutral" label={`${orders.length} pedido${orders.length === 1 ? "" : "s"}`} />
        </div>

        <Loadable loading={loading} skeleton={<SkeletonCards n={6} minWidth={280} />} error={error} onRetry={() => void loadOrders()} isEmpty={orders.length === 0}
          empty={<EmptyState icon={Package} title="Nenhum pedido encontrado" description="Aguardando novos pedidos para esta data." />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {orders.map(order => {
              const stayData = order.stayId ? stays[order.stayId] : undefined;
              const guestName = stayData?.guestName || order.guestName || "—";
              const cabinName = stayData?.cabinName || order.cabinName || "N/A";
              const obs = getObservations(order);
              const groups = groupByCategory(getRegularItems(order), categories, menuItems);
              const st = orderStatus(order.status);
              return (
                <Card key={order.id} pad={0} interactive onClick={() => openOrder(order)} style={{ display: "flex", flexDirection: "column", textAlign: "left", opacity: order.status === "delivered" ? .72 : 1 }}>
                  <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <SectionLabel style={{ marginBottom: 4 }}>{order.type === "breakfast" ? "Café da manhã" : "Restaurante"} · {order.modality}</SectionLabel>
                      <div style={{ fontSize: 18, fontWeight: 900, color: T.text, letterSpacing: "-.3px", lineHeight: 1.15, overflowWrap: "anywhere" }}>{cabinName}</div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{guestName}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                      <Pill tone={st.tone} dot label={st.label} />
                      {order.deliveryTime && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" }}><Clock size={12} color={T.brandText} /> {order.deliveryTime}</span>}
                    </div>
                  </div>
                  <div style={{ padding: "10px 16px", flex: 1 }}>
                    <ItemsByCategory groups={groups} />
                    {obs && obs.notes && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                        <SectionLabel style={{ color: T.amber, marginBottom: 2 }}>Obs.</SectionLabel>
                        <p style={{ margin: 0, fontSize: 12, color: T.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{obs.notes}</p>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "8px 12px 8px 16px", borderTop: `1px solid ${T.border}`, background: T.glass, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: T.muted, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>#{order.id.substring(0, 6).toUpperCase()}</span>
                      <IconButton icon={Copy} label="Duplicar para amanhã" size="sm" onClick={e => { e.stopPropagation(); openOrder(order, true); }} />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: T.brandText, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(order.totalPrice)}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </Loadable>
      </div>

      <OrderDetailModal
        open={detailOpen}
        order={selectedOrder}
        stayInfo={selectedOrder?.stayId ? stays[selectedOrder.stayId] : undefined}
        propertyName={currentProperty?.name ?? ""}
        groups={selectedGroups}
        categories={categories}
        menuItems={menuItems}
        deliveryTimes={currentProperty?.settings?.fbSettings?.breakfast?.delivery?.deliveryTimes ?? []}
        onClose={closeOrder}
        onStatusChange={updateStatus}
        onOrderUpdated={updated => { setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o))); setSelectedOrder(updated); }}
        onOrderDuplicated={created => { if (dateFilter === "tomorrow") setOrders(prev => [created, ...prev]); }}
        autoEnterDuplicate={pendingDuplicate}
      />
    </>
  );
}
