"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog } from "@/components/aura/Dialog";
import { useIsMobile } from "@/components/aura/hooks";
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
  contactId?: string;
  cabinName?: string;
  stayId?: string;
}

interface ConciergeNotif {
  id: string;
  itemName: string;
  quantity: number;
  cabinName?: string;
  notes?: string;
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

function fireBrowserNotification(
  title: string,
  body: string,
  onClick?: () => void,
  opts?: { tag?: string; requireInteraction?: boolean }
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      icon: '/logo_flat.png',
      tag: opts?.tag ?? 'aura-message',
      requireInteraction: opts?.requireInteraction ?? false,
    });
    if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); };
  } catch { /* ignore */ }
}

// Intervalo do re-alerta de concierge enquanto houver pendentes (canal veemente)
const CONCIERGE_REMIND_MS = 2 * 60_000;

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationCenter() {
  const { currentProperty: property } = useProperty();
  const { counts, refetch: refetchNotifCounts } = useNotifications();
  const { userData } = useAuth();
  const router = useRouter();
  const supabase = createClientBrowser();
  const panelRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const [whatsapp, setWhatsapp] = useState<WhatsAppNotif[]>([]);
  const [concierge, setConcierge] = useState<ConciergeNotif[]>([]);
  const [bookings, setBookings] = useState<BookingNotif[]>([]);
  const [clearingWa, setClearingWa] = useState(false);

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

  // Lista viva para o loop de re-alerta (sem reiniciar o timer a cada fetch)
  const conciergeRef = useRef<ConciergeNotif[]>([]);
  conciergeRef.current = concierge;

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

  // Som URGENTE do concierge: campainha dupla sintetizada (WebAudio), mais alta e
  // fora do rate-limit comum — o balcão precisa ouvir mesmo no meio de uma rajada
  // de mensagens.
  const playUrgentSound = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
      const ding = (freq: number, at: number, dur = 0.22) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + dur + 0.05);
      };
      // "ding-dong" ×2 — recepção de balcão
      ding(987.77, 0); ding(783.99, 0.24);
      ding(987.77, 0.62); ding(783.99, 0.86);
      window.setTimeout(() => { ctx.close().catch(() => {}); }, 2200);
    } catch {
      // Fallback: mp3 padrão no volume máximo
      try {
        const a = new Audio('/notification.mp3');
        a.volume = 1;
        a.play().catch(() => {});
      } catch { /* ignore */ }
    }
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

    playUrgentSound();

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

    // Persistente de propósito: pedido de hóspede não pode se perder no meio dos
    // toasts de mensagem — só sai clicando, atendendo ou zerando a fila.
    toast.warning(title, {
      id: 'notif-concierge',
      description,
      duration: Infinity,
      action: { label: 'Atender', onClick: () => router.push('/admin/concierge') },
    });

    if (document.visibilityState !== 'visible') {
      fireBrowserNotification(title, description, () => router.push('/admin/concierge'), {
        tag: 'aura-concierge',
        requireInteraction: true,
      });
    }
  }, [playUrgentSound, router]);

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
      action: { label: 'Ver', onClick: () => router.push('/admin/estruturas/bookings') },
    });

    if (document.visibilityState !== 'visible') {
      fireBrowserNotification(title, description, () => router.push('/admin/estruturas/bookings'));
    }
  }, [playSound, router]);

  // ─── Fetch functions ────────────────────────────────────────────────────────

  const fetchWhatsapp = useCallback(async () => {
    if (!propertyId) return;
    const { data } = await supabase
      .from('messages')
      .select('id, body, createdAt, stayId, contactId')
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
      contactId: m.contactId || undefined,
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
      .select('id, itemId, quantity, cabinId, notes, createdAt')
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
      notes: r.notes || undefined,
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

  // ─── Re-alerta de concierge: enquanto houver pendente, relembra a cada 2 min ──
  // Toast persistente + campainha + notificação do navegador (aba oculta). Pausa
  // quando o balcão já está na tela de concierge.

  const hasConcierge = concierge.length > 0;

  useEffect(() => {
    if (!canAlert) return;
    if (!hasConcierge) {
      toast.dismiss('notif-concierge');
      return;
    }

    const interval = setInterval(() => {
      const items = conciergeRef.current;
      if (items.length === 0) return;
      if (window.location.pathname.startsWith('/admin/concierge')) return;

      const oldest = items[0]; // fetch ordena por createdAt asc
      const waitedMin = Math.max(1, Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / 60_000));
      const title = items.length === 1
        ? '🛎️ Pedido de concierge aguardando'
        : `🛎️ ${items.length} pedidos de concierge aguardando`;
      const description = `O mais antigo espera há ${waitedMin} min. Toque para atender.`;

      playUrgentSound();
      toast.warning(title, {
        id: 'notif-concierge',
        description,
        duration: Infinity,
        action: { label: 'Atender', onClick: () => router.push('/admin/concierge') },
      });
      if (document.visibilityState !== 'visible') {
        fireBrowserNotification(title, description, () => router.push('/admin/concierge'), {
          tag: 'aura-concierge',
          requireInteraction: true,
        });
      }
    }, CONCIERGE_REMIND_MS);

    return () => clearInterval(interval);
  }, [canAlert, hasConcierge, playUrgentSound, router]);

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
  // Só limpa o estado local quando o servidor CONFIRMA — antes, uma falha
  // silenciosa fazia o painel fingir que limpou e tudo voltava no F5.

  const markAllRead = useCallback(async () => {
    if (!propertyId || clearingWa) return;
    setClearingWa(true);
    try {
      const res = await fetch('/api/admin/notifications/mark-read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true, propertyId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWhatsapp([]);
      prevWhatsappIds.current = new Set();
      refetchNotifCounts();
    } catch {
      toast.error('Não foi possível limpar as mensagens. Tente novamente.');
    } finally {
      setClearingWa(false);
    }
  }, [propertyId, clearingWa, refetchNotifCounts]);

  const handleOpen = () => setOpen(prev => !prev);

  // ─── Badge count ────────────────────────────────────────────────────────────
  // WhatsApp entra como UMA notificação agregada ("N novas mensagens"), para o
  // volume de mensagens não afogar concierge e agendamentos no sino.

  const waCount = Math.max(counts.messages, whatsapp.length);
  const total = (waCount > 0 ? 1 : 0) + concierge.length + bookings.length;

  // ─── Tab blinking when there are unread notifications ───────────────────────

  useEffect(() => {
    if (total === 0 || !canAlert) return;

    const originalTitle = document.title;
    const alertTitle = `(${total}) Notificações — Aura`;
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

  // ─── WhatsApp aggregate preview ─────────────────────────────────────────────

  const waConvCount = new Set(whatsapp.map(m => m.contactId || m.id)).size;
  const waNames = Array.from(new Set(whatsapp.map(m => m.cabinName).filter(Boolean))) as string[];
  const waSubtitle = waNames.length > 0
    ? `${waNames.slice(0, 2).join(', ')}${waConvCount > 2 ? ` e mais ${waConvCount - 2} conversa${waConvCount - 2 > 1 ? 's' : ''}` : ''}`
    : `${waConvCount}${whatsapp.length >= 20 ? '+' : ''} conversa${waConvCount !== 1 ? 's' : ''} — toque para abrir`;

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!propertyId || !canSeeBell) return null;

  const panelBody = (
          <div className={isMobile ? "" : "max-h-[480px] overflow-y-auto"}>
            {total === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Bell size={28} className="mx-auto mb-2 opacity-30" />
                Tudo em dia!
              </div>
            ) : (
              <>
                {/* Concierge section — primeiro e com destaque: é o que o balcão não pode perder */}
                {concierge.length > 0 && (
                  <NotifSection
                    icon={<ShoppingBag size={14} className="text-orange-500" />}
                    label="Concierge"
                    count={concierge.length}
                    accent="orange"
                    onViewAll={() => goTo('/admin/concierge')}
                  >
                    {concierge.map(r => (
                      <NotifRow
                        key={r.id}
                        title={r.cabinName || 'Pedido'}
                        subtitle={`${r.quantity}x ${r.itemName}${r.notes ? ` · ${r.notes}` : ''}`}
                        time={timeAgo(r.createdAt)}
                        accent="orange"
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
                    onViewAll={() => goTo('/admin/estruturas/bookings')}
                  >
                    {bookings.map(b => (
                      <NotifRow
                        key={b.id}
                        title={b.structureName}
                        subtitle={`${b.guestName ? b.guestName + ' · ' : ''}${b.startTime}–${b.endTime} · ${formatDate(b.date)}`}
                        time={timeAgo(b.createdAt)}
                        onClick={() => goTo('/admin/estruturas/bookings')}
                      />
                    ))}
                  </NotifSection>
                )}

                {/* WhatsApp — agregado numa única notificação */}
                {waCount > 0 && (
                  <NotifSection
                    icon={<MessageSquare size={14} className="text-green-500" />}
                    label="WhatsApp"
                    count={waCount}
                    onViewAll={() => goTo('/admin/comunicacao')}
                  >
                    <NotifRow
                      title={`${waCount} nova${waCount > 1 ? 's' : ''} mensage${waCount > 1 ? 'ns' : 'm'}`}
                      subtitle={waSubtitle}
                      time={whatsapp[0] ? timeAgo(whatsapp[0].createdAt) : ''}
                      onClick={() => goTo('/admin/comunicacao')}
                    />
                  </NotifSection>
                )}
              </>
            )}
          </div>
  );

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
            {/* Ping ring — laranja quando há concierge esperando (prioridade do balcão) */}
            <span className="absolute -top-1 -right-1 flex h-[18px] w-[18px]">
              <span className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-60",
                concierge.length > 0 ? "bg-orange-500" : "bg-red-500"
              )} />
              <span className={cn(
                "relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-white text-[10px] font-black rounded-full leading-none",
                concierge.length > 0 ? "bg-orange-500" : "bg-red-500"
              )}>
                {total > 99 ? '99+' : total}
              </span>
            </span>
          </>
        )}
      </button>

      {/* Panel */}
      {open && !isMobile && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-black tracking-tight">Notificações</span>
            <div className="flex items-center gap-2">
              {waCount > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={clearingWa}
                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide disabled:opacity-50"
                >
                  {clearingWa ? 'Limpando…' : 'Limpar mensagens'}
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {panelBody}
        </div>
      )}

      {/* Celular: mesmo conteúdo num sheet de baixo (o dropdown de 320px não cabe) */}
      <Dialog
        open={open && isMobile}
        onClose={() => setOpen(false)}
        presentation="sheet"
        size="md"
        title="Notificações"
        bodyPad={0}
        headerActions={waCount > 0 ? (
          <button onClick={markAllRead} disabled={clearingWa} className="ak-press" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t-brand-text)', padding: '6px 8px' }}>
            {clearingWa ? 'Limpando…' : 'Limpar mensagens'}
          </button>
        ) : undefined}
      >
        {panelBody}
      </Dialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NotifSection({
  icon, label, count, onViewAll, children, accent
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  onViewAll: () => void;
  children: React.ReactNode;
  accent?: 'orange';
}) {
  return (
    <div className={cn(
      "border-b border-border last:border-b-0",
      accent === 'orange' && "bg-orange-500/[0.06]"
    )}>
      <button
        onClick={onViewAll}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/40 transition-colors group"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className={cn(
            "text-[11px] font-black uppercase tracking-widest",
            accent === 'orange' ? "text-orange-500" : "text-muted-foreground"
          )}>{label}</span>
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            accent === 'orange' ? "bg-orange-500/15 text-orange-500" : "bg-muted"
          )}>{count}</span>
        </div>
        <ChevronRight size={12} className="text-muted-foreground group-hover:text-foreground transition-colors" />
      </button>
      <div className="pb-1">{children}</div>
    </div>
  );
}

function NotifRow({ title, subtitle, time, onClick, accent }: {
  title: string;
  subtitle: string;
  time: string;
  onClick: () => void;
  accent?: 'orange';
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-bold truncate", accent === 'orange' && "text-orange-400")}>{title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">{time}</span>
    </button>
  );
}
