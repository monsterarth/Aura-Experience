// src/app/admin/cafe-salao/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { BreakfastSalonService } from "@/services/breakfast-salon-service";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/auth/RoleGuard";
import {
  BreakfastSession, BreakfastAttendance, BreakfastTable,
  BreakfastVisitor, FBOrder, FBMenuItem, FBCategory
} from "@/types/aura";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Users, UtensilsCrossed, ChefHat, Search, Plus, X,
  LogIn, ArrowRight, LogOut, Coffee, Check, Loader2,
  MoveRight, Ban, RotateCcw, UserPlus, Layers
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

type WaiterTab = "lista" | "salao" | "cozinha";

interface TableWithGuests extends BreakfastTable {
  attendances: BreakfastAttendance[];
  visitors: BreakfastVisitor[];
}

// ==========================================
// HELPERS
// ==========================================

const STATUS_LABEL: Record<string, string> = {
  expected: "Esperado",
  arrived: "Chegou",
  seated: "Sentado",
  left: "Saiu",
  absent: "Ausente",
  inactive: "Inativo",
};
const STATUS_COLOR: Record<string, string> = {
  expected: "bg-blue-500/10 text-blue-400",
  arrived: "bg-yellow-500/10 text-yellow-400",
  seated: "bg-green-500/10 text-green-400",
  left: "bg-foreground/10 text-foreground/40",
  absent: "bg-foreground/10 text-foreground/30",
  inactive: "bg-red-500/10 text-red-400",
};
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  preparing: "Preparando",
  delivered: "Entregue",
  cancelled: "Cancelado",
};
const ORDER_STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  confirmed: "bg-blue-500/10 text-blue-400",
  preparing: "bg-orange-500/10 text-orange-400",
  delivered: "bg-green-500/10 text-green-400",
  cancelled: "bg-foreground/10 text-foreground/30",
};

// ==========================================
// WAITER ORDER DIALOG
// ==========================================

function WaiterOrderDialog({
  propertyId,
  tables,
  attendances,
  onClose,
  onSubmit,
}: {
  propertyId: string;
  tables: BreakfastTable[];
  attendances: BreakfastAttendance[];
  onClose: () => void;
  onSubmit: (tableId: string, attendanceId: string | null, items: any[]) => Promise<void>;
}) {
  const [categories, setCategories] = useState<FBCategory[]>([]);
  const [menuItems, setMenuItems] = useState<FBMenuItem[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [selectedAttendanceId, setSelectedAttendanceId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('fb_categories').select('*').eq('propertyId', propertyId).in('type', ['breakfast', 'both']).eq('ala_carte', true).then(({ data }: { data: FBCategory[] | null }) => setCategories((data || []) as FBCategory[]));
    supabase.from('fb_menu_items').select('*').eq('propertyId', propertyId).eq('active', true).then(({ data }: { data: FBMenuItem[] | null }) => setMenuItems((data || []) as FBMenuItem[]));
  }, [propertyId]);

  const openTables = tables.filter(t => t.status === 'open');
  const tableAttendances = attendances.filter(a => a.tableId === selectedTableId && a.status === 'seated');

  const toggle = (itemId: string) => {
    setSelections(prev => ({ ...prev, [itemId]: prev[itemId] ? 0 : 1 }));
  };

  const handleSubmit = async () => {
    if (!selectedTableId) return toast.error("Selecione uma mesa.");
    const items = menuItems
      .filter(i => selections[i.id])
      .map(i => ({ menuItemId: i.id, name: i.name, quantity: 1, unitPrice: i.price || 0 }));
    if (!items.length) return toast.error("Selecione ao menos 1 item.");
    setSubmitting(true);
    try {
      await onSubmit(selectedTableId, selectedAttendanceId, items);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/60 backdrop-blur-sm">
      <div className="bg-background w-full rounded-t-[28px] max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5">
          <h2 className="font-black text-foreground">Novo Pedido</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Mesa */}
          <div>
            <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">Mesa</p>
            <div className="flex flex-wrap gap-2">
              {openTables.map(t => (
                <button key={t.id} onClick={() => { setSelectedTableId(t.id); setSelectedAttendanceId(null); }}
                  className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all", selectedTableId === t.id ? "bg-primary text-black border-primary" : "bg-secondary border-border text-foreground/60")}
                >{t.name}</button>
              ))}
              {openTables.length === 0 && <p className="text-xs text-foreground/30">Nenhuma mesa aberta</p>}
            </div>
          </div>

          {/* Hóspede (opcional) */}
          {selectedTableId && tableAttendances.length > 0 && (
            <div>
              <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">Hóspede (opcional)</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setSelectedAttendanceId(null)} className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all", !selectedAttendanceId ? "bg-primary/10 border-primary text-primary" : "bg-secondary border-border text-foreground/60")}>
                  Mesa geral
                </button>
                {tableAttendances.map(a => (
                  <button key={a.id} onClick={() => setSelectedAttendanceId(a.id)}
                    className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all", selectedAttendanceId === a.id ? "bg-primary/10 border-primary text-primary" : "bg-secondary border-border text-foreground/60")}
                  >{a.guestName}</button>
                ))}
              </div>
            </div>
          )}

          {/* Itens */}
          {categories.map(cat => {
            const catItems = menuItems.filter(i => i.categoryId === cat.id);
            if (!catItems.length) return null;
            return (
              <div key={cat.id}>
                <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">{cat.name}</p>
                <div className="space-y-2">
                  {catItems.map(item => (
                    <button key={item.id} onClick={() => toggle(item.id)}
                      className={cn("w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-all", selections[item.id] ? "bg-primary/10 border-primary/40" : "bg-secondary border-border")}
                    >
                      <span className="text-sm font-bold text-foreground">{item.name}</span>
                      {selections[item.id] ? <Check size={16} className="text-primary shrink-0" /> : <Plus size={16} className="text-foreground/30 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/5">
          <button onClick={handleSubmit} disabled={submitting || !selectedTableId}
            className="w-full py-4 bg-primary text-black font-black uppercase tracking-widest text-xs rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <ChefHat size={16} />}
            Enviar para Cozinha
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ASSIGN TABLE DIALOG
// ==========================================

function AssignTableDialog({
  attendance,
  tables,
  session,
  propertyId,
  actorName,
  onClose,
  onAssigned,
}: {
  attendance: BreakfastAttendance;
  tables: BreakfastTable[];
  session: BreakfastSession;
  propertyId: string;
  actorName: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [newTableName, setNewTableName] = useState("");
  const [loading, setLoading] = useState(false);

  const openTables = tables.filter(t => t.status === 'open');

  const handleAssign = async (tableId: string) => {
    setLoading(true);
    try {
      await BreakfastSalonService.assignTable(attendance.id, tableId);
      onAssigned();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAndAssign = async () => {
    if (!newTableName.trim()) return;
    setLoading(true);
    try {
      const table = await BreakfastSalonService.createTable(propertyId, session.id, newTableName.trim(), actorName);
      await BreakfastSalonService.assignTable(attendance.id, table.id);
      onAssigned();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/60 backdrop-blur-sm">
      <div className="bg-background w-full rounded-t-[28px] p-5 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-foreground">Sentar — {attendance.guestName}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl"><X size={18} /></button>
        </div>

        {openTables.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest">Mesas abertas</p>
            {openTables.map(t => (
              <button key={t.id} onClick={() => handleAssign(t.id)} disabled={loading}
                className="w-full flex items-center justify-between p-3 bg-secondary hover:bg-white/5 border border-border rounded-2xl transition-all"
              >
                <span className="font-bold text-foreground">{t.name}</span>
                <ArrowRight size={16} className="text-foreground/30" />
              </button>
            ))}
          </div>
        )}

        <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">Nova mesa</p>
        <div className="flex gap-2">
          <input value={newTableName} onChange={e => setNewTableName(e.target.value)}
            placeholder="Nome da mesa (ex: Mesa Varanda)"
            className="flex-1 bg-secondary border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-primary/50 text-foreground"
            onKeyDown={e => e.key === 'Enter' && handleCreateAndAssign()}
          />
          <button onClick={handleCreateAndAssign} disabled={loading || !newTableName.trim()}
            className="px-4 py-3 bg-primary text-black rounded-2xl font-black disabled:opacity-40"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// VISITOR DIALOG
// ==========================================

function VisitorDialog({
  tables,
  session,
  propertyId,
  actorName,
  onClose,
  onAdded,
}: {
  tables: BreakfastTable[];
  session: BreakfastSession;
  propertyId: string;
  actorName: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [tableId, setTableId] = useState("");
  const [newTableName, setNewTableName] = useState("");
  const [loading, setLoading] = useState(false);

  const openTables = tables.filter(t => t.status === 'open');

  const handleAdd = async () => {
    if (!name.trim()) return toast.error("Informe o nome do visitante.");
    let targetTableId = tableId;

    if (!targetTableId && newTableName.trim()) {
      const table = await BreakfastSalonService.createTable(propertyId, session.id, newTableName.trim(), actorName);
      targetTableId = table.id;
    }
    if (!targetTableId) return toast.error("Selecione ou crie uma mesa.");

    setLoading(true);
    try {
      await BreakfastSalonService.addVisitor(propertyId, session.id, targetTableId, name.trim());
      onAdded();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/60 backdrop-blur-sm">
      <div className="bg-background w-full rounded-t-[28px] p-5 space-y-4 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-foreground">Adicionar Visitante</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl"><X size={18} /></button>
        </div>

        <div>
          <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-1">Nome</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do visitante"
            className="w-full bg-secondary border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-primary/50 text-foreground" />
        </div>

        <div>
          <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest mb-2">Mesa</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {openTables.map(t => (
              <button key={t.id} onClick={() => setTableId(t.id)}
                className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all", tableId === t.id ? "bg-primary text-black border-primary" : "bg-secondary border-border text-foreground/60")}
              >{t.name}</button>
            ))}
          </div>
          {!tableId && (
            <input value={newTableName} onChange={e => setNewTableName(e.target.value)} placeholder="Ou criar nova mesa..."
              className="w-full bg-secondary border border-border rounded-2xl px-4 py-3 text-sm outline-none focus:border-primary/50 text-foreground" />
          )}
        </div>

        <button onClick={handleAdd} disabled={loading || !name.trim()}
          className="w-full py-4 bg-primary text-black font-black uppercase tracking-widest text-xs rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          Adicionar
        </button>
      </div>
    </div>
  );
}

// ==========================================
// MAIN PAGE
// ==========================================

export default function CafeSalaoPage() {
  const { userData } = useAuth();
  const { currentProperty: contextProperty } = useProperty();

  const [activeTab, setActiveTab] = useState<WaiterTab>("lista");
  const [session, setSession] = useState<BreakfastSession | null>(null);
  const [attendances, setAttendances] = useState<BreakfastAttendance[]>([]);
  const [tables, setTables] = useState<BreakfastTable[]>([]);
  const [visitors, setVisitors] = useState<BreakfastVisitor[]>([]);
  const [orders, setOrders] = useState<FBOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialog states
  const [assignTarget, setAssignTarget] = useState<BreakfastAttendance | null>(null);
  const [moveTarget, setMoveTarget] = useState<BreakfastAttendance | null>(null);
  const [visitorDialogOpen, setVisitorDialogOpen] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);

  const propertyId = contextProperty?.id ?? "";
  const actorName = userData?.fullName ?? "Garçom";
  const today = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR });

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
        setAttendances(att);
        setTables(tbls);
        setVisitors(vis);
        setOrders(ords);
      }
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime
  useEffect(() => {
    if (!propertyId) return;
    const channel = supabase.channel(`cafe_salao_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'breakfast_attendance', filter: `propertyId=eq.${propertyId}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'breakfast_tables', filter: `propertyId=eq.${propertyId}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'breakfast_visitors', filter: `propertyId=eq.${propertyId}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fb_orders', filter: `propertyId=eq.${propertyId}` }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [propertyId, loadData]);

  const handleOpenSalon = async () => {
    const sess = await BreakfastSalonService.openSession(propertyId, actorName);
    setSession(sess);
    toast.success("Salão aberto!");
    loadData();
  };

  const handleCloseSalon = async () => {
    if (!session) return;
    await BreakfastSalonService.closeSession(session.id);
    setSession(prev => prev ? { ...prev, status: 'closed' } : null);
    toast.success("Salão fechado.");
  };

  const handlePlaceOrder = async (tableId: string, attendanceId: string | null, items: any[]) => {
    const att = attendances.find(a => a.id === attendanceId);
    await BreakfastSalonService.placeWaiterOrder(
      propertyId,
      att?.stayId ?? null,
      tableId,
      attendanceId,
      items,
      userData?.id ?? "waiter",
      actorName
    );
    toast.success("Pedido enviado para a cozinha!");
    loadData();
  };

  const pendingOrdersCount = orders.filter(o => o.status === 'pending').length;

  const filteredAttendances = attendances.filter(a =>
    a.guestName.toLowerCase().includes(search.toLowerCase()) ||
    a.cabinName.toLowerCase().includes(search.toLowerCase())
  );

  // Group tables with guests
  const tablesWithGuests: TableWithGuests[] = tables.map(t => ({
    ...t,
    attendances: attendances.filter(a => a.tableId === t.id && a.status === 'seated'),
    visitors: visitors.filter(v => v.tableId === t.id),
  }));

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="animate-spin text-primary" size={32} />
    </div>
  );

  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception", "kitchen", "waiter"]}>
      <div className="flex flex-col h-screen bg-background max-w-md mx-auto">

        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-foreground flex items-center gap-2">
                <Coffee className="text-primary" size={20} /> Café Salão
              </h1>
              <p className="text-[10px] text-foreground/30 capitalize">{today}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOrderDialogOpen(true)}
                disabled={!session || session.status !== 'open'}
                className="p-2.5 bg-primary/10 text-primary rounded-xl disabled:opacity-30"
                title="Novo pedido"
              >
                <ChefHat size={16} />
              </button>
              {session?.status === 'open' ? (
                <button onClick={handleCloseSalon}
                  className="px-3 py-2 bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-xl">
                  Fechar
                </button>
              ) : (
                <button onClick={handleOpenSalon}
                  className="px-3 py-2 bg-green-500/10 text-green-400 text-[10px] font-black uppercase tracking-widest rounded-xl">
                  Abrir
                </button>
              )}
            </div>
          </div>

          {session && (
            <div className={cn("mt-2 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest inline-block",
              session.status === 'open' ? "bg-green-500/10 text-green-400" : "bg-foreground/5 text-foreground/30"
            )}>
              {session.status === 'open' ? "● Salão Aberto" : "○ Salão Fechado"}
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ===== ABA LISTA ===== */}
          {activeTab === "lista" && (
            <div className="p-4 space-y-3">
              {/* Search + visitor button */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar hóspede ou cabana..."
                    className="w-full pl-9 pr-3 py-2.5 bg-secondary border border-border rounded-2xl text-sm outline-none focus:border-primary/50 text-foreground placeholder:text-foreground/30" />
                </div>
                <button onClick={() => setVisitorDialogOpen(true)} disabled={!session || session.status !== 'open'}
                  className="p-2.5 bg-secondary border border-border rounded-2xl text-foreground/50 hover:text-foreground disabled:opacity-30">
                  <UserPlus size={16} />
                </button>
              </div>

              {/* Attendance cards */}
              {filteredAttendances.length === 0 && (
                <div className="text-center py-12 text-foreground/20">
                  <Users size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-bold">Nenhum hóspede na lista</p>
                  <p className="text-xs mt-1">O cron das 8h preenche automaticamente</p>
                </div>
              )}

              {filteredAttendances.map(a => (
                <div key={a.id} className="bg-secondary border border-white/5 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-foreground truncate">{a.guestName}</p>
                      <p className="text-[11px] text-foreground/40">{a.cabinName}
                        {a.additionalGuests?.length ? ` · +${a.additionalGuests.length}` : ""}
                      </p>
                      {a.tableId && (
                        <p className="text-[10px] text-green-400 font-bold mt-0.5">
                          {tables.find(t => t.id === a.tableId)?.name ?? "Mesa"}
                        </p>
                      )}
                    </div>
                    <span className={cn("text-[9px] font-black px-2 py-1 rounded-full uppercase shrink-0", STATUS_COLOR[a.status])}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {a.status === 'expected' && (
                      <button onClick={async () => { await BreakfastSalonService.checkInGuest(a.id); loadData(); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500/10 text-yellow-400 text-[10px] font-bold rounded-xl">
                        <LogIn size={12} /> Check-in
                      </button>
                    )}
                    {a.status === 'arrived' && (
                      <button onClick={() => setAssignTarget(a)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-500/10 text-green-400 text-[10px] font-bold rounded-xl">
                        <UtensilsCrossed size={12} /> Sentar
                      </button>
                    )}
                    {a.status === 'seated' && (
                      <button onClick={() => setMoveTarget(a)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded-xl">
                        <MoveRight size={12} /> Trocar Mesa
                      </button>
                    )}
                    {(a.status === 'arrived' || a.status === 'seated') && (
                      <button onClick={async () => { await BreakfastSalonService.guestLeft(a.id); loadData(); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-foreground/5 text-foreground/40 text-[10px] font-bold rounded-xl">
                        <LogOut size={12} /> Saiu
                      </button>
                    )}
                    {a.status !== 'inactive' && a.status !== 'left' && (
                      <button onClick={async () => { await BreakfastSalonService.deactivateBreakfast(a.id); loadData(); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-500/5 text-red-400/60 text-[10px] font-bold rounded-xl">
                        <Ban size={12} /> Desativar
                      </button>
                    )}
                    {(a.status === 'inactive' || a.status === 'left') && (
                      <button onClick={async () => { await BreakfastSalonService.reactivateBreakfast(a.id); loadData(); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary text-[10px] font-bold rounded-xl">
                        <RotateCcw size={12} /> Reativar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ===== ABA SALÃO ===== */}
          {activeTab === "salao" && (
            <div className="p-4 space-y-3">
              {/* Create table button */}
              <button
                onClick={async () => {
                  const name = prompt("Nome da mesa:");
                  if (name?.trim() && session) {
                    await BreakfastSalonService.createTable(propertyId, session.id, name.trim(), actorName);
                    loadData();
                    toast.success("Mesa criada!");
                  }
                }}
                disabled={!session || session.status !== 'open'}
                className="w-full flex items-center justify-center gap-2 py-3 bg-secondary border border-dashed border-white/10 text-foreground/40 rounded-2xl text-sm font-bold hover:border-primary/30 hover:text-primary disabled:opacity-30 transition-all"
              >
                <Plus size={16} /> Nova Mesa
              </button>

              {tablesWithGuests.length === 0 && (
                <div className="text-center py-12 text-foreground/20">
                  <Layers size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-bold">Nenhuma mesa criada</p>
                </div>
              )}

              {tablesWithGuests.map(t => (
                <div key={t.id} className={cn("bg-secondary border rounded-2xl p-4", t.status === 'open' ? "border-white/5" : "border-white/5 opacity-60")}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full", t.status === 'open' ? "bg-green-400" : "bg-foreground/20")} />
                      <p className="font-black text-foreground">{t.name}</p>
                    </div>
                    <button
                      onClick={async () => {
                        if (t.status === 'open') await BreakfastSalonService.closeTable(t.id);
                        else await BreakfastSalonService.reopenTable(t.id);
                        loadData();
                      }}
                      className="text-[9px] font-black uppercase tracking-widest text-foreground/30 hover:text-foreground transition-colors"
                    >
                      {t.status === 'open' ? "Fechar" : "Reabrir"}
                    </button>
                  </div>

                  {(t.attendances.length + t.visitors.length) === 0 && (
                    <p className="text-xs text-foreground/20 text-center py-2">Mesa vazia</p>
                  )}

                  <div className="space-y-1.5">
                    {t.attendances.map(a => (
                      <div key={a.id} className="flex items-center justify-between bg-background/40 rounded-xl px-3 py-2">
                        <div>
                          <p className="text-sm font-bold text-foreground">{a.guestName}</p>
                          <p className="text-[10px] text-foreground/40">{a.cabinName}</p>
                        </div>
                        <button onClick={() => setMoveTarget(a)}
                          className="p-1.5 hover:bg-white/5 rounded-lg text-foreground/30 hover:text-foreground transition-colors">
                          <MoveRight size={14} />
                        </button>
                      </div>
                    ))}
                    {t.visitors.map(v => (
                      <div key={v.id} className="flex items-center justify-between bg-background/40 rounded-xl px-3 py-2">
                        <div>
                          <p className="text-sm font-bold text-foreground">{v.name}</p>
                          <p className="text-[10px] text-foreground/40">Visitante</p>
                        </div>
                        <button onClick={async () => { await BreakfastSalonService.removeVisitor(v.id); loadData(); }}
                          className="p-1.5 hover:bg-red-500/10 rounded-lg text-foreground/30 hover:text-red-400 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ===== ABA COZINHA ===== */}
          {activeTab === "cozinha" && (
            <div className="p-4 space-y-3">
              {orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length === 0 && (
                <div className="text-center py-12 text-foreground/20">
                  <ChefHat size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-bold">Nenhum pedido ativo</p>
                </div>
              )}
              {orders
                .filter(o => o.status !== 'delivered' && o.status !== 'cancelled')
                .map(o => {
                  const table = tables.find(t => t.id === o.tableId);
                  return (
                    <div key={o.id} className="bg-secondary border border-white/5 rounded-2xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-black text-foreground text-sm">{table?.name ?? "Mesa"}</p>
                          <p className="text-[10px] text-foreground/40">
                            {format(new Date(o.createdAt), "HH:mm")} · {o.requestedBy === 'guest' ? 'Hóspede' : 'Garçom'}
                          </p>
                        </div>
                        <span className={cn("text-[9px] font-black px-2 py-1 rounded-full uppercase", ORDER_STATUS_COLOR[o.status])}>
                          {ORDER_STATUS_LABEL[o.status]}
                        </span>
                      </div>
                      <div className="space-y-1 mb-3">
                        {o.items.map((item, i) => (
                          <p key={i} className="text-xs text-foreground/70">· {item.name} {item.quantity > 1 ? `×${item.quantity}` : ''}</p>
                        ))}
                      </div>
                      {o.status === 'preparing' && (
                        <button onClick={async () => { await BreakfastSalonService.updateOrderStatus(o.id, 'delivered'); loadData(); }}
                          className="w-full py-2.5 bg-green-500/10 text-green-400 text-[10px] font-black uppercase rounded-xl flex items-center justify-center gap-1">
                          <Check size={12} /> Retirado da Cozinha
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="border-t border-white/5 bg-background/95 backdrop-blur-sm">
          <div className="flex">
            {([
              { tab: "lista", icon: Users, label: "Lista" },
              { tab: "salao", icon: UtensilsCrossed, label: "Salão" },
              { tab: "cozinha", icon: ChefHat, label: "Cozinha", badge: pendingOrdersCount },
            ] as any[]).map(({ tab, icon: Icon, label, badge }) => (
              <button key={tab} onClick={() => setActiveTab(tab as WaiterTab)}
                className={cn("flex-1 flex flex-col items-center gap-1 py-3 relative transition-colors",
                  activeTab === tab ? "text-primary" : "text-foreground/30"
                )}>
                <div className="relative">
                  <Icon size={22} />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dialogs */}
        {assignTarget && session && (
          <AssignTableDialog
            attendance={assignTarget}
            tables={tables}
            session={session}
            propertyId={propertyId}
            actorName={actorName}
            onClose={() => setAssignTarget(null)}
            onAssigned={() => { loadData(); setAssignTarget(null); }}
          />
        )}
        {moveTarget && session && (
          <AssignTableDialog
            attendance={moveTarget}
            tables={tables}
            session={session}
            propertyId={propertyId}
            actorName={actorName}
            onClose={() => setMoveTarget(null)}
            onAssigned={() => { loadData(); setMoveTarget(null); }}
          />
        )}
        {visitorDialogOpen && session && (
          <VisitorDialog
            tables={tables}
            session={session}
            propertyId={propertyId}
            actorName={actorName}
            onClose={() => setVisitorDialogOpen(false)}
            onAdded={() => { loadData(); setVisitorDialogOpen(false); }}
          />
        )}
        {orderDialogOpen && session && (
          <WaiterOrderDialog
            propertyId={propertyId}
            tables={tables}
            attendances={attendances}
            onClose={() => setOrderDialogOpen(false)}
            onSubmit={handlePlaceOrder}
          />
        )}
      </div>
    </RoleGuard>
  );
}
