"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "@/components/aura/Dialog";
import { useIsMobile, useMounted } from "@/components/aura/hooks";
import { useOverlayRoot } from "@/components/aura/OverlayProvider";
import { useRouter, usePathname } from "next/navigation";
import { Bell, MessageSquare, ShoppingBag, Calendar, X, ChevronRight, Dog } from "lucide-react";
import { PetExceptionDialog, type PetExceptionItem } from "@/components/admin/PetExceptionDialog";
import { createClientBrowser } from "@/lib/supabase-browser";
import { useProperty } from "@/context/PropertyContext";
import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import { StructureService } from "@/services/structure-service";
import { UrgentAlertCard, type UrgentItem } from "@/components/admin/UrgentAlertCard";
import {
  NOTIFICATION_VISIBLE_ROLES, NOTIFICATION_ALERT_ROLES, hasAnyRole,
  URGENT_REMIND_MS, URGENT_SUPPRESS_MS, URGENT_SUPPRESS_KEY,
} from "@/lib/notifications";
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
  /** Só pedido do HÓSPEDE vai para o card que incomoda; o da camareira segue no sino. */
  requestedBy?: 'guest' | 'maid';
}

interface BookingNotif {
  id: string;
  structureId: string;
  structureName: string;
  /** Necessário para aprovar/recusar direto do card (dispara a faxina de virada). */
  requiresTurnover: boolean;
  startTime: string;
  endTime: string;
  date: string;
  guestName?: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Quanto falta para a chegada. É o prazo real do pedido de exceção: depois que o
 *  hóspede chega, não há mais decisão a tomar — só constrangimento no balcão. */
function chegadaEm(iso: string) {
  const dias = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (isNaN(dias)) return '';
  if (dias < 0) return 'já chegou';
  if (dias === 0) return 'chega hoje';
  if (dias === 1) return 'chega amanhã';
  return `chega em ${dias} dias`;
}

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

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationCenter() {
  const { currentProperty: property } = useProperty();
  const { counts, refetch: refetchNotifCounts } = useNotifications();
  const { userData } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClientBrowser();
  const panelRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  // O card é `position: fixed`, mas a topbar tem backdrop-filter — que vira bloco
  // de contenção e prenderia o fixed dentro dela. Por isso vai de portal.
  const mounted = useMounted();
  const overlayRoot = useOverlayRoot();
  const [whatsapp, setWhatsapp] = useState<WhatsAppNotif[]>([]);
  const [concierge, setConcierge] = useState<ConciergeNotif[]>([]);
  // Fila de exceções à Política Pet. Vermelha e clicável: decidir exigia entrar
  // na estadia, e a pílula lá dentro nunca chamou ninguém.
  const [petExceptions, setPetExceptions] = useState<PetExceptionItem[]>([]);
  const [petExcOpen, setPetExcOpen] = useState<PetExceptionItem | null>(null);
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

  // Concierge e agendamento NÃO abrem toast: quem insiste agora é o card fixo
  // (UrgentAlertCard), que fica na tela até alguém resolver. O flush só cuida do
  // que o card não alcança — a campainha e a notificação do navegador com a aba
  // escondida. Pedido da camareira fica de fora do canal urgente: é trabalho do
  // mensageiro, e continua contando no sino.
  const flushConcierge = useCallback(() => {
    const items = conciergeBuffer.current.filter(r => r.requestedBy !== 'maid');
    conciergeBuffer.current = [];
    conciergeTimer.current = null;
    if (items.length === 0) return;

    playUrgentSound();

    const title = items.length === 1
      ? '🛎️ Novo pedido de concierge'
      : `🛎️ ${items.length} novos pedidos de concierge`;
    const description = items.length === 1
      ? `${items[0].quantity}x ${items[0].itemName}${items[0].cabinName ? ` — ${items[0].cabinName}` : ''}`
      : 'Toque para ver os pedidos';

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

    playUrgentSound();

    const title = items.length === 1
      ? '📅 Novo agendamento pendente'
      : `📅 ${items.length} novos agendamentos`;
    const description = items.length === 1
      ? `${items[0].structureName}${items[0].guestName ? ` — ${items[0].guestName}` : ''}: ${items[0].startTime}–${items[0].endTime}`
      : 'Toque para ver os agendamentos';

    if (document.visibilityState !== 'visible') {
      fireBrowserNotification(title, description, () => router.push('/admin/estruturas/bookings'), {
        tag: 'aura-booking',
        requireInteraction: true,
      });
    }
  }, [playUrgentSound, router]);

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

  const fetchPetExceptions = useCallback(async () => {
    if (!propertyId) return;
    try {
      const res = await fetch(`/api/admin/pet-exceptions?propertyId=${propertyId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPetExceptions(Array.isArray(data.items) ? data.items : []);
    } catch { /* fila vazia não pode derrubar o sino */ }
  }, [propertyId]);

  const fetchConcierge = useCallback(async () => {
    if (!propertyId) return;
    const { data } = await supabase
      .from('concierge_requests')
      .select('id, itemId, quantity, cabinId, notes, createdAt, requestedBy')
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
      requestedBy: r.requestedBy,
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
    // `requiresTurnover` vem junto porque o card aprova/recusa sem passar pela
    // página da agenda — e aprovar sem ele deixaria a faxina de virada para trás.
    let structureMap: Record<string, { name: string; requiresTurnover: boolean }> = {};
    if (structureIds.length) {
      const { data: structures } = await supabase
        .from('structures')
        .select('id, name, requiresTurnover')
        .in('id', structureIds);
      structureMap = Object.fromEntries((structures || []).map((s: any) => [s.id, { name: s.name, requiresTurnover: !!s.requiresTurnover }]));
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
      structureId: b.structureId,
      structureName: structureMap[b.structureId]?.name || 'Estrutura',
      requiresTurnover: structureMap[b.structureId]?.requiresTurnover ?? false,
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
    Promise.all([fetchWhatsapp(), fetchConcierge(), fetchBookings(), fetchPetExceptions()]).then(() => {
      initialized.current = true;
    });
  }, [propertyId, canSeeBell, fetchWhatsapp, fetchConcierge, fetchBookings, fetchPetExceptions]);

  // ─── Request browser notification permission (only roles that get alerts) ───

  useEffect(() => {
    if (!canAlert) return;
    requestBrowserPermission();
  }, [canAlert]);

  // ─── Canal urgente: card fixo + campainha a cada 2 min ──────────────────────
  // A fila do card é pedido de concierge do HÓSPEDE + reserva de estrutura
  // pendente — o que não pode esperar. Some sozinho quando alguém resolve (o
  // realtime derruba o item) e enquanto a recepção já está na página do assunto:
  // insistir por cima da tela onde a pessoa está trabalhando seria só ruído.

  const [nowTick, setNowTick] = useState(() => Date.now());
  const [suppress, setSuppress] = useState<{ until: number; ids: string[] } | null>(null);
  const [busyBooking, setBusyBooking] = useState<string | null>(null);

  // O silêncio é da pessoa, não da aba — sobrevive ao F5.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(URGENT_SUPPRESS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { until: number; ids: string[] };
      if (parsed?.until > Date.now()) setSuppress(parsed);
      else localStorage.removeItem(URGENT_SUPPRESS_KEY);
    } catch { /* ignore */ }
  }, []);

  const urgentItems = useMemo<UrgentItem[]>(() => {
    const onConciergePage = pathname?.startsWith('/admin/concierge') ?? false;
    const onBookingsPage = pathname?.startsWith('/admin/estruturas/bookings') ?? false;
    const fromConcierge: UrgentItem[] = onConciergePage ? [] : concierge
      .filter(r => r.requestedBy !== 'maid')
      .map(r => ({
        id: r.id,
        kind: 'concierge',
        title: r.cabinName || 'Pedido do hóspede',
        detail: `${r.quantity}x ${r.itemName}${r.notes ? ` · ${r.notes}` : ''}`,
        createdAt: r.createdAt,
      }));
    const fromBookings: UrgentItem[] = onBookingsPage ? [] : bookings.map(b => ({
      id: b.id,
      kind: 'booking',
      title: b.structureName,
      detail: `${b.guestName ? b.guestName + ' · ' : ''}${b.startTime}–${b.endTime} · ${formatDate(b.date)}`,
      createdAt: b.createdAt,
    }));
    return [...fromConcierge, ...fromBookings].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [concierge, bookings, pathname]);

  const urgentRef = useRef<UrgentItem[]>([]);
  urgentRef.current = urgentItems;
  const suppressRef = useRef<{ until: number; ids: string[] } | null>(null);
  suppressRef.current = suppress;
  /** Marca que o card saiu por supressão — para ele voltar tocando, não mudo. */
  const ringOnReturn = useRef(false);

  // "Suprimir 5 min" cala só o que JÁ estava na fila: pedido novo fura o silêncio.
  const silenced = !!suppress && nowTick < suppress.until && urgentItems.every(i => suppress.ids.includes(i.id));
  const cardVisible = canAlert && urgentItems.length > 0 && !silenced;

  // Relógio do card ("espera há X min") e vencimento do silêncio.
  useEffect(() => {
    if (!canAlert || urgentItems.length === 0) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [canAlert, urgentItems.length]);

  // Insistência: campainha a cada 2 min enquanto o card estiver na tela.
  useEffect(() => {
    if (!cardVisible) return;
    // Voltou dos 5 minutos: toca. Se quem furou o silêncio foi um pedido novo, o
    // alerta de chegada já tocou — não toca duas vezes.
    if (ringOnReturn.current) {
      ringOnReturn.current = false;
      if (suppressRef.current && Date.now() >= suppressRef.current.until) playUrgentSound();
    }
    const id = setInterval(() => {
      const items = urgentRef.current;
      if (items.length === 0) return;
      const oldest = items[0];
      const waited = Math.max(1, Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / 60_000));
      playUrgentSound();
      setNowTick(Date.now());
      if (document.visibilityState !== 'visible') {
        const title = items.length === 1 ? '🛎️ Hóspede aguardando' : `🛎️ ${items.length} pedidos aguardando`;
        fireBrowserNotification(title, `O mais antigo espera há ${waited} min.`, () => router.push(items[0].kind === 'concierge' ? '/admin/concierge' : '/admin/estruturas/bookings'), {
          tag: 'aura-urgent',
          requireInteraction: true,
        });
      }
    }, URGENT_REMIND_MS);
    return () => clearInterval(id);
  }, [cardVisible, playUrgentSound, router]);

  const suppressUrgent = useCallback(() => {
    const payload = { until: Date.now() + URGENT_SUPPRESS_MS, ids: urgentRef.current.map(i => i.id) };
    setSuppress(payload);
    setNowTick(Date.now());
    ringOnReturn.current = true;
    try { localStorage.setItem(URGENT_SUPPRESS_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
    toast.message('Alerta silenciado por 5 minutos.', {
      description: 'Pedido novo volta a avisar na hora.',
      duration: 4000,
    });
  }, []);

  // Aprovar/recusar direto do card — mesmo caminho da agenda (automação de
  // confirmação ao hóspede e faxina de virada saem daqui do mesmo jeito).
  const decideBooking = useCallback(async (id: string, status: 'approved' | 'rejected') => {
    const b = bookings.find(x => x.id === id);
    if (!b || !propertyId || !userData) return;
    setBusyBooking(id);
    try {
      await StructureService.updateBookingStatus(
        propertyId, id, status, userData.id, userData.fullName, b.requiresTurnover, b.structureId
      );
      setBookings(prev => prev.filter(x => x.id !== id));
      prevBookingsCount.current = Math.max(0, prevBookingsCount.current - 1);
      refetchNotifCounts();
      toast.success(status === 'approved' ? 'Reserva aprovada.' : 'Reserva recusada.');
    } catch {
      toast.error('Não foi possível atualizar a reserva.');
    } finally {
      setBusyBooking(null);
    }
  }, [bookings, propertyId, userData, refetchNotifCounts]);

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
      // Filtro por `direction` em vez de `propertyId` — a explicação longa está no
      // NotificationContext. Resumo: só mensagem RECEBIDA acorda o sino, então deixar
      // o fluxo de saída atravessar até o navegador era trabalho puro de descarte.
      // A policy `property_scoped_all` segura a fronteira entre propriedades; a
      // conferência abaixo existe para o super_admin, que enxerga as duas.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'direction=eq.inbound' }, (payload: any) => {
        const pid = payload.new?.propertyId ?? payload.old?.propertyId;
        if (pid && pid !== propertyId) return;
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
  // Mensagem de WhatsApp NÃO entra no badge: com ~325 recebidas por dia o sino
  // vivia marcado e escondia o que era urgente. Ela aparece no menu lateral
  // (Comunicação), dentro do painel e — no sino — como um ponto apagado sem
  // número. O badge âmbar é só de pendência que exige ação: concierge e agenda.

  const waCount = Math.max(counts.messages, whatsapp.length);
  const actionable = concierge.length + bookings.length + petExceptions.length;
  const total = (waCount > 0 ? 1 : 0) + actionable;

  // ─── Tab blinking ───────────────────────────────────────────────────────────
  // Só urgência mexe no título da aba. Mensagem não lida não pisca — era o que
  // gastava o sinal de alarme com o que pode esperar.

  useEffect(() => {
    if (actionable === 0 || !canAlert) return;

    const originalTitle = document.title;
    const alertTitle = `(${actionable}) ${actionable === 1 ? 'pedido' : 'pedidos'} aguardando — Aura`;
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
  }, [actionable, canAlert]);

  // ─── Navigate helpers ───────────────────────────────────────────────────────

  const goTo = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  // ─── WhatsApp aggregate preview ─────────────────────────────────────────────

  const waConvCount = new Set(whatsapp.map(m => m.contactId || m.id)).size;
  const waNames = Array.from(new Set(whatsapp.map(m => m.cabinName).filter(Boolean))) as string[];
  // O painel é o único lugar onde a mensagem aparece com número: "N novas
  // mensagens · há X min · Z conversas — toque para abrir".
  const waConvLabel = `${waConvCount}${whatsapp.length >= 20 ? '+' : ''} conversa${waConvCount !== 1 ? 's' : ''}`;
  const waSubtitle = waNames.length > 0
    ? `${waNames.slice(0, 2).join(', ')}${waConvCount > 2 ? ` +${waConvCount - 2}` : ''} · ${waConvLabel} — toque para abrir`
    : `${waConvLabel} — toque para abrir`;

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
                {/* Pet fora da política — vermelho e no topo: é a única fila do sino
                    com prazo de verdade (depois da chegada não há o que decidir). */}
                {petExceptions.length > 0 && (
                  <NotifSection
                    icon={<Dog size={14} className="text-red-500" />}
                    label="Pet fora da política"
                    count={petExceptions.length}
                    accent="red"
                  >
                    {petExceptions.map(p => (
                      <NotifRow
                        key={p.stayId}
                        title={`${p.guestName}${p.cabinName ? ` · ${p.cabinName}` : ''}`}
                        subtitle={`${p.reasons[0] || 'Fora da Política Pet'} — toque para decidir`}
                        time={chegadaEm(p.checkIn)}
                        accent="red"
                        onClick={() => { setOpen(false); setPetExcOpen(p); }}
                      />
                    ))}
                  </NotifSection>
                )}

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
        <Bell size={18} className={cn(actionable > 0 && !open && "animate-[wiggle_1s_ease-in-out_infinite]")} />
        {/* Âmbar (identidade do sistema) e só para o que exige ação. */}
        {actionable > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[18px] w-[18px]">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-60" />
            <span className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-amber-500 text-white text-[10px] font-black rounded-full leading-none">
              {actionable > 99 ? '99+' : actionable}
            </span>
          </span>
        )}
        {/* Só mensagem não lida: ponto apagado, sem número e sem alarme. */}
        {actionable === 0 && waCount > 0 && (
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-foreground/40" />
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

      {/* Card de urgência — canal próprio de pedido do hóspede / agendamento */}
      {mounted && cardVisible && createPortal(
        <UrgentAlertCard
          items={urgentItems}
          now={nowTick}
          busyId={busyBooking}
          onOpenConcierge={() => goTo('/admin/concierge')}
          onOpenBooking={() => goTo('/admin/estruturas/bookings')}
          onApprove={id => decideBooking(id, 'approved')}
          onReject={id => decideBooking(id, 'rejected')}
          onSuppress={suppressUrgent}
        />,
        overlayRoot ?? document.body
      )}

      <PetExceptionDialog
        item={petExcOpen}
        open={!!petExcOpen}
        onClose={() => setPetExcOpen(null)}
        onDecided={fetchPetExceptions}
      />
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
  onViewAll?: () => void;
  children: React.ReactNode;
  accent?: 'orange' | 'red';
}) {
  return (
    <div className={cn(
      "border-b border-border last:border-b-0",
      accent === 'orange' && "bg-orange-500/[0.06]",
      accent === 'red' && "bg-red-500/[0.07]"
    )}>
      <button
        onClick={onViewAll}
        disabled={!onViewAll}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/40 transition-colors group disabled:hover:bg-transparent"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className={cn(
            "text-[11px] font-black uppercase tracking-widest",
            accent === 'orange' ? "text-orange-500" : accent === 'red' ? "text-red-500" : "text-muted-foreground"
          )}>{label}</span>
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            accent === 'orange' ? "bg-orange-500/15 text-orange-500" : accent === 'red' ? "bg-red-500/15 text-red-500" : "bg-muted"
          )}>{count}</span>
        </div>
        {onViewAll && <ChevronRight size={12} className="text-muted-foreground group-hover:text-foreground transition-colors" />}
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
  accent?: 'orange' | 'red';
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-bold truncate", accent === 'orange' && "text-orange-400", accent === 'red' && "text-red-400")}>{title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
      </div>
      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">{time}</span>
    </button>
  );
}
