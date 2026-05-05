"use client";

import React, { useState, useEffect } from "react";
import { useProperty } from "@/context/PropertyContext";
import { fbService } from "@/services/fb-service";
import { StayService } from "@/services/stay-service";
import { FBOrder, FBCategory, FBMenuItem } from "@/types/aura";
import {
    Loader2, RefreshCcw, Printer, Clock, CheckCircle2,
    Package, ChefHat, CalendarDays, X, FileText, Coffee,
    Pencil, Plus, Minus, Save, Copy
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StayInfo = { cabinName: string; guestName: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRegularItems(order: FBOrder) {
    return (order.items as any[]).filter(it => it.menuItemId !== 'guest_observations');
}
function getObservations(order: FBOrder) {
    return (order.items as any[]).find(it => it.menuItemId === 'guest_observations') ?? null;
}

// Groups items by category for display.
// Returns: first a-la-carte items (no guestName, uncategorized or explicitly à-la-carte),
// then each category in order, with items inside sorted by guestName.
function groupByCategory(
    items: any[],
    categories: FBCategory[],
    menuItems: FBMenuItem[]
): { label: string; items: any[] }[] {
    const menuItemMap = new Map(menuItems.map(m => [m.id, m]));
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    // Map each order item to its category
    const byCategoryId: Record<string, any[]> = {};
    const alaCarte: any[] = [];

    for (const it of items) {
        const menuItem = menuItemMap.get(it.menuItemId);
        const cat = menuItem ? categoryMap.get(menuItem.categoryId) : undefined;
        if (!cat) {
            alaCarte.push(it);
        } else {
            if (!byCategoryId[cat.id]) byCategoryId[cat.id] = [];
            byCategoryId[cat.id].push(it);
        }
    }

    const groups: { label: string; items: any[] }[] = [];

    // A-la-carte first (items without a known category)
    if (alaCarte.length > 0) {
        groups.push({ label: 'À la carte', items: alaCarte });
    }

    // Then categories in order
    for (const cat of categories) {
        const catItems = byCategoryId[cat.id];
        if (catItems && catItems.length > 0) {
            // Within each category, sort: named guests first, then group items
            const sorted = [
                ...catItems.filter(it => it.guestName).sort((a, b) => (a.guestName ?? '').localeCompare(b.guestName ?? '')),
                ...catItems.filter(it => !it.guestName),
            ];
            groups.push({ label: cat.name, items: sorted });
        }
    }

    return groups;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'pending':   return <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"><Clock size={12} /> Pendente</span>;
        case 'preparing': return <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"><ChefHat size={12} /> Preparando</span>;
        case 'delivered': return <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5"><CheckCircle2 size={12} /> Entregue</span>;
        case 'cancelled': return <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider">Cancelado</span>;
        default:          return <span className="bg-secondary text-muted-foreground px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider">{status}</span>;
    }
}

// ─── Item line (tela) ─────────────────────────────────────────────────────────
function ItemRow({ item }: { item: any }) {
    return (
        <div className="flex gap-3 items-start py-1.5 border-b border-border/30 last:border-0">
            <span className="font-black text-primary bg-primary/10 min-w-[2rem] h-7 flex items-center justify-center rounded-lg text-sm shrink-0 px-1">
                {item.quantity}×
            </span>
            <div className="flex-1 min-w-0">
                <span className="font-bold text-sm text-foreground leading-snug block">{item.name}</span>
                {item.flavor && <span className="text-xs text-amber-400/80 block">Sabor: {item.flavor}</span>}
                {item.guestName && <span className="text-xs font-semibold text-primary/80 block">→ {item.guestName}</span>}
                {!item.guestName && item.notes && item.notes !== item.name && (
                    <span className="text-xs text-muted-foreground block">{item.notes}</span>
                )}
            </div>
        </div>
    );
}

// ─── Items grouped by category (tela) ─────────────────────────────────────────
function ItemsByCategoryScreen({ groups }: { groups: { label: string; items: any[] }[] }) {
    return (
        <div className="space-y-3">
            {groups.map(({ label, items }) => (
                <div key={label}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
                        {label}
                    </p>
                    {items.map((it, i) => <ItemRow key={i} item={it} />)}
                </div>
            ))}
        </div>
    );
}

// ─── Thermal ticket HTML (para impressão em janela separada) ──────────────────
function buildThermalHTML(
    order: FBOrder,
    cabinName: string,
    propertyName: string,
    groups: { label: string; items: any[] }[],
): string {
    const obs = getObservations(order);

    const itemsHTML = groups.map(({ label, items }, gi) => `
        <div style="margin-bottom:${gi < groups.length - 1 ? '8px' : '0'}">
            <div style="font-weight:900;font-size:10px;text-transform:uppercase;border-bottom:1px solid #ccc;padding-bottom:2px;margin-bottom:4px;letter-spacing:0.08em;color:#555;">
                ${label}
            </div>
            <div style="padding-left:4px;">
                ${items.map((it: any) => `
                    <div style="margin-bottom:4px;">
                        <div style="font-weight:700;">
                            <span style="background:#000;color:#fff;padding:0 4px;border-radius:3px;margin-right:4px;font-size:11px;">${it.quantity}×</span>
                            ${it.name.toUpperCase()}
                            ${it.guestName ? `<span style="font-weight:400;font-size:10px;color:#444;margin-left:4px;">→ ${it.guestName}</span>` : ''}
                        </div>
                        ${it.flavor ? `<div style="padding-left:24px;font-size:11px;color:#333;">Sabor: ${it.flavor}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    const obsHTML = obs?.notes ? `
        <div style="border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:6px;">
            <div style="font-weight:900;font-size:11px;text-transform:uppercase;margin-bottom:2px;">OBSERVAÇÕES:</div>
            <div style="font-size:11px;white-space:pre-wrap;">${obs.notes}</div>
        </div>
    ` : '';

    const deliveryDateStr = order.deliveryDate
        ? new Date(order.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
        : '';

    const totalStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.totalPrice);
    const createdStr = new Date(order.createdAt || '').toLocaleString('pt-BR');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 4mm;
      background: #fff;
      color: #000;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.4;
      width: 80mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  </style>
</head>
<body>
  <!-- Cabeçalho -->
  <div style="text-align:center;padding-bottom:8px;margin-bottom:8px;border-bottom:2px dashed #000;">
    <div style="font-weight:900;font-size:15px;text-transform:uppercase;letter-spacing:0.05em;">${propertyName}</div>
    <div style="font-weight:700;font-size:13px;">CAFÉ DA MANHÃ</div>
    <div style="font-size:11px;margin-top:2px;">Pedido #${order.id.substring(0, 6).toUpperCase()}</div>
    <div style="font-size:10px;color:#444;">${createdStr}</div>
  </div>

  <!-- Cabana + Horário -->
  <div style="text-align:center;margin-bottom:10px;">
    <div style="font-weight:900;font-size:26px;border:3px solid #000;display:inline-block;padding:4px 10px;border-radius:8px;letter-spacing:-0.02em;line-height:1.1;word-break:break-word;max-width:100%;">
      ${cabinName}
    </div>
    ${order.deliveryTime ? `<div style="font-weight:700;font-size:16px;margin-top:6px;">Entrega: ${order.deliveryTime}</div>` : ''}
    ${deliveryDateStr ? `<div style="font-size:11px;color:#555;">${deliveryDateStr}</div>` : ''}
  </div>

  <!-- Itens -->
  <div style="border-top:2px dashed #000;border-bottom:2px dashed #000;padding:8px 0;margin-bottom:8px;">
    ${itemsHTML}
  </div>

  <!-- Observações -->
  ${obsHTML}

  <!-- Total -->
  <div style="text-align:center;font-weight:700;font-size:12px;margin-bottom:8px;">
    TOTAL: ${totalStr}
  </div>

  <!-- Rodapé -->
  <div style="text-align:center;font-size:10px;color:#666;border-top:1px dashed #ccc;padding-top:4px;">
    ★ Bom Apetite ★
  </div>

  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
      setTimeout(function() { window.close(); }, 4000);
    };
  </script>
</body>
</html>`;
}

// ─── Modal de detalhe ─────────────────────────────────────────────────────────
function OrderDetailModal({
    order,
    stayInfo,
    propertyName,
    groups,
    categories,
    menuItems,
    deliveryTimes,
    onClose,
    onStatusChange,
    onOrderUpdated,
    onOrderDuplicated,
    autoEnterDuplicate,
}: {
    order: FBOrder;
    stayInfo: StayInfo | undefined;
    propertyName: string;
    groups: { label: string; items: any[] }[];
    categories: FBCategory[];
    menuItems: FBMenuItem[];
    deliveryTimes: string[];
    onClose: () => void;
    onStatusChange: (id: string, status: FBOrder['status']) => void;
    onOrderUpdated: (updated: FBOrder) => void;
    onOrderDuplicated?: (created: FBOrder) => void;
    autoEnterDuplicate?: boolean;
}) {
    const cabinName = stayInfo?.cabinName || order.cabinName || 'N/A';
    const guestName = stayInfo?.guestName || order.guestName || '—';
    const obs = getObservations(order);

    const [printing, setPrinting] = useState(false);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [duplicating, setDuplicating] = useState(false);

    // Estado de edição: cópia mutável dos itens (sem guest_observations)
    const [editItems, setEditItems] = useState<any[]>([]);
    const [expandedFlavors, setExpandedFlavors] = useState<string | null>(null); // menuItemId com seletor de sabor aberto
    const [editObs, setEditObs] = useState('');
    const [editTime, setEditTime] = useState(order.deliveryTime ?? '');

    const enterEdit = () => {
        setEditItems(getRegularItems(order).map(it => ({ ...it })));
        setEditObs(obs?.notes ?? '');
        setEditTime(order.deliveryTime ?? '');
        setDuplicating(false);
        setEditing(true);
    };

    const enterDuplicate = () => {
        setEditItems(getRegularItems(order).map(it => ({ ...it })));
        setEditObs(obs?.notes ?? '');
        setEditTime(order.deliveryTime ?? '');
        setDuplicating(true);
        setEditing(true);
    };

    useEffect(() => {
        if (autoEnterDuplicate) enterDuplicate();
    }, [autoEnterDuplicate]);

    const changeQty = (idx: number, delta: number) => {
        setEditItems(prev => prev.map((it, i) => {
            if (i !== idx) return it;
            const newQty = Math.max(0, it.quantity + delta);
            return { ...it, quantity: newQty };
        }).filter((_, i, arr) => {
            // Remove item only after the decrement button is pressed and reaches 0
            return arr[i].quantity > 0;
        }));
    };

    const saveEdit = async () => {
        setSaving(true);
        try {
            const items = editItems.filter(it => it.quantity > 0);
            if (editObs.trim()) {
                items.push({
                    menuItemId: 'guest_observations',
                    name: 'Observações Gerais',
                    quantity: 1,
                    unitPrice: 0,
                    totalPrice: 0,
                    notes: editObs.trim(),
                });
            }
            const totalPrice = items.reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0);

            if (duplicating) {
                const base = order.deliveryDate
                    ? new Date(order.deliveryDate + 'T12:00:00')
                    : new Date();
                base.setDate(base.getDate() + 1);
                const tomorrowISO = base.toISOString().split('T')[0];
                const postPayload = {
                    propertyId: order.propertyId,
                    stayId: order.stayId,
                    modality: order.modality,
                    type: order.type,
                    items,
                    totalPrice,
                    deliveryTime: editTime || undefined,
                    deliveryDate: tomorrowISO,
                    skipWindowCheck: true,
                };
                console.log('[duplicate] POST payload:', postPayload);
                let res = await fetch('/api/guest/breakfast-orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(postPayload),
                });

                // Se já existe pedido para amanhã, faz PATCH no existente
                if (res.status === 409) {
                    const conflict = await res.json();
                    const existingId = conflict.error?.replace('ORDER_EXISTS:', '');
                    if (!existingId) throw new Error('Conflito ao criar pedido');
                    res = await fetch('/api/guest/breakfast-orders', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            orderId: existingId,
                            stayId: order.stayId,
                            propertyId: order.propertyId,
                            items,
                            totalPrice,
                            deliveryTime: editTime || undefined,
                        }),
                    });
                }

                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    console.error('[duplicate] final response error:', res.status, errBody);
                    throw new Error(`Erro ao criar (${res.status}): ${JSON.stringify(errBody)}`);
                }
                const created = await res.json();
                toast.success('Pedido duplicado para amanhã!');
                onOrderDuplicated?.(created);
                setEditing(false);
                setDuplicating(false);
                onClose();
            } else {
                const res = await fetch('/api/guest/breakfast-orders', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId: order.id,
                        stayId: order.stayId,
                        propertyId: order.propertyId,
                        items,
                        totalPrice,
                        deliveryTime: editTime || undefined,
                    }),
                });
                if (!res.ok) throw new Error('Erro ao salvar');
                toast.success('Pedido atualizado!');
                onOrderUpdated({ ...order, items, totalPrice, deliveryTime: editTime || order.deliveryTime });
                setEditing(false);
            }
        } catch {
            toast.error(duplicating ? 'Erro ao duplicar pedido.' : 'Erro ao salvar alterações.');
        } finally {
            setSaving(false);
        }
    };

    const handlePrint = () => {
        setPrinting(true);
        const html = buildThermalHTML(order, cabinName, propertyName, groups);
        const win = window.open('', '_blank', 'width=400,height=700,toolbar=0,menubar=0,location=0');
        if (win) {
            win.document.write(html);
            win.document.close();
        }
        setTimeout(() => setPrinting(false), 600);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-card w-full sm:max-w-lg rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[92dvh] animate-in slide-in-from-bottom-4 sm:zoom-in duration-200">

                {/* Header */}
                <div className="flex items-start justify-between p-5 pb-4 border-b border-border">
                    <div>
                        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1 flex items-center gap-1.5">
                            <Coffee size={12} />
                            {order.type === 'breakfast' ? 'Café da Manhã' : 'Restaurante'} • {order.modality}
                            {order.deliveryDate && (
                                <span className="ml-2 bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded text-[10px]">
                                    {new Date(order.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </span>
                            )}
                            {duplicating && (
                                <span className="ml-1 bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    Duplicando → amanhã
                                </span>
                            )}
                        </div>
                        <h2 className="text-2xl font-black tracking-tight leading-none">{cabinName}</h2>
                        <p className="text-sm text-muted-foreground mt-1">{guestName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-secondary rounded-xl transition-colors text-muted-foreground hover:text-foreground">
                        <X size={20} />
                    </button>
                </div>

                {/* Status + Hora */}
                <div className="flex items-center justify-between px-5 py-3 bg-secondary/40 border-b border-border">
                    {editing ? (
                        deliveryTimes.length > 0 ? (
                            <div className="flex items-center gap-2 flex-wrap">
                                <Clock size={15} className="text-primary shrink-0" />
                                {deliveryTimes.map(t => (
                                    <button key={t} onClick={() => setEditTime(t)}
                                        className={cn("px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-colors",
                                            editTime === t
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                                        )}>
                                        {t}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Clock size={15} className="text-primary shrink-0" />
                                <input
                                    type="time"
                                    value={editTime}
                                    onChange={e => setEditTime(e.target.value)}
                                    className="bg-secondary border border-border rounded-lg px-2 py-1 text-sm font-mono font-bold text-foreground focus:outline-none focus:border-primary"
                                />
                            </div>
                        )
                    ) : (
                        <div className="flex items-center gap-2 font-mono font-bold">
                            <Clock size={15} className="text-primary" />
                            <span>{order.deliveryTime ?? 'Sem horário'}</span>
                        </div>
                    )}
                    <StatusBadge status={order.status} />
                </div>

                {/* Itens */}
                <div className="overflow-y-auto flex-1 px-5 py-4 custom-scrollbar">
                    {editing ? (
                        /* ── MODO EDIÇÃO ── */
                        <div className="space-y-5">
                            {/* Seção 1: itens já no pedido (preserva guestName por linha) */}
                            {editItems.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Pedido atual</p>
                                    <div className="space-y-1">
                                        {editItems.map((it, idx) => (
                                            <div key={idx} className="flex items-center gap-3 py-1.5 border-b border-border/20 last:border-0">
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button onClick={() => changeQty(idx, -1)}
                                                        className="w-7 h-7 rounded-lg bg-secondary hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center text-muted-foreground transition-colors">
                                                        <Minus size={13} />
                                                    </button>
                                                    <span className="font-black text-primary bg-primary/10 min-w-[2rem] h-7 flex items-center justify-center rounded-lg text-sm px-1">
                                                        {it.quantity}×
                                                    </span>
                                                    <button onClick={() => changeQty(idx, 1)}
                                                        className="w-7 h-7 rounded-lg bg-secondary hover:bg-green-500/20 hover:text-green-400 flex items-center justify-center text-muted-foreground transition-colors">
                                                        <Plus size={13} />
                                                    </button>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-bold text-sm block leading-snug">{it.name}</span>
                                                    {it.flavor && <span className="text-xs text-amber-400/80 block">Sabor: {it.flavor}</span>}
                                                    {it.guestName && <span className="text-xs text-primary/70 block">→ {it.guestName}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Seção 2: catálogo para adicionar novos itens */}
                            {(() => {
                                const activeItems = menuItems.filter(mi => mi.active);
                                const catMap = new Map(categories.map(c => [c.id, c]));
                                const alacarte = activeItems.filter(mi => !mi.categoryId || !catMap.has(mi.categoryId));
                                const catGroups = categories
                                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                                    .map(c => ({ cat: c, items: activeItems.filter(mi => mi.categoryId === c.id) }))
                                    .filter(g => g.items.length > 0);
                                const allGroups = [
                                    ...(alacarte.length > 0 ? [{ label: 'À la carte', items: alacarte }] : []),
                                    ...catGroups.map(g => ({ label: g.cat.name, items: g.items })),
                                ];

                                if (activeItems.length === 0) return null;

                                return (
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Adicionar item</p>
                                        <div className="space-y-4">
                                            {allGroups.map(({ label, items }) => (
                                                <div key={label}>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">{label}</p>
                                                    <div className="space-y-1">
                                                        {items.map(mi => {
                                                            const hasFlavors = mi.flavors && mi.flavors.length > 0;
                                                            const isExpanded = expandedFlavors === mi.id;
                                                            return (
                                                                <div key={mi.id} className="border-b border-border/15 last:border-0">
                                                                    <div className="flex items-center gap-3 py-1">
                                                                        <button
                                                                            onClick={() => {
                                                                                if (hasFlavors) {
                                                                                    setExpandedFlavors(isExpanded ? null : mi.id);
                                                                                } else {
                                                                                    setEditItems(prev => [...prev, {
                                                                                        menuItemId: mi.id,
                                                                                        name: mi.name,
                                                                                        quantity: 1,
                                                                                        unitPrice: mi.price ?? 0,
                                                                                        totalPrice: mi.price ?? 0,
                                                                                    }]);
                                                                                }
                                                                            }}
                                                                            className={cn(
                                                                                "w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0",
                                                                                isExpanded
                                                                                    ? "bg-primary/20 text-primary"
                                                                                    : "bg-secondary hover:bg-green-500/20 hover:text-green-400 text-muted-foreground"
                                                                            )}
                                                                        >
                                                                            <Plus size={13} />
                                                                        </button>
                                                                        <span className="flex-1 text-sm text-muted-foreground">{mi.name}</span>
                                                                        {hasFlavors && (
                                                                            <span className="text-[10px] text-muted-foreground/50 shrink-0">escolher sabor</span>
                                                                        )}
                                                                        {mi.price != null && mi.price > 0 && (
                                                                            <span className="text-xs text-muted-foreground/60 font-mono shrink-0">
                                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mi.price)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {isExpanded && hasFlavors && (
                                                                        <div className="ml-10 mb-2 flex flex-wrap gap-1.5">
                                                                            {mi.flavors!.map(f => (
                                                                                <button
                                                                                    key={f.name}
                                                                                    onClick={() => {
                                                                                        setEditItems(prev => [...prev, {
                                                                                            menuItemId: mi.id,
                                                                                            name: mi.name,
                                                                                            quantity: 1,
                                                                                            unitPrice: mi.price ?? 0,
                                                                                            totalPrice: mi.price ?? 0,
                                                                                            flavor: f.name,
                                                                                        }]);
                                                                                        setExpandedFlavors(null);
                                                                                    }}
                                                                                    className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-primary/20 hover:text-primary text-xs font-bold text-muted-foreground border border-border/50 transition-colors"
                                                                                >
                                                                                    {f.name}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Observações editáveis */}
                            <div className="mt-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">Observações</p>
                                <textarea
                                    value={editObs}
                                    onChange={e => setEditObs(e.target.value)}
                                    placeholder="Adicionar observações..."
                                    rows={3}
                                    className="w-full bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-amber-500/50 resize-none"
                                />
                            </div>
                        </div>
                    ) : (
                        /* ── MODO VISUALIZAÇÃO ── */
                        <>
                            <ItemsByCategoryScreen groups={groups} />

                            {obs && obs.notes && (
                                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">Observações</p>
                                    <p className="text-sm text-foreground whitespace-pre-wrap">{obs.notes}</p>
                                </div>
                            )}

                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total</span>
                                <span className="font-black text-lg text-primary">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.totalPrice)}
                                </span>
                            </div>
                        </>
                    )}
                </div>

                {/* Actions */}
                <div className="p-4 border-t border-border bg-secondary/30 space-y-3">
                    {editing ? (
                        /* ── Botões modo edição ── */
                        <div className="flex gap-2">
                            <button
                                onClick={() => setEditing(false)}
                                className="flex-1 py-3 rounded-xl font-bold text-sm border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60 transition-all"
                            >
                                <Save size={15} />
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    ) : (
                        /* ── Botões modo visualização ── */
                        <>
                            <div className="grid grid-cols-3 gap-2">
                                <button onClick={() => onStatusChange(order.id, 'pending')} disabled={order.status === 'pending'}
                                    className="py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-wider border border-yellow-500/30 text-yellow-600 hover:bg-yellow-500/10 disabled:opacity-30 transition-colors">
                                    Pendente
                                </button>
                                <button onClick={() => onStatusChange(order.id, 'preparing')} disabled={order.status === 'preparing'}
                                    className="py-2.5 bg-blue-500/10 text-blue-400 rounded-xl font-bold text-[11px] uppercase tracking-wider border border-blue-500/30 hover:bg-blue-500/20 disabled:opacity-30 transition-colors">
                                    Preparo
                                </button>
                                <button onClick={() => onStatusChange(order.id, 'delivered')} disabled={order.status === 'delivered'}
                                    className="py-2.5 bg-green-500/10 text-green-400 rounded-xl font-bold text-[11px] uppercase tracking-wider border border-green-500/30 hover:bg-green-500/20 disabled:opacity-30 transition-colors">
                                    Pronto
                                </button>
                            </div>
                            <button onClick={enterDuplicate}
                                className="w-full py-3 rounded-xl font-bold text-sm border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2">
                                <Copy size={15} /> Duplicar para amanhã
                            </button>
                            <div className="flex gap-2">
                                <button onClick={enterEdit}
                                    className="flex-1 py-3 rounded-xl font-bold text-sm border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2">
                                    <Pencil size={15} /> Editar pedido
                                </button>
                                <button onClick={handlePrint} disabled={printing}
                                    className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60 transition-all">
                                    <Printer size={15} />
                                    {printing ? 'Imprimindo...' : 'Imprimir'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FBOrdersPage() {
    const { currentProperty } = useProperty();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<FBOrder[]>([]);
    const [stays, setStays] = useState<{ [stayId: string]: StayInfo }>({});
    const [categories, setCategories] = useState<FBCategory[]>([]);
    const [menuItems, setMenuItems] = useState<FBMenuItem[]>([]);

    const [dateFilter, setDateFilter] = useState<"yesterday" | "today" | "tomorrow">("today");
    const [typeFilter, setTypeFilter] = useState<"all" | "breakfast" | "restaurant">("all");

    const [selectedOrder, setSelectedOrder] = useState<FBOrder | null>(null);
    const [pendingDuplicate, setPendingDuplicate] = useState(false);
    const [printA4Mode, setPrintA4Mode] = useState(false);

    useEffect(() => {
        if (currentProperty) loadOrders();
    }, [currentProperty, dateFilter, typeFilter]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (currentProperty) loadOrders(false);
        }, 30000);
        return () => clearInterval(interval);
    }, [currentProperty, dateFilter, typeFilter]);

    async function loadOrders(showLoader = true) {
        if (!currentProperty) return;
        if (showLoader) setLoading(true);
        try {
            const targetDate = new Date();
            if (dateFilter === "yesterday") targetDate.setDate(targetDate.getDate() - 1);
            if (dateFilter === "tomorrow") targetDate.setDate(targetDate.getDate() + 1);
            const isoDate = targetDate.toISOString().split('T')[0];

            const filters: any = { date: isoDate };
            if (typeFilter !== "all") filters.type = typeFilter;

            const [fetchedOrders, cats, itms] = await Promise.all([
                fbService.getOrders(currentProperty.id, filters),
                fbService.getCategories(currentProperty.id),
                fbService.getMenuItems(currentProperty.id),
            ]);

            setOrders(fetchedOrders);
            setCategories(cats.filter(c => c.type === 'both' || c.type === 'breakfast').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
            setMenuItems(itms);

            const newStays = { ...stays };
            let changed = false;
            for (const order of fetchedOrders) {
                if (order.stayId && !newStays[order.stayId]) {
                    try {
                        const info = await StayService.getStayWithGuestAndCabin(currentProperty.id, order.stayId);
                        if (info) {
                            newStays[order.stayId] = {
                                cabinName: info.cabin?.name || "N/A",
                                guestName: info.guest?.fullName || "Desconhecido",
                            };
                            changed = true;
                        }
                    } catch { /* ignore */ }
                }
            }
            if (changed) setStays(newStays);
        } catch {
            toast.error("Erro ao carregar pedidos.");
        } finally {
            if (showLoader) setLoading(false);
        }
    }

    async function updateStatus(id: string, newStatus: FBOrder['status']) {
        try {
            await fbService.updateOrderStatus(id, newStatus);
            toast.success("Status atualizado!");
            setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
            setSelectedOrder(prev => prev?.id === id ? { ...prev, status: newStatus } : prev);
        } catch {
            toast.error("Erro ao atualizar status.");
        }
    }

    const handlePrintA4 = () => {
        setPrintA4Mode(true);
        setTimeout(() => {
            window.print();
            setTimeout(() => setPrintA4Mode(false), 600);
        }, 250);
    };

    const targetDateObj = new Date();
    if (dateFilter === "yesterday") targetDateObj.setDate(targetDateObj.getDate() - 1);
    if (dateFilter === "tomorrow") targetDateObj.setDate(targetDateObj.getDate() + 1);

    if (loading) return (
        <div className="flex justify-center p-24">
            <Loader2 className="animate-spin text-primary" size={40} />
        </div>
    );

    // Pre-compute groups for selected order (modal + thermal print)
    const selectedOrderGroups = selectedOrder
        ? groupByCategory(getRegularItems(selectedOrder), categories, menuItems)
        : [];

    return (
        <div className="space-y-6 print:bg-white print:text-black print:p-0 print:space-y-0">

            {/* ── IMPRESSÃO A4 ── */}
            {printA4Mode && (
                <div className="hidden print:block font-sans text-black p-8">
                    <div className="flex justify-between items-start mb-6 pb-4" style={{ borderBottom: '2px solid #000' }}>
                        <div>
                            <h1 style={{ fontSize: '20px', fontWeight: 900, textTransform: 'uppercase' }}>{currentProperty?.name}</h1>
                            <h2 style={{ fontSize: '15px', fontWeight: 700 }}>Lista de Pedidos de Café da Manhã</h2>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '12px' }}>
                            <div style={{ fontWeight: 700 }}>
                                {targetDateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                            </div>
                            <div style={{ color: '#555' }}>
                                Impresso em {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>

                    {orders.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>Nenhum pedido para esta data.</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #000' }}>
                                    {['Cabana', 'Horário', 'Itens', 'Obs.', 'Status'].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '6px 8px 6px 0', fontWeight: 900, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.08em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...orders]
                                    .sort((a, b) => (a.deliveryTime ?? '').localeCompare(b.deliveryTime ?? ''))
                                    .map((order, idx) => {
                                        const stayData = order.stayId ? stays[order.stayId] : undefined;
                                        const cabin = stayData?.cabinName || order.cabinName || 'N/A';
                                        const obs = getObservations(order);
                                        const groups = groupByCategory(getRegularItems(order), categories, menuItems);
                                        const statusLabels: Record<string, string> = { pending: 'Pendente', preparing: 'Preparando', delivered: 'Entregue', cancelled: 'Cancelado' };
                                        return (
                                            <tr key={order.id} style={{ background: idx % 2 === 0 ? '#f9f9f9' : '#fff', borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                                                <td style={{ padding: '8px 8px 8px 0', fontWeight: 900, fontSize: '13px' }}>{cabin}</td>
                                                <td style={{ padding: '8px 8px 8px 0', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{order.deliveryTime ?? '—'}</td>
                                                <td style={{ padding: '8px 8px 8px 0' }}>
                                                    {groups.map(({ label, items }) => (
                                                        <div key={label} style={{ marginBottom: '4px' }}>
                                                            <strong style={{ fontSize: '10px', textTransform: 'uppercase', color: '#555' }}>{label}:</strong>
                                                            {items.map((it: any, i: number) => (
                                                                <div key={i} style={{ paddingLeft: '8px' }}>
                                                                    {it.quantity}× {it.name}
                                                                    {it.flavor ? ` (${it.flavor})` : ''}
                                                                    {it.guestName ? ` → ${it.guestName}` : ''}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </td>
                                                <td style={{ padding: '8px 8px 8px 0', fontSize: '11px', color: '#555', maxWidth: '120px' }}>{obs?.notes ?? '—'}</td>
                                                <td style={{ padding: '8px 0', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{statusLabels[order.status] ?? order.status}</td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #000' }}>
                                    <td colSpan={3} style={{ paddingTop: '8px', fontWeight: 700, fontSize: '12px' }}>
                                        Total: {orders.length} pedido{orders.length !== 1 ? 's' : ''}
                                    </td>
                                    <td colSpan={2} style={{ paddingTop: '8px', fontWeight: 900, fontSize: '12px', textAlign: 'right' }}>
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orders.reduce((s, o) => s + o.totalPrice, 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            )}

            {/* ── TELA ── */}
            <div className="print:hidden space-y-6">
                {/* Filtros */}
                <div className="flex flex-col lg:flex-row gap-3 justify-between bg-card border border-border p-3 rounded-3xl shadow-sm">
                    <div className="flex bg-secondary p-1 rounded-2xl w-full lg:w-auto">
                        {(['yesterday', 'today', 'tomorrow'] as const).map(d => (
                            <button key={d} onClick={() => setDateFilter(d)}
                                className={cn("flex-1 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all",
                                    dateFilter === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                )}>
                                {d === 'yesterday' ? 'Ontem' : d === 'today' ? 'Hoje' : 'Amanhã'}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-secondary p-1 rounded-2xl">
                            {(['all', 'breakfast', 'restaurant'] as const).map(t => (
                                <button key={t} onClick={() => setTypeFilter(t)}
                                    className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all",
                                        typeFilter === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}>
                                    {t === 'all' ? 'Todos' : t === 'breakfast' ? 'Café' : 'Restaurante'}
                                </button>
                            ))}
                        </div>
                        <button onClick={handlePrintA4}
                            className="p-2.5 text-muted-foreground hover:text-primary bg-secondary rounded-xl transition-colors shrink-0 flex items-center gap-1.5 px-3 text-xs font-bold uppercase tracking-widest"
                            title="Imprimir lista A4">
                            <FileText size={15} /> A4
                        </button>
                        <button onClick={() => loadOrders()} className="p-2.5 text-muted-foreground hover:text-primary bg-secondary rounded-xl transition-colors shrink-0" title="Atualizar">
                            <RefreshCcw size={16} />
                        </button>
                    </div>
                </div>

                {/* Título */}
                <div className="flex items-center gap-3">
                    <CalendarDays className="text-primary" size={22} />
                    <h2 className="text-lg font-black uppercase tracking-tight">
                        Pedidos para: {targetDateObj.toLocaleDateString("pt-BR")}
                    </h2>
                    <span className="text-sm text-muted-foreground font-mono">({orders.length})</span>
                </div>

                {/* Cards */}
                {orders.length === 0 ? (
                    <div className="text-center p-16 bg-card border border-border rounded-3xl border-dashed">
                        <Package className="mx-auto h-12 w-12 text-muted-foreground opacity-40 mb-4" />
                        <p className="text-lg font-bold">Nenhum pedido encontrado.</p>
                        <p className="text-muted-foreground text-sm mt-1">Aguardando novos pedidos para esta data.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {orders.map(order => {
                            const stayData = order.stayId ? stays[order.stayId] : undefined;
                            const guestName = stayData?.guestName || order.guestName || '—';
                            const cabinName = stayData?.cabinName || order.cabinName || 'N/A';
                            const obs = getObservations(order);
                            const groups = groupByCategory(getRegularItems(order), categories, menuItems);

                            return (
                                <div
                                    key={order.id}
                                    onClick={() => setSelectedOrder(order)}
                                    className={cn(
                                        "bg-card border border-border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 active:scale-[0.99]",
                                        order.status === 'delivered' ? 'opacity-55 hover:opacity-100' : ''
                                    )}
                                >
                                    {/* Header do card */}
                                    <div className="p-4 border-b border-border">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="min-w-0">
                                                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">
                                                    {order.type === 'breakfast' ? 'Café da Manhã' : 'Restaurante'} • {order.modality}
                                                </p>
                                                <h3 className="text-xl font-black tracking-tight leading-none break-words">{cabinName}</h3>
                                                <p className="text-xs text-muted-foreground mt-1 truncate">{guestName}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <StatusBadge status={order.status} />
                                                {order.deliveryTime && (
                                                    <span className="flex items-center gap-1 font-mono font-bold text-sm text-foreground">
                                                        <Clock size={13} className="text-primary" />{order.deliveryTime}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Itens por categoria */}
                                    <div className="px-4 py-3 flex-1">
                                        <ItemsByCategoryScreen groups={groups} />
                                        {obs && obs.notes && (
                                            <div className="mt-2 pt-2 border-t border-border/40">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-0.5">Obs.</p>
                                                <p className="text-xs text-foreground/80 line-clamp-2">{obs.notes}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <div className="px-4 py-3 border-t border-border bg-secondary/20 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground font-mono">#{order.id.substring(0, 6).toUpperCase()}</span>
                                            <button
                                                onClick={e => { e.stopPropagation(); setSelectedOrder(order); setPendingDuplicate(true); }}
                                                className="p-1 rounded-lg hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                                                title="Duplicar para amanhã"
                                            >
                                                <Copy size={13} />
                                            </button>
                                        </div>
                                        <span className="font-black text-primary text-sm">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.totalPrice)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Modal de detalhe ── */}
            {selectedOrder && (
                <OrderDetailModal
                    order={selectedOrder}
                    stayInfo={selectedOrder.stayId ? stays[selectedOrder.stayId] : undefined}
                    propertyName={currentProperty?.name ?? ''}
                    groups={selectedOrderGroups}
                    categories={categories}
                    menuItems={menuItems}
                    deliveryTimes={currentProperty?.settings?.fbSettings?.breakfast?.delivery?.deliveryTimes ?? []}
                    onClose={() => { setSelectedOrder(null); setPendingDuplicate(false); }}
                    onStatusChange={updateStatus}
                    onOrderUpdated={(updated) => {
                        setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
                        setSelectedOrder(updated);
                    }}
                    onOrderDuplicated={(created) => {
                        if (dateFilter === 'tomorrow') {
                            setOrders(prev => [created, ...prev]);
                        }
                    }}
                    autoEnterDuplicate={pendingDuplicate}
                />
            )}
        </div>
    );
}
