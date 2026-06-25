"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, MessageSquare, ShoppingBag, Calendar, X, ChevronRight } from "lucide-react";
import { createClientBrowser } from "@/lib/supabase-browser";
import { useProperty } from "@/context/PropertyContext";
import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import { NOTIFICATION_VISIBLE_ROLES, NOTIFICATION_ALERT_ROLES, hasAnyRole } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

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

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr + 'T12:00:00'), "d/M", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

// ─── Browser notification helper ─────────────────────────────────────────────

async function requestBrowserPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function fireBrowserNotification(title: string, body: string, onClick?: () => void) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      icon: '/logo_flat.png',
      tag: 'aura-message',
    });
    if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); };
  } catch { /* ignore */ }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationCenter() {
  const { currentProperty: property } = useProperty();
  const { refetch: refetchNotifCounts } = useNotifications();
  const { userData } = useAuth();
  const router = useRouter();
  const supabase = createClientBrowser();
  const panelRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [open, setOpen] = useState(false);
  const [whatsapp, setWhatsapp] = useState<WhatsAppNotif[]>([]);
  const [concierge, setConcierge] = useState<ConciergeNotif[]>([]);
  const [bookings, setBookings] = useState<BookingNotif[]>([]);

  // Track previous counts to detect new arrivals
  const prevWhatsappIds = useRef<Set<string>>(new Set());
  const prevConciergeCount = useRef(0);
  const prevBookingsCount = useRef(0);
  const initialized = useRef(false);

  // Coalescência (anti-parede): acumula chegadas e dispara um único toast por rajada
  const waBuffer = useRef<WhatsAppNotif[]>([]);
  const waTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conciergeBuffer = useRef<ConciergeNotif[]>([]);
  const conciergeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookingsBuffer = useRef<BookingNotif[]>([]);
  const bookingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSoundAt = useRef(0);

  const propertyId = property?.id;

  // ─── Roteamento por cargo ─────────────────────────────────────────────────────
  // canSeeBell: vê o sininho/painel (canal passivo). canAlert: recebe toast/som/navegador.
  const canSeeBell = hasAnyRole(userData?.role, userData?.secondaryRoles, NOTIFICATION_VISIBLE_ROLES);
  const canAlert = hasAnyRole(userData?.role, userData?.secondaryRoles, NOTIFICATION_ALERT_ROLES);

  // ─── Audio ──────────────────────────────────────────────────────────────────

  const playSound = useCallback(() => {
    // Rate-limit: no máximo um som a cada 4s, mesmo numa rajada
    const now = Date.now();
    if (now - lastSoundAt.current < 4000) return;
    lastSoundAt.current = now;
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/notification.mp3');
        audioRef.current.volume = 0.5;
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => { /* autoplay blocked */ });
    } catch { /* ignore */ }
  }, []);

  // ─── Flush coalescido (um toast por rajada, id estável → substitui em vez de empilhar) ──

  const flushWhatsapp = useCallback(() => {
    const items = waBuffer.current;
    waBuffer.current = [];
    waTimer.current = null;
    if (items.length === 0) return;

    playSound();

    let title: string;
    let description: string;
    if (items.length === 1) {
      const m = items[0];
      const sender = m.cabinName || 'Hóspede';
      title = `💬 ${sender}`;
      description = m.body.length > 80 ? m.body.slice(0, 80) + '…' : m.body;
    } else {
      title = `💬 ${items.length} novas mensagens`;
      description = 'Toque para ver as conversas';
    }

    toast.message(title, {
      id: 'notif-whatsapp',
      description,
      duration: 8000,
      action: { label: 'Ver', onClick: () => router.push('/admin/comunicacao') },
    });

    if (document.visibilityState !== 'visible') {
      fireBrowserNotification(title, description, () => router.push('/admin/comunicacao'));
    }
  }, [playSound, router]);

  const flushConcierge = useCallback(() => {
    const items = conciergeBuffer.current;
    conciergeBuffer.current = [];
    conciergeTimer.current = null;
    if (items.length === 0) return;

    playSound();

    let title: string;
    let description: string;
    if (items.length === 1) {
      const r = items[0];
      title = `🛎️ Novo pedido de concierge`;
      description = `${r.quantity}x ${r.itemName}${r.cabinName ? ` — ${r.cabinName}` : ''}`;
    } else {
      title = `🛎️ ${items.length} novos pedidos de concierge`;
      description = 'Toque para ver os pedidos';
    }

    toast.message(title, {
      id: 'notif-concierge',
      description,
      duration: 8000,
      action: { label: 'Ver', onClick: () => router.push('/admin/concierge') },
    });

    if (document.visibilityState !== 'visible') {
      fireBrowserNotification(title, description, () => router.push('/admin/concierge'));
    }
  }, [playSound, router]);

  const flushBookings = useCallback(() => {
    const items = bookingsBuffer.current;
    bookingsBuffer.current = [];
    bookingsTimer.current = null;
    if (items.length === 0) return;

    playSound();

    let title: string;
    let description: string;
    if (items.length === 1) {
      const b = items[0];
      title = `📅 Novo agendamento pendente`;
      description = `${b.structureName}${b.guestName ? ` — ${b.guestName}` : ''}: ${b.startTime}–${b.endTime}`;
    } else {
      title = `📅 ${items.length} novos agendamentos`;
      description = 'Toque para ver os agendamentos';
    }

    toast.message(title, {
      id: 'notif-bookings',
      description,
      duration: 8000,
      action: { label: 'Ver', onClick: () => router.push('/admin/core/structures/bookings') },
    });

    if (document.visibilityState !== 'visible') {
      fireBrowserNotification(title, description, () => router.push('/admin/core/structures/bookings'));
    }
  }, [playSound, router]);

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

    const enriched: WhatsAppNotif[] = data.map((m: any) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      cabinName: stayMap[m.stayId] || undefined,
    }));

    // Detect genuinely new messages (not present before) → buffer + debounce
    if (initialized.current && canAlert) {
      const newMessages = enriched.filter(m => !prevWhatsappIds.current.has(m.id));
      if (newMessages.length > 0) {
        waBuffer.current.push(...newMessages);
        if (waTimer.current) clearTimeout(waTimer.current);
        waTimer.current = setTimeout(flushWhatsapp, 1500);
      }
    }

    prevWhatsappIds.current = new Set(enriched.map(m => m.id));
    setWhatsapp(enriched);
  }, [propertyId, supabase, canAlert, flushWhatsapp]);

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

    const enriched = data.map((r: any) => ({
      id: r.id,
      itemName: itemMap[r.itemId] || 'Item',
      quantity: r.quantity,
      cabinName: cabinMap[r.cabinId] || undefined,
      createdAt: r.createdAt,
    }));

    if (initialized.current && canAlert && enriched.length > prevConciergeCount.current) {
      const delta = enriched.length - prevConciergeCount.current;
      conciergeBuffer.current.push(...enriched.slice(enriched.length - delta));
      if (conciergeTimer.current) clearTimeout(conciergeTimer.current);
      conciergeTimer.current = setTimeout(flushConcierge, 1500);
    }

    prevConciergeCount.current = enriched.length;
    setConcierge(enriched);
  }, [propertyId, supabase, canAlert, flushConcierge]);

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

    const enriched = data.map((b: any) => ({
      id: b.id,
      structureName: structureMap[b.structureId] || 'Estrutura',
      startTime: b.startTime,
      endTime: b.endTime,
      date: b.date,
      guestName: b.guestName || stayGuestMap[b.stayId] || undefined,
      createdAt: b.createdAt,
    }));

    if (initialized.current && canAlert && enriched.length > prevBookingsCount.current) {
      const delta = enriched.length - prevBookingsCount.current;
      bookingsBuffer.current.push(...enriched.slice(enriched.length - delta));
      if (bookingsTimer.current) clearTimeout(bookingsTimer.current);
      bookingsTimer.current = setTimeout(flushBookings, 1500);
    }

    prevBookingsCount.current = enriched.length;
    setBookings(enriched);
  }, [propertyId, supabase, canAlert, flushBookings]);

  // ─── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!propertyId || !canSeeBell) return;
    Promise.all([fetchWhatsapp(), fetchConcierge(), fetchBookings()]).then(() => {
      initialized.current = true;
    });
  }, [propertyId, canSeeBell, fetchWhatsapp, fetchConcierge, fetchBookings]);

  // ─── Request browser notification permission (only roles that get alerts) ───

  useEffect(() => {
    if (!canAlert) return;
    requestBrowserPermission();
  }, [canAlert]);

  // ─── Cleanup dos timers de coalescência ─────────────────────────────────────

  useEffect(() => {
    return () => {
      if (waTimer.current) clearTimeout(waTimer.current);
      if (conciergeTimer.current) clearTimeout(conciergeTimer.current);
      if (bookingsTimer.current) clearTimeout(bookingsTimer.current);
    };
  }, []);

  // ─── Realtime subscriptions ─────────────────────────────────────────────────

  useEffect(() => {
    if (!propertyId || !canSeeBell) return;

    const msgChannel = supabase
      .channel(`notif_messages_${propertyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `propertyId=eq.${propertyId}` }, (payload: any) => {
        // Só reage a mensagens recebidas; ignora o fluxo automatizado de saída (e seus status)
        const direction = payload.new?.direction ?? payload.old?.direction;
        if (direction !== 'inbound') return;
        fetchWhatsapp();
      })
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
  }, [propertyId, canSeeBell, supabase, fetchWhatsapp, fetchConcierge, fetchBookings]);

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

  // ─── Mark all WhatsApp messages as read ────────────────────────────────────

  const markAllRead = useCallback(async () => {
    if (!propertyId) return;
    try {
      await fetch('/api/admin/notifications/mark-read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true, propertyId }),
      });
      setWhatsapp([]);
      refetchNotifCounts();
    } catch { /* silent */ }
  }, [propertyId, refetchNotifCounts]);

  const handleOpen = () => {
    setOpen(prev => {
      const next = !prev;
      if (next && whatsapp.length > 0) {
        markAllRead();
      }
      return next;
    });
  };

  // ─── Badge count ────────────────────────────────────────────────────────────

  const total = whatsapp.length + concierge.length + bookings.length;

  // ─── Tab blinking when there are unread notifications ───────────────────────

  useEffect(() => {
    if (total === 0 || !canAlert) return;

    const originalTitle = document.title;
    const alertTitle = `(${total}) Nova mensagem — Aura`;
    let blinkState = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startBlinking = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        document.title = blinkState ? alertTitle : originalTitle;
        blinkState = !blinkState;
      }, 1000);
    };

    const stopBlinking = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      document.title = originalTitle;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        startBlinking();
      } else {
        stopBlinking();
      }
    };

    if (document.hidden) {
      startBlinking();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopBlinking();
    };
  }, [total, canAlert]);

  // ─── Navigate helpers ───────────────────────────────────────────────────────

  const goTo = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!propertyId || !canSeeBell) return null;

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
        <Bell size={18} className={cn(total > 0 && !open && "animate-[wiggle_1s_ease-in-out_infinite]")} />
        {total > 0 && (
          <>
            {/* Ping ring */}
            <span className="absolute -top-1 -right-1 flex h-[18px] w-[18px]">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full leading-none">
                {total > 99 ? '99+' : total}
              </span>
            </span>
          </>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-black tracking-tight">Notificações</span>
            <div className="flex items-center gap-2">
              {whatsapp.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
                >
                  Limpar mensagens
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={16} />
              </button>
            </div>
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
