"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, MessageSquare, ShoppingBag, Calendar, X, ChevronRight } from "lucide-react";
import { createClientBrowser } from "@/lib/supabase-browser";
import { useProperty } from "@/context/PropertyContext";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WhatsAppNotif {
  id: string;
  body: string;
  createdAt: string;
  cabinName?: string;
  contactName?: string;
  stayId?: string;
}

interface ConciergeNotif {
  id: string;
  itemName: string;
  quantity: number;
  cabinName?: string;
  createdAt: string;
}

interface BookingNotif {
  id: string;
  structureName: string;
  startTime: string;
  endTime: string;
  date: string;
  guestName?: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string) {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationCenter() {
  const { currentProperty: property } = useProperty();
  const router = useRouter();
  const supabase = createClientBrowser();
  const panelRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [whatsapp, setWhatsapp] = useState<WhatsAppNotif[]>([]);
  const [concierge, setConcierge] = useState<ConciergeNotif[]>([]);
  const [bookings, setBookings] = useState<BookingNotif[]>([]);

  const propertyId = property?.id;

  // ─── Fetch functions ────────────────────────────────────────────────────────

  const fetchWhatsapp = useCallback(async () => {
    if (!propertyId) return;
    const { data } = await supabase
      .from('messages')
      .select('id, body, createdAt, stayId')
      .eq('propertyId', propertyId)
      .eq('direction', 'inbound')
      .eq('isReadByAdmin', false)
      .order('createdAt', { ascending: false })
      .limit(20);

    if (!data) return;

    // Enrich with cabin name via stayId
    const stayIds = Array.from(new Set(data.map((m: any) => m.stayId).filter(Boolean)));
    let stayMap: Record<string, string> = {};
    if (stayIds.length) {
      const { data: stays } = await supabase
        .from('stays')
        .select('id, cabinId')
        .in('id', stayIds);
      const cabinIds = Array.from(new Set((stays || []).map((s: any) => s.cabinId).filter(Boolean)));
      if (cabinIds.length) {
        const { data: cabins } = await supabase
          .from('cabins')
          .select('id, name')
          .in('id', cabinIds);
        const cabinMap: Record<string, string> = Object.fromEntries((cabins || []).map((c: any) => [c.id, c.name]));
        stayMap = Object.fromEntries((stays || []).map((s: any) => [s.id, cabinMap[s.cabinId] || '']));
      }
    }

    setWhatsapp(data.map((m: any) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      cabinName: stayMap[m.stayId] || undefined,
    })));
  }, [propertyId, supabase]);

  const fetchConcierge = useCallback(async () => {
    if (!propertyId) return;
    const { data } = await supabase
      .from('concierge_requests')
      .select('id, itemId, quantity, cabinId, createdAt')
      .eq('propertyId', propertyId)
      .eq('status', 'pending')
      .order('createdAt', { ascending: true })
      .limit(20);

    if (!data) return;

    const itemIds = Array.from(new Set(data.map((r: any) => r.itemId).filter(Boolean)));
    const cabinIds = Array.from(new Set(data.map((r: any) => r.cabinId).filter(Boolean)));

    const [itemsRes, cabinsRes] = await Promise.all([
      itemIds.length ? supabase.from('concierge_items').select('id, name').in('id', itemIds) : Promise.resolve({ data: [] }),
      cabinIds.length ? supabase.from('cabins').select('id, name').in('id', cabinIds) : Promise.resolve({ data: [] }),
    ]);

    const itemMap: Record<string, string> = Object.fromEntries((itemsRes.data || []).map((i: any) => [i.id, i.name]));
    const cabinMap: Record<string, string> = Object.fromEntries((cabinsRes.data || []).map((c: any) => [c.id, c.name]));

    setConcierge(data.map((r: any) => ({
      id: r.id,
      itemName: itemMap[r.itemId] || 'Item',
      quantity: r.quantity,
      cabinName: cabinMap[r.cabinId] || undefined,
      createdAt: r.createdAt,
    })));
  }, [propertyId, supabase]);

  const fetchBookings = useCallback(async () => {
    if (!propertyId) return;
    const { data } = await supabase
      .from('structure_bookings')
      .select('id, structureId, startTime, endTime, date, guestName, stayId, createdAt')
      .eq('propertyId', propertyId)
      .eq('status', 'pending')
      .eq('type', 'booking')
      .order('createdAt', { ascending: true })
      .limit(20);

    if (!data) return;

    const structureIds = Array.from(new Set(data.map((b: any) => b.structureId).filter(Boolean)));
    let structureMap: Record<string, string> = {};
    if (structureIds.length) {
      const { data: structures } = await supabase
        .from('structures')
        .select('id, name')
        .in('id', structureIds);
      structureMap = Object.fromEntries((structures || []).map((s: any) => [s.id, s.name]));
    }

    // Resolve guestName for bookings that have stayId but no guestName
    const stayIds = Array.from(new Set(data.filter((b: any) => b.stayId && !b.guestName).map((b: any) => b.stayId)));
    let stayGuestMap: Record<string, string> = {};
    if (stayIds.length) {
      const { data: stays } = await supabase.from('stays').select('id, guestId').in('id', stayIds);
      const guestIds = Array.from(new Set((stays || []).map((s: any) => s.guestId).filter(Boolean)));
      if (guestIds.length) {
        const { data: guests } = await supabase.from('guests').select('id, fullName').in('id', guestIds);
        const guestMap: Record<string, string> = Object.fromEntries((guests || []).map((g: any) => [g.id, g.fullName]));
        stayGuestMap = Object.fromEntries((stays || []).map((s: any) => [s.id, guestMap[s.guestId] || '']));
      }
    }

    setBookings(data.map((b: any) => ({
      id: b.id,
      structureName: structureMap[b.structureId] || 'Estrutura',
      startTime: b.startTime,
      endTime: b.endTime,
      date: b.date,
      guestName: b.guestName || stayGuestMap[b.stayId] || undefined,
      createdAt: b.createdAt,
    })));
  }, [propertyId, supabase]);

  // ─── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!propertyId) return;
    fetchWhatsapp();
    fetchConcierge();
    fetchBookings();
  }, [propertyId, fetchWhatsapp, fetchConcierge, fetchBookings]);

  // ─── Realtime subscriptions ─────────────────────────────────────────────────

  useEffect(() => {
    if (!propertyId) return;

    const msgChannel = supabase
      .channel(`notif_messages_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `propertyId=eq.${propertyId}` }, fetchWhatsapp)
      .subscribe();

    const conciergeChannel = supabase
      .channel(`notif_concierge_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'concierge_requests', filter: `propertyId=eq.${propertyId}` }, fetchConcierge)
      .subscribe();

    const bookingsChannel = supabase
      .channel(`notif_bookings_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'structure_bookings', filter: `propertyId=eq.${propertyId}` }, fetchBookings)
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(conciergeChannel);
      supabase.removeChannel(bookingsChannel);
    };
  }, [propertyId, supabase, fetchWhatsapp, fetchConcierge, fetchBookings]);

  // ─── Close on click outside ─────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ─── Mark WhatsApp as read when panel opens ─────────────────────────────────

  const markWhatsappRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    try {
      await fetch('/api/admin/notifications/mark-read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: ids }),
      });
      setWhatsapp([]);
    } catch { /* silent */ }
  }, []);

  const handleOpen = () => {
    setOpen(prev => {
      const next = !prev;
      if (next && whatsapp.length > 0) {
        markWhatsappRead(whatsapp.map(m => m.id));
      }
      return next;
    });
  };

  // ─── Badge count ────────────────────────────────────────────────────────────

  const total = whatsapp.length + concierge.length + bookings.length;

  // ─── Navigate helpers ───────────────────────────────────────────────────────

  const goTo = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!propertyId) return null;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-xl transition-all",
          open
            ? "bg-primary/20 text-primary"
            : "text-foreground/40 hover:text-foreground hover:bg-white/5"
        )}
        title="Notificações"
      >
        <Bell size={18} />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center leading-none">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-black tracking-tight">Notificações</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {total === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Bell size={28} className="mx-auto mb-2 opacity-30" />
                Tudo em dia!
              </div>
            ) : (
              <>
                {/* WhatsApp section */}
                {whatsapp.length > 0 && (
                  <NotifSection
                    icon={<MessageSquare size={14} className="text-green-500" />}
                    label="WhatsApp"
                    count={whatsapp.length}
                    onViewAll={() => goTo('/admin/comunicacao')}
                  >
                    {whatsapp.map(m => (
                      <NotifRow
                        key={m.id}
                        title={m.cabinName || 'Hóspede'}
                        subtitle={m.body}
                        time={timeAgo(m.createdAt)}
                        onClick={() => goTo('/admin/comunicacao')}
                      />
                    ))}
                  </NotifSection>
                )}

                {/* Concierge section */}
                {concierge.length > 0 && (
                  <NotifSection
                    icon={<ShoppingBag size={14} className="text-orange-500" />}
                    label="Concierge"
                    count={concierge.length}
                    onViewAll={() => goTo('/admin/concierge')}
                  >
                    {concierge.map(r => (
                      <NotifRow
                        key={r.id}
                        title={r.cabinName || 'Pedido'}
                        subtitle={`${r.quantity}x ${r.itemName}`}
                        time={timeAgo(r.createdAt)}
                        onClick={() => goTo('/admin/concierge')}
                      />
                    ))}
                  </NotifSection>
                )}

                {/* Structure bookings section */}
                {bookings.length > 0 && (
                  <NotifSection
                    icon={<Calendar size={14} className="text-purple-500" />}
                    label="Agendamentos"
                    count={bookings.length}
                    onViewAll={() => goTo('/admin/core/structures/bookings')}
                  >
                    {bookings.map(b => (
                      <NotifRow
                        key={b.id}
                        title={b.structureName}
                        subtitle={`${b.guestName ? b.guestName + ' · ' : ''}${b.startTime}–${b.endTime} · ${formatDate(b.date)}`}
                        time={timeAgo(b.createdAt)}
                        onClick={() => goTo('/admin/core/structures/bookings')}
                      />
                    ))}
                  </NotifSection>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr + 'T12:00:00'), "d/M", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NotifSection({
  icon, label, count, onViewAll, children
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  onViewAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onViewAll}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/40 transition-colors group"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
          <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded-full">{count}</span>
        </div>
        <ChevronRight size={12} className="text-muted-foreground group-hover:text-foreground transition-colors" />
      </button>
      <div className="pb-1">{children}</div>
    </div>
  );
}

function NotifRow({ title, subtitle, time, onClick }: {
  title: string;
  subtitle: string;
  time: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate">{title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">{time}</span>
    </button>
  );
}
