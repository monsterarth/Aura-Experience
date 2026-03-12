// src/app/admin/cafe-salao/kds/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { BreakfastSalonService } from "@/services/breakfast-salon-service";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { BreakfastSession, BreakfastTable, FBOrder } from "@/types/aura";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { ChefHat, Printer, Check, Clock, Loader2, Coffee } from "lucide-react";

// ==========================================
// HELPERS
// ==========================================

const STATUS_CONFIG = {
  pending:   { label: "PENDENTE",   bg: "bg-yellow-500/10", border: "border-yellow-500/40", text: "text-yellow-400", dot: "bg-yellow-400" },
  confirmed: { label: "CONFIRMADO", bg: "bg-blue-500/10",   border: "border-blue-500/40",   text: "text-blue-400",   dot: "bg-blue-400" },
  preparing: { label: "PREPARANDO", bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-400", dot: "bg-orange-400" },
  delivered: { label: "PRONTO",     bg: "bg-green-500/10",  border: "border-green-500/40",  text: "text-green-400",  dot: "bg-green-400" },
  cancelled: { label: "CANCELADO",  bg: "bg-foreground/5",  border: "border-white/5",        text: "text-foreground/30", dot: "bg-foreground/20" },
};

// ==========================================
// ORDER CARD
// ==========================================

function OrderCard({
  order,
  tableName,
  onAccept,
  onReady,
  onPrint,
}: {
  order: FBOrder;
  tableName: string;
  onAccept: () => void;
  onReady: () => void;
  onPrint: () => void;
}) {
  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const minutesAgo = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);

  return (
    <div className={cn("rounded-[20px] border p-5 flex flex-col gap-4 transition-all", config.bg, config.border)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-black text-foreground tracking-tight">{tableName}</p>
          <div className="flex items-center gap-2 mt-1">
            <Clock size={12} className="text-foreground/30" />
            <span className="text-xs text-foreground/40">{minutesAgo}min · {format(new Date(order.createdAt), "HH:mm")}</span>
            <span className="text-[9px] text-foreground/30 uppercase">· {order.requestedBy === 'guest' ? 'Hóspede' : 'Garçom'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("w-2.5 h-2.5 rounded-full animate-pulse", config.dot)} />
          <span className={cn("text-[10px] font-black uppercase tracking-widest", config.text)}>{config.label}</span>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {order.items.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-6 h-6 bg-white/5 rounded-lg flex items-center justify-center text-xs font-black text-foreground/60">
              {item.quantity}
            </span>
            <span className="text-base font-bold text-foreground">{item.name}</span>
            {item.flavor && <span className="text-xs text-foreground/40">({item.flavor})</span>}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-2 border-t border-white/5">
        {order.status === 'pending' && (
          <button onClick={onAccept}
            className="flex-1 py-3 bg-orange-500 text-white font-black text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 transition-all"
          >
            <ChefHat size={16} /> Aceitar
          </button>
        )}
        {order.status === 'preparing' && (
          <button onClick={onReady}
            className="flex-1 py-3 bg-green-500 text-white font-black text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 transition-all"
          >
            <Check size={16} /> Pronto
          </button>
        )}
        <button onClick={onPrint}
          title="Reimprimir"
          className="p-3 bg-white/5 hover:bg-white/10 text-foreground/40 hover:text-foreground rounded-2xl transition-all"
        >
          <Printer size={16} />
        </button>
      </div>
    </div>
  );
}

// ==========================================
// MAIN PAGE
// ==========================================

export default function KdsPage() {
  const { currentProperty: contextProperty } = useProperty();

  const [session, setSession] = useState<BreakfastSession | null>(null);
  const [tables, setTables] = useState<BreakfastTable[]>([]);
  const [orders, setOrders] = useState<FBOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  const propertyId = contextProperty?.id ?? "";

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
      }
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh fallback every 30s
  useEffect(() => {
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, [loadData]);

  // Realtime
  useEffect(() => {
    if (!propertyId) return;
    const channel = supabase.channel(`kds_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fb_orders', filter: `propertyId=eq.${propertyId}` }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [propertyId, loadData]);

  const handleAccept = async (orderId: string) => {
    await BreakfastSalonService.updateOrderStatus(orderId, 'preparing');
    loadData();
  };

  const handleReady = async (orderId: string) => {
    await BreakfastSalonService.updateOrderStatus(orderId, 'delivered');
    toast.success("Pedido marcado como pronto!");
    loadData();
  };

  const handlePrint = async (orderId: string) => {
    const result = await BreakfastSalonService.printOrder(orderId);
    if (result.queued) toast.info("Impressão na fila. (Impressora não configurada)");
  };

  const visibleOrders = filter === 'active'
    ? orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled')
    : orders;

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const preparingCount = orders.filter(o => o.status === 'preparing').length;

  const tableName = (tableId?: string) => tables.find(t => t.id === tableId)?.name ?? "Mesa";

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "kitchen"]}>
      <div className="min-h-screen bg-background p-4 md:p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Coffee className="text-primary" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">KDS — Cozinha</h1>
              <p className="text-xs text-foreground/30">
                {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                {session && <span className={cn("ml-2 font-bold", session.status === 'open' ? "text-green-400" : "text-foreground/30")}>
                  ● {session.status === 'open' ? 'Salão Aberto' : 'Salão Fechado'}
                </span>}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-3">
            <div className="text-center">
              <p className="text-2xl font-black text-yellow-400">{pendingCount}</p>
              <p className="text-[9px] text-foreground/30 uppercase tracking-widest">Pendentes</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-orange-400">{preparingCount}</p>
              <p className="text-[9px] text-foreground/30 uppercase tracking-widest">Prep.</p>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {(['active', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                filter === f ? "bg-primary text-black" : "bg-secondary text-foreground/40 hover:text-foreground"
              )}>
              {f === 'active' ? 'Ativos' : 'Todos'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="text-center py-24 text-foreground/20">
            <ChefHat size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-black">Nenhum pedido</p>
            <p className="text-sm mt-1">Os pedidos aparecerão aqui em tempo real</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleOrders.map(o => (
              <OrderCard
                key={o.id}
                order={o}
                tableName={tableName(o.tableId)}
                onAccept={() => handleAccept(o.id)}
                onReady={() => handleReady(o.id)}
                onPrint={() => handlePrint(o.id)}
              />
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
