"use client";

import React, { useEffect, useState } from "react";
import { Clock, Copy, Minus, Pencil, Plus, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import type { FBOrder, FBCategory, FBMenuItem } from "@/types/aura";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { T } from "@/lib/admin-tokens";
import { Dialog, Button, IconButton, Pill, FilterChips, Field, Input, Textarea, SectionLabel } from "@/components/aura";
import { buildThermalHTML, fmtBRL, getObservations, getRegularItems, groupByCategory, orderStatus, type ItemGroup, type OrderItem, type StayInfo } from "./orders-utils";

/** Linha de item (tela). */
export function ItemRow({ item }: { item: OrderItem }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ minWidth: 32, height: 26, padding: "0 6px", borderRadius: 8, background: T.glass2, color: T.brandText, fontWeight: 900, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{item.quantity}×</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{item.name}</span>
        {item.flavor && <span style={{ display: "block", fontSize: 11, color: T.amber }}>Sabor: {item.flavor}</span>}
        {item.guestName && <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.brandText }}>→ {item.guestName}</span>}
        {!item.guestName && item.notes && item.notes !== item.name && <span style={{ display: "block", fontSize: 11, color: T.muted }}>{item.notes}</span>}
      </div>
    </div>
  );
}

/** Itens agrupados por categoria (tela). */
export function ItemsByCategory({ groups }: { groups: ItemGroup[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {groups.map(({ label, items }) => (
        <div key={label}>
          <SectionLabel style={{ marginBottom: 2 }}>{label}</SectionLabel>
          {items.map((it, i) => <ItemRow key={i} item={it} />)}
        </div>
      ))}
    </div>
  );
}

export interface OrderDetailModalProps {
  open: boolean;
  order: FBOrder | null;
  stayInfo: StayInfo | undefined;
  propertyName: string;
  groups: ItemGroup[];
  categories: FBCategory[];
  menuItems: FBMenuItem[];
  deliveryTimes: string[];
  onClose: () => void;
  onStatusChange: (id: string, status: FBOrder["status"]) => void;
  onOrderUpdated: (updated: FBOrder) => void;
  onOrderDuplicated?: (created: FBOrder) => void;
  autoEnterDuplicate?: boolean;
}

/** Detalhe do pedido: ver, mudar status, editar itens, duplicar para amanhã, imprimir ticket. */
export function OrderDetailModal({ open, order, stayInfo, propertyName, groups, categories, menuItems, deliveryTimes, onClose, onStatusChange, onOrderUpdated, onOrderDuplicated, autoEnterDuplicate }: OrderDetailModalProps) {
  const [printing, setPrinting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [pendingAdd, setPendingAdd] = useState<{ mi: FBMenuItem; flavor: string; guestName: string } | null>(null);
  const [editObs, setEditObs] = useState("");
  const [editTime, setEditTime] = useState("");
  const { requestClose, confirmDiscard, guardProps, reset } = useCloseGuard(onClose, { open, dirty: editing && !saving, escape: false, message: "Descartar as alterações deste pedido?" });

  const cabinName = stayInfo?.cabinName || order?.cabinName || "N/A";
  const guestName = stayInfo?.guestName || order?.guestName || "—";
  const obs = order ? getObservations(order) : null;

  const enterEdit = React.useCallback((dup: boolean) => {
    if (!order) return;
    setEditItems(getRegularItems(order).map(it => ({ ...it })));
    setEditObs(getObservations(order)?.notes ?? "");
    setEditTime(order.deliveryTime ?? "");
    setPendingAdd(null);
    setDuplicating(dup);
    setEditing(true);
  }, [order]);

  // Reset ao abrir/fechar; entra em "duplicar" quando veio do atalho do card.
  useEffect(() => {
    if (!open) { setEditing(false); setDuplicating(false); setPendingAdd(null); return; }
    if (autoEnterDuplicate) enterEdit(true);
  }, [open, autoEnterDuplicate, enterEdit]);

  const changeQty = (idx: number, delta: number) => setEditItems(prev => prev.map((it, i) => (i === idx ? { ...it, quantity: Math.max(0, it.quantity + delta) } : it)));

  const saveEdit = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const items = editItems.filter(it => it.quantity > 0);
      if (editObs.trim()) items.push({ menuItemId: "guest_observations", name: "Observações Gerais", quantity: 1, unitPrice: 0, totalPrice: 0, notes: editObs.trim() });
      const totalPrice = items.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0);

      if (duplicating) {
        const base = order.deliveryDate ? new Date(order.deliveryDate + "T12:00:00") : new Date();
        base.setDate(base.getDate() + 1);
        const tomorrowISO = base.toISOString().split("T")[0];
        let res = await fetch("/api/guest/breakfast-orders", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId: order.propertyId, stayId: order.stayId, modality: order.modality, type: order.type, items, totalPrice, deliveryTime: editTime || undefined, deliveryDate: tomorrowISO, skipWindowCheck: true }),
        });
        // Já existe pedido para amanhã → atualiza o existente.
        if (res.status === 409) {
          const conflict = await res.json();
          const existingId = conflict.error?.replace("ORDER_EXISTS:", "");
          if (!existingId) throw new Error("Conflito ao criar pedido");
          res = await fetch("/api/guest/breakfast-orders", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: existingId, stayId: order.stayId, propertyId: order.propertyId, items, totalPrice, deliveryTime: editTime || undefined }),
          });
        }
        if (!res.ok) throw new Error(`Erro ao criar (${res.status})`);
        const created = await res.json();
        toast.success("Pedido duplicado para amanhã!");
        onOrderDuplicated?.(created);
        setEditing(false); setDuplicating(false);
        onClose();
      } else {
        const res = await fetch("/api/guest/breakfast-orders", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id, stayId: order.stayId, propertyId: order.propertyId, items, totalPrice, deliveryTime: editTime || undefined }),
        });
        if (!res.ok) throw new Error("Erro ao salvar");
        toast.success("Pedido atualizado!");
        onOrderUpdated({ ...order, items, totalPrice, deliveryTime: editTime || order.deliveryTime });
        reset();
        setEditing(false);
      }
    } catch {
      toast.error(duplicating ? "Erro ao duplicar pedido." : "Erro ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (!order) return;
    setPrinting(true);
    const html = buildThermalHTML(order, cabinName, propertyName, groups);
    const win = window.open("", "_blank", "width=400,height=700,toolbar=0,menubar=0,location=0");
    if (win) { win.document.write(html); win.document.close(); }
    setTimeout(() => setPrinting(false), 600);
  };

  const st = order ? orderStatus(order.status) : null;
  const activeMenu = menuItems.filter(mi => mi.active);
  const catMap = new Map(categories.map(c => [c.id, c]));
  const catalogGroups = [
    ...(activeMenu.some(mi => !mi.categoryId || !catMap.has(mi.categoryId)) ? [{ label: "À la carte", items: activeMenu.filter(mi => !mi.categoryId || !catMap.has(mi.categoryId)) }] : []),
    ...[...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(c => ({ label: c.name, items: activeMenu.filter(mi => mi.categoryId === c.id) })).filter(g => g.items.length > 0),
  ];

  const footer = order && (editing ? (
    <>
      <Button variant="secondary" onClick={() => { void confirmDiscard().then(ok => { if (ok) { setEditing(false); setDuplicating(false); } }); }} disabled={saving}>Cancelar</Button>
      <Button variant="primary" icon={Save} onClick={() => void saveEdit()} loading={saving} loadingText="Salvando…">{duplicating ? "Criar para amanhã" : "Salvar"}</Button>
    </>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        <Button variant={order.status === "pending" ? "soft" : "outline"} tone="amber" size="sm" onClick={() => onStatusChange(order.id, "pending")} disabled={order.status === "pending"}>Pendente</Button>
        <Button variant={order.status === "preparing" ? "soft" : "outline"} tone="blue" size="sm" onClick={() => onStatusChange(order.id, "preparing")} disabled={order.status === "preparing"}>Preparo</Button>
        <Button variant={order.status === "delivered" ? "soft" : "outline"} tone="green" size="sm" onClick={() => onStatusChange(order.id, "delivered")} disabled={order.status === "delivered"}>Pronto</Button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button variant="secondary" icon={Copy} onClick={() => enterEdit(true)} style={{ flex: 1 }}>Duplicar p/ amanhã</Button>
        <Button variant="secondary" icon={Pencil} onClick={() => enterEdit(false)} style={{ flex: 1 }}>Editar</Button>
        <Button variant="primary" icon={Printer} onClick={handlePrint} loading={printing} style={{ flex: 1 }}>Imprimir</Button>
      </div>
    </div>
  ));

  return (
    <Dialog
      open={open && !!order} onClose={saving ? () => {} : requestClose} presentation="auto" size="lg"
      title={cabinName} subtitle={guestName} panelProps={guardProps}
      footer={footer} footerRow
    >
      {order && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Pill tone="neutral" label={`${order.type === "breakfast" ? "Café da manhã" : "Restaurante"} · ${order.modality}`} />
            {order.deliveryDate && <Pill tone="blue" label={new Date(order.deliveryDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} />}
            {duplicating && <Pill tone="amber" label="Duplicando → amanhã" />}
            <span style={{ marginLeft: "auto" }}>{st && <Pill tone={st.tone} dot label={st.label} />}</span>
          </div>

          {/* Horário */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: T.glass, border: `1px solid ${T.border}`, flexWrap: "wrap" }}>
            <Clock size={15} color={T.brandText} />
            {editing ? (
              deliveryTimes.length > 0
                ? <FilterChips scroll={false} ariaLabel="Horário de entrega" items={deliveryTimes.map(t => ({ id: t, label: t }))} value={editTime || null} onChange={setEditTime} />
                : <Input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} fieldSize="sm" style={{ width: 130 }} />
            ) : (
              <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", color: T.text }}>{order.deliveryTime ?? "Sem horário"}</span>
            )}
          </div>

          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {editItems.length > 0 && (() => {
                const indexed = editItems.map((it, idx) => ({ ...it, _idx: idx }));
                const editGroups = groupByCategory(indexed, categories, menuItems);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {editGroups.map(({ label, items: gi }) => (
                      <div key={label}>
                        <SectionLabel style={{ marginBottom: 6 }}>{label}</SectionLabel>
                        {gi.map((it: OrderItem) => (
                          <div key={it._idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                              <IconButton icon={Minus} label="Menos um" size="sm" variant="secondary" onClick={() => changeQty(it._idx, -1)} />
                              <span style={{ minWidth: 34, textAlign: "center", fontWeight: 900, color: it.quantity === 0 ? T.muted2 : T.brandText, fontVariantNumeric: "tabular-nums" }}>{it.quantity}×</span>
                              <IconButton icon={Plus} label="Mais um" size="sm" variant="secondary" onClick={() => changeQty(it._idx, 1)} />
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: it.quantity === 0 ? T.muted2 : T.text, textDecoration: it.quantity === 0 ? "line-through" : "none" }}>{it.name}</span>
                              {it.flavor && <span style={{ display: "block", fontSize: 11, color: T.amber }}>Sabor: {it.flavor}</span>}
                              {it.guestName && <span style={{ display: "block", fontSize: 11, color: T.brandText }}>→ {it.guestName}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {activeMenu.length > 0 && (
                <div>
                  <SectionLabel style={{ marginBottom: 8 }}>Adicionar item</SectionLabel>
                  {pendingAdd && (
                    <div style={{ marginBottom: 10, padding: 12, borderRadius: 12, background: T.glass2, border: `1px solid ${T.g1Border}`, display: "flex", flexDirection: "column", gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{pendingAdd.mi.name}</span>
                      {pendingAdd.mi.flavors && pendingAdd.mi.flavors.length > 0 && (
                        <Field label="Sabor" required>
                          <FilterChips scroll={false} ariaLabel="Sabor" items={pendingAdd.mi.flavors.map(f => ({ id: f.name, label: f.name }))} value={pendingAdd.flavor || null} onChange={f => setPendingAdd(p => (p ? { ...p, flavor: f } : p))} />
                        </Field>
                      )}
                      <Field label="Hóspede (opcional)">
                        <Input value={pendingAdd.guestName} onChange={e => setPendingAdd(p => (p ? { ...p, guestName: e.target.value } : p))} placeholder="ex.: Hóspede 1" fieldSize="sm" />
                      </Field>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button variant="ghost" size="sm" onClick={() => setPendingAdd(null)} style={{ flex: 1 }}>Cancelar</Button>
                        <Button variant="primary" size="sm" icon={Plus} style={{ flex: 1 }} disabled={!!pendingAdd.mi.flavors && pendingAdd.mi.flavors.length > 0 && !pendingAdd.flavor}
                          onClick={() => {
                            const mi = pendingAdd.mi;
                            setEditItems(prev => [...prev, { menuItemId: mi.id, name: mi.name, quantity: 1, unitPrice: mi.price ?? 0, totalPrice: mi.price ?? 0, flavor: pendingAdd.flavor || undefined, guestName: pendingAdd.guestName.trim() || undefined }]);
                            setPendingAdd(null);
                          }}>Adicionar</Button>
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {catalogGroups.map(({ label, items }) => (
                      <div key={label}>
                        <SectionLabel style={{ marginBottom: 4, color: T.muted2 }}>{label}</SectionLabel>
                        {items.map(mi => (
                          <div key={mi.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>
                            <IconButton icon={Plus} label={`Adicionar ${mi.name}`} size="sm" variant={pendingAdd?.mi.id === mi.id ? "soft" : "secondary"} tone="brand" onClick={() => setPendingAdd({ mi, flavor: "", guestName: "" })} />
                            <span style={{ flex: 1, fontSize: 13, color: T.text }}>{mi.name}</span>
                            {mi.flavors && mi.flavors.length > 0 && <span style={{ fontSize: 10, color: T.muted2 }}>{mi.flavors.length} sabores</span>}
                            {mi.price != null && mi.price > 0 && <span style={{ fontSize: 12, color: T.muted, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(mi.price)}</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Field label="Observações">
                <Textarea value={editObs} onChange={e => setEditObs(e.target.value)} placeholder="Adicionar observações…" rows={3} autoGrow />
              </Field>
            </div>
          ) : (
            <>
              <ItemsByCategory groups={groups} />
              {obs && obs.notes && (
                <div style={{ padding: 12, borderRadius: 12, background: T.amberBg, border: `1px solid ${T.amberBorder}` }}>
                  <SectionLabel style={{ color: T.amber, marginBottom: 4 }}>Observações</SectionLabel>
                  <p style={{ margin: 0, fontSize: 13, color: T.text, whiteSpace: "pre-wrap" }}>{obs.notes}</p>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                <SectionLabel>Total</SectionLabel>
                <span style={{ fontSize: 18, fontWeight: 900, color: T.brandText, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(order.totalPrice)}</span>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
