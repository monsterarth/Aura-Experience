// src/app/admin/concierge/page.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { ConciergeService } from "@/services/concierge-service";
import { ConciergeRequest, ConciergeItem, ConciergeCategory } from "@/types/aura";
import { ImageUpload } from "@/components/admin/ImageUpload";
import EmojiPicker from "emoji-picker-react";
import {
  ShoppingBag, Loader2, CheckCircle2, RotateCcw, XCircle,
  Package, AlertTriangle, Clock, Pin, Eye, X, Save, Plus,
  User, Wrench, ChevronLeft, ChevronRight, TrendingUp,
  Calendar, Search, Filter, Edit2, EyeOff, Sparkles,
  Gift, ListOrdered, BookOpen
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'pending' | 'history' | 'catalog';
type UrgencyLevel = 'urgent' | 'warning' | 'new';

interface EnrichedRequest extends ConciergeRequest {
  ageMin: number;
  urgency: UrgencyLevel;
}

interface ItemForm {
  name: string; name_en: string; name_es: string;
  description: string; description_en: string; description_es: string;
  category: ConciergeCategory;
  price: string; loss_price: string; included_qty: string;
  image_url: string; active: boolean;
  availableForGuest: boolean; availableForMaid: boolean;
  order: string;
}

const defaultForm: ItemForm = {
  name: '', name_en: '', name_es: '',
  description: '', description_en: '', description_es: '',
  category: 'consumption',
  price: '0', loss_price: '', included_qty: '0',
  image_url: '', active: true,
  availableForGuest: true, availableForMaid: false,
  order: '0',
};

// ─── Emoji helpers ────────────────────────────────────────────────────────────

const EMOJI_PREFIX = 'emoji:';
function isEmojiUrl(url?: string) { return !!url && url.startsWith(EMOJI_PREFIX); }
function emojiFromUrl(url?: string) { return url ? url.slice(EMOJI_PREFIX.length) : ''; }
function emojiToUrl(em: string) { return `${EMOJI_PREFIX}${em}`; }

// Returns { kind: 'emoji', value } | { kind: 'image', value } | { kind: 'none' }
function resolveItemIcon(item: { image_url?: string; category: string }) {
  if (isEmojiUrl(item.image_url)) return { kind: 'emoji' as const, value: emojiFromUrl(item.image_url) };
  if (item.image_url) return { kind: 'image' as const, value: item.image_url };
  return { kind: 'none' as const, value: '' };
}

// ─── Urgency helpers ──────────────────────────────────────────────────────────

function getUrgency(ageMin: number): UrgencyLevel {
  if (ageMin > 30) return 'urgent';
  if (ageMin > 15) return 'warning';
  return 'new';
}

const URGENCY = {
  urgent:  { label: 'Urgente',  color: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.22)',  tw: 'border-red-500/30',    textTw: 'text-red-400'    },
  warning: { label: 'Atenção',  color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.22)',   tw: 'border-amber-500/30',  textTw: 'text-amber-400'  },
  new:     { label: 'Novo',     color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)',   border: 'rgba(45,212,191,0.22)',   tw: 'border-teal-500/30',   textTw: 'text-teal-400'   },
};

function ageLabel(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function avatarFromName(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function dayLabel(offset: number): string {
  if (offset === 0) return 'Hoje';
  if (offset === -1) return 'Ontem';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fullDayLabel(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  delivered: { label: 'Entregue',   color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)',  border: 'rgba(45,212,191,0.22)' },
  returned:  { label: 'Devolvido',  color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.22)' },
  lost:      { label: 'Extraviado', color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.22)' },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminConciergePage() {
  const { currentProperty: property, loading: propLoading } = useProperty();
  const { userData } = useAuth();

  const [tab, setTab] = useState<Tab>('pending');

  // ── Open requests state ──
  const [rawOpen, setRawOpen] = useState<ConciergeRequest[]>([]);
  const [openRequests, setOpenRequests] = useState<EnrichedRequest[]>([]);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [filterCat, setFilterCat] = useState<'all' | 'loan' | 'consumption'>('all');
  const [filterReqBy, setFilterReqBy] = useState<'all' | 'guest' | 'maid'>('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<EnrichedRequest | null>(null);

  const prevCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── History state ──
  const [history, setHistory] = useState<ConciergeRequest[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── Catalog state ──
  const [items, setItems] = useState<ConciergeItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogAccess, setCatalogAccess] = useState<'all' | 'guest' | 'maid' | 'both'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm>(defaultForm);
  const [saving, setSaving] = useState(false);

  // ── New request modal ──
  const [showNew, setShowNew] = useState(false);
  const [newItemPreset, setNewItemPreset] = useState<ConciergeItem | null>(null);

  // ─── Age ticker ──────────────────────────────────────────────────────────

  useEffect(() => {
    ageIntervalRef.current = setInterval(() => {
      setOpenRequests(prev => prev.map(r => {
        const ageMin = r.ageMin + 1;
        return { ...r, ageMin, urgency: r.urgent ? 'urgent' : getUrgency(ageMin) };
      }));
    }, 60_000);
    return () => { if (ageIntervalRef.current) clearInterval(ageIntervalRef.current); };
  }, []);

  // ─── Compute enriched requests with age ──────────────────────────────────

  useEffect(() => {
    const enriched: EnrichedRequest[] = rawOpen.map(r => {
      const ageMin = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60_000);
      return { ...r, ageMin, urgency: r.urgent ? 'urgent' : getUrgency(ageMin) };
    });
    setOpenRequests(enriched);
  }, [rawOpen]);

  // ─── Realtime subscription ───────────────────────────────────────────────

  useEffect(() => {
    if (!property) return;
    const unsub = ConciergeService.listenToPendingRequests(property.id, (reqs) => {
      setRawOpen(reqs);
    }, 'guest');
    return unsub;
  }, [property]);

  // ─── Audio notification ──────────────────────────────────────────────────

  useEffect(() => {
    if (openRequests.length > prevCountRef.current) {
      try {
        if (!audioRef.current) audioRef.current = new Audio('/notification.mp3');
        audioRef.current.play().catch(() => {});
      } catch { /* ignore */ }
    }
    prevCountRef.current = openRequests.length;
  }, [openRequests.length]);

  // ─── History loading ─────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    if (!property) return;
    setLoadingHistory(true);
    try {
      const d = new Date();
      d.setDate(d.getDate() + historyOffset);
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from('concierge_requests')
        .select('*')
        .eq('propertyId', property.id)
        .not('status', 'in', '("pending","in_progress")')
        .gte('createdAt', dayStart.toISOString())
        .lte('createdAt', dayEnd.toISOString())
        .order('createdAt', { ascending: false });

      const enriched = await ConciergeService._enrichRequests(data || []);
      setHistory(enriched);
    } finally {
      setLoadingHistory(false);
    }
  }, [property, historyOffset]);

  useEffect(() => {
    if (tab === 'history' && property) loadHistory();
  }, [tab, historyOffset, property, loadHistory]);

  // ─── Catalog loading ─────────────────────────────────────────────────────

  const loadCatalog = useCallback(async () => {
    if (!property) return;
    setLoadingCatalog(true);
    try {
      const { data } = await supabase
        .from('concierge_items')
        .select('*')
        .eq('propertyId', property.id)
        .order('order', { ascending: true });
      setItems((data || []) as ConciergeItem[]);
    } finally {
      setLoadingCatalog(false);
    }
  }, [property]);

  useEffect(() => {
    if (tab === 'catalog' && property) loadCatalog();
  }, [tab, property, loadCatalog]);

  // ─── Request actions ─────────────────────────────────────────────────────

  const runAction = useCallback(async (requestId: string, action: 'deliver' | 'return' | 'lost') => {
    if (!property || !userData) return;
    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    try {
      if (action === 'deliver') {
        await ConciergeService.deliverRequest(property.id, requestId, userData.id, userData.fullName);
        toast.success('Item entregue.');
      } else if (action === 'return') {
        await ConciergeService.returnRequest(property.id, requestId, userData.id, userData.fullName);
        toast.success('Item retornado.');
      } else {
        await ConciergeService.markLost(property.id, requestId, userData.id, userData.fullName);
        toast.success('Item marcado como extraviado.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao processar ação.');
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  }, [property, userData]);

  // ─── Catalog CRUD ────────────────────────────────────────────────────────

  const openNew = () => { setForm(defaultForm); setEditingId(null); setShowForm(true); };

  const openEdit = (item: ConciergeItem) => {
    setForm({
      name: item.name, name_en: item.name_en || '', name_es: item.name_es || '',
      description: item.description || '', description_en: item.description_en || '', description_es: item.description_es || '',
      category: item.category,
      price: String(item.price), loss_price: item.loss_price != null ? String(item.loss_price) : '',
      included_qty: String(item.included_qty), image_url: item.image_url || '',
      active: item.active, availableForGuest: item.availableForGuest ?? true,
      availableForMaid: item.availableForMaid ?? false, order: String(item.order ?? 0),
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!property || !userData) return;
    if (!form.name.trim()) { toast.error('Nome é obrigatório.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), name_en: form.name_en.trim() || undefined, name_es: form.name_es.trim() || undefined,
        description: form.description.trim() || undefined, description_en: form.description_en.trim() || undefined, description_es: form.description_es.trim() || undefined,
        category: form.category, price: parseFloat(form.price) || 0,
        loss_price: form.loss_price ? parseFloat(form.loss_price) : undefined,
        included_qty: parseInt(form.included_qty) || 0, image_url: form.image_url || undefined,
        active: form.active, availableForGuest: form.availableForGuest, availableForMaid: form.availableForMaid,
        order: parseInt(form.order) || 0,
      };
      if (editingId) {
        await ConciergeService.updateItem(property.id, editingId, payload, userData.id, userData.fullName);
        toast.success('Item atualizado.');
      } else {
        await ConciergeService.createItem(property.id, payload, userData.id, userData.fullName);
        toast.success('Item criado.');
      }
      setShowForm(false); setEditingId(null); await loadCatalog();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar item.');
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (item: ConciergeItem) => {
    if (!property || !userData) return;
    try {
      await ConciergeService.updateItem(property.id, item.id, { active: !item.active }, userData.id, userData.fullName);
      toast.success(item.active ? 'Item desativado.' : 'Item ativado.');
      await loadCatalog();
    } catch { toast.error('Erro ao atualizar item.'); }
  };

  // ─── Guards ───────────────────────────────────────────────────────────────

  if (propLoading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--g1, #9b6dff)' }} />
    </div>
  );

  if (!property) return (
    <div className="flex items-center justify-center h-[60vh]">
      <p className="text-sm" style={{ color: 'rgba(238,240,248,0.42)' }}>Selecione uma propriedade.</p>
    </div>
  );

  // ─── Derived data ─────────────────────────────────────────────────────────

  const filteredOpen = openRequests.filter(r => {
    if (filterCat !== 'all' && r.item?.category !== filterCat) return false;
    if (filterReqBy !== 'all' && r.requestedBy !== filterReqBy) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!((r.item?.name || '').toLowerCase().includes(q) || (r.cabinName || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a, b) => b.ageMin - a.ageMin);

  const urgentCount = openRequests.filter(r => r.urgency === 'urgent').length;
  const todayDeliveredRevenue = history.filter(r => r.status === 'delivered').reduce((s, r) => s + (r.total_price || 0), 0);
  const todayDeliveredCount = history.filter(r => r.status === 'delivered').length;

  const filteredCatalog = (cat: ConciergeCategory) => items.filter(item => {
    if (item.category !== cat) return false;
    if (catalogAccess === 'all') return true;
    if (!item.active) return true; // inactive items always show in admin
    if (catalogAccess === 'guest') return item.availableForGuest;
    if (catalogAccess === 'maid') return item.availableForMaid;
    return item.availableForGuest && item.availableForMaid;
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── KPI Bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Pendentes',     value: openRequests.length, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.22)',  Icon: Clock        },
          { label: 'Urgentes',      value: urgentCount,         color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.22)', Icon: AlertTriangle },
          { label: 'Entregues hoje',value: tab === 'history' ? todayDeliveredCount : '—', color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)',   border: 'rgba(45,212,191,0.22)',  Icon: CheckCircle2 },
          { label: 'Faturado hoje', value: tab === 'history' ? `R$ ${todayDeliveredRevenue.toFixed(2)}` : '—', color: '#9b6dff', bg: 'rgba(155,109,255,0.08)', border: 'rgba(155,109,255,0.22)', Icon: Sparkles },
        ].map((stat, i) => (
          <div key={i} style={{ background: '#1c1c1c', border: `1px solid ${stat.border}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: stat.bg, border: `1px solid ${stat.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <stat.Icon size={16} style={{ color: stat.color }} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: stat.color, lineHeight: 1, letterSpacing: '-0.5px' }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', marginTop: 3, fontWeight: 600 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab bar + Toolbar ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 3 }}>
          {([
            { id: 'pending' as Tab, label: 'Pendentes', badge: openRequests.length },
            { id: 'history' as Tab, label: 'Histórico' },
            { id: 'catalog' as Tab, label: 'Catálogo' },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              transition: 'all .15s',
              background: tab === t.id ? '#1c1c1c' : 'transparent',
              color: tab === t.id ? '#eef0f8' : 'rgba(238,240,248,0.42)',
              boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,.3)' : 'none',
            }}>
              {t.label}
              {(t.badge ?? 0) > 0 && (
                <span style={{ minWidth: 18, height: 18, borderRadius: 999, padding: '0 4px', background: 'linear-gradient(135deg,#9b6dff,#4ec9d4)', color: '#fff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Pending filters */}
        {tab === 'pending' && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '7px 12px', flex: '1 1 180px', maxWidth: 280 }}>
            <Search size={13} style={{ color: 'rgba(238,240,248,0.42)', flexShrink: 0 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Item ou cabana…"
              style={{ background: 'none', border: 'none', outline: 'none', color: '#eef0f8', fontFamily: 'inherit', fontSize: 13, flex: 1, minWidth: 0 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['all', 'loan', 'consumption'] as const).map(f => (
              <button key={f} onClick={() => setFilterCat(f)} style={{
                padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                background: filterCat === f ? 'rgba(155,109,255,0.15)' : 'rgba(255,255,255,0.035)',
                color: filterCat === f ? '#9b6dff' : 'rgba(238,240,248,0.42)',
                border: `1px solid ${filterCat === f ? 'rgba(155,109,255,.28)' : 'rgba(255,255,255,0.07)'}`,
                transition: 'all .15s',
              }}>{f === 'all' ? 'Todos' : f === 'loan' ? 'Empréstimos' : 'Consumo'}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['all', 'guest', 'maid'] as const).map(f => (
              <button key={f} onClick={() => setFilterReqBy(f)} style={{
                padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                background: filterReqBy === f ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.035)',
                color: filterReqBy === f ? '#eef0f8' : 'rgba(238,240,248,0.42)',
                border: `1px solid ${filterReqBy === f ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'}`,
                transition: 'all .15s',
              }}>{f === 'all' ? 'Todos' : f === 'guest' ? 'Hóspede' : 'Camareira'}</button>
            ))}
          </div>
        </>}

        {/* Right actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {tab === 'catalog' && (
            <button onClick={openNew} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.055)',
              cursor: 'pointer', color: '#eef0f8', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            }}>
              <Plus size={13} /> Novo Item
            </button>
          )}
          <button onClick={() => { setNewItemPreset(null); setShowNew(true); }} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg,#9b6dff,#4ec9d4)', cursor: 'pointer', color: '#fff',
            fontSize: 13, fontWeight: 800, fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(155,109,255,.3)',
          }}>
            <Plus size={13} />Novo Pedido
          </button>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div>

        {/* ── PENDING TAB ───────────────────────────────────────────── */}
        {tab === 'pending' && (
          filteredOpen.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 12, color: 'rgba(238,240,248,0.42)' }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={24} style={{ color: '#2dd4bf' }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#eef0f8' }}>Tudo em ordem!</div>
              <div style={{ fontSize: 13 }}>Nenhum pedido pendente no momento.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
              {filteredOpen.map(req => (
                <PendingCard
                  key={req.id}
                  req={req}
                  actioning={!!actionLoading[req.id]}
                  onAction={runAction}
                  onDetail={() => setDetail(req)}
                />
              ))}
            </div>
          )
        )}

        {/* ── HISTORY TAB ───────────────────────────────────────────── */}
        {tab === 'history' && (
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {/* Day navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '10px 14px' }}>
              <button onClick={() => setHistoryOffset(o => o - 1)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,240,248,0.42)', flexShrink: 0 }}>
                <ChevronLeft size={14} />
              </button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: historyOffset === 0 ? '#9b6dff' : '#eef0f8' }}>{dayLabel(historyOffset)}</div>
                <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', marginTop: 2, textTransform: 'capitalize' }}>{fullDayLabel(historyOffset)}</div>
              </div>
              <button onClick={() => setHistoryOffset(o => Math.min(0, o + 1))} disabled={historyOffset === 0} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: historyOffset === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,240,248,0.42)', flexShrink: 0, opacity: historyOffset === 0 ? 0.35 : 1 }}>
                <ChevronRight size={14} />
              </button>
              <div style={{ display: 'flex', gap: 5, marginLeft: 8 }}>
                {[0, -1, -2, -3].map(o => (
                  <button key={o} onClick={() => setHistoryOffset(o)} style={{
                    padding: '4px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 800,
                    background: historyOffset === o ? 'rgba(155,109,255,0.15)' : 'rgba(255,255,255,0.035)',
                    color: historyOffset === o ? '#9b6dff' : 'rgba(238,240,248,0.42)',
                    border: `1px solid ${historyOffset === o ? 'rgba(155,109,255,.28)' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'all .15s',
                  }}>{dayLabel(o)}</button>
                ))}
              </div>
            </div>

            {/* Summary pills */}
            {!loadingHistory && history.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                  { label: 'Entregues',  count: history.filter(r => r.status === 'delivered').length, color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)',  border: 'rgba(45,212,191,0.22)'  },
                  { label: 'Devolvidos', count: history.filter(r => r.status === 'returned').length,  color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.22)'  },
                  { label: 'Extraviados',count: history.filter(r => r.status === 'lost').length,      color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.22)' },
                ].map(s => (
                  <div key={s.label} style={{ padding: '7px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#eef0f8' }}>
                    <span style={{ minWidth: 18, height: 18, borderRadius: 999, padding: '0 5px', background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.count}</span>
                    {s.label}
                  </div>
                ))}
                <div style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 10, background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.22)', fontSize: 13, fontWeight: 800, color: '#9b6dff' }}>
                  Faturado: R$ {history.filter(r => r.status === 'delivered').reduce((s, r) => s + (r.total_price || 0), 0).toFixed(2)}
                </div>
              </div>
            )}

            {/* History list */}
            {loadingHistory ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
                <Loader2 size={20} className="animate-spin" style={{ color: 'rgba(238,240,248,0.42)' }} />
              </div>
            ) : history.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 10, color: 'rgba(238,240,248,0.42)' }}>
                <Calendar size={32} style={{ opacity: 0.3 }} />
                <div style={{ fontSize: 13, fontWeight: 700 }}>Nenhum pedido registrado neste dia</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map(req => {
                  const sc = STATUS_CFG[req.status] || STATUS_CFG.delivered;
                  const isLoan = req.item?.category === 'loan';
                  const av = avatarFromName(req.cabinName || '??');
                  return (
                    <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: 'rgba(238,240,248,0.42)' }}>{av}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#eef0f8' }}>{req.quantity}× {req.item?.name || req.itemId}</div>
                        <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', marginTop: 2 }}>{req.cabinName || '—'} · {formatDate(req.createdAt)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {(req.total_price ?? 0) > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: '#9b6dff' }}>R$ {req.total_price!.toFixed(2)}</span>}
                        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', color: isLoan ? '#60a5fa' : '#9b6dff', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}` }}>{isLoan ? 'Empréstimo' : 'Consumo'}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{sc.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CATALOG TAB ───────────────────────────────────────────── */}
        {tab === 'catalog' && (
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            {/* Access filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(238,240,248,0.42)', marginRight: 4 }}>Visível para:</span>
              {([
                { id: 'all', label: 'Todos' }, { id: 'guest', label: 'Só Hóspede' },
                { id: 'maid', label: 'Só Camareira' }, { id: 'both', label: 'Ambos' },
              ] as { id: typeof catalogAccess; label: string }[]).map(f => (
                <button key={f.id} onClick={() => setCatalogAccess(f.id)} style={{
                  padding: '6px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                  background: catalogAccess === f.id ? 'rgba(155,109,255,0.15)' : 'rgba(255,255,255,0.035)',
                  color: catalogAccess === f.id ? '#9b6dff' : 'rgba(238,240,248,0.42)',
                  border: `1px solid ${catalogAccess === f.id ? 'rgba(155,109,255,.28)' : 'rgba(255,255,255,0.07)'}`,
                  transition: 'all .15s',
                }}>{f.label}</button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(238,240,248,0.42)' }}>
                {items.filter(item => catalogAccess === 'all' || !item.active || (catalogAccess === 'guest' && item.availableForGuest) || (catalogAccess === 'maid' && item.availableForMaid) || (catalogAccess === 'both' && item.availableForGuest && item.availableForMaid)).length} itens
              </span>
            </div>

            {loadingCatalog ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
                <Loader2 size={20} className="animate-spin" style={{ color: 'rgba(238,240,248,0.42)' }} />
              </div>
            ) : (
              (['loan', 'consumption'] as ConciergeCategory[]).map(cat => {
                const catItems = filteredCatalog(cat);
                const allCatItems = items.filter(i => i.category === cat);
                return (
                  <div key={cat} style={{ marginBottom: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: cat === 'loan' ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', border: `1px solid ${cat === 'loan' ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {cat === 'loan' ? <Package size={13} style={{ color: '#60a5fa' }} /> : <ShoppingBag size={13} style={{ color: '#9b6dff' }} />}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(238,240,248,0.42)' }}>{cat === 'loan' ? 'Empréstimos' : 'Consumo'}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: cat === 'loan' ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', color: cat === 'loan' ? '#60a5fa' : '#9b6dff', border: `1px solid ${cat === 'loan' ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}` }}>{catItems.length} itens</span>
                    </div>

                    {catItems.length === 0 ? (
                      <div style={{ padding: '24px', borderRadius: 14, border: '1px dashed rgba(255,255,255,0.07)', textAlign: 'center', color: 'rgba(238,240,248,0.42)', fontSize: 13 }}>
                        {allCatItems.length === 0 ? 'Nenhum item cadastrado.' : 'Nenhum item visível com esse filtro.'}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 10 }}>
                        {catItems.map(item => (
                          <CatalogCard
                            key={item.id}
                            item={item}
                            onEdit={() => openEdit(item)}
                            onToggleActive={() => handleToggleActive(item)}
                            onRequest={() => { setNewItemPreset(item); setShowNew(true); }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── Live indicator ───────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 24, right: 28, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: '#1c1c1c', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 999, pointerEvents: 'none', zIndex: 10 }}>
        <div style={{ position: 'relative', width: 8, height: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00d4ff', animation: 'concierge-pulse 1.5s infinite' }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#00d4ff', opacity: 0.4, animation: 'concierge-ping 1.5s infinite' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#00d4ff' }}>Tempo real</span>
      </div>

      <style>{`
        @keyframes concierge-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes concierge-ping { 0%{transform:scale(1);opacity:1} 75%,100%{transform:scale(2.2);opacity:0} }
        @keyframes concierge-slide-in { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes concierge-fade-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {detail && <DetailPanel req={detail} onClose={() => setDetail(null)} onAction={runAction} />}

      {/* ── New request modal ─────────────────────────────────────────────── */}
      {showNew && <NewRequestModal items={items} preset={newItemPreset} onClose={() => { setShowNew(false); setNewItemPreset(null); }} />}

      {/* ── Catalog form modal ────────────────────────────────────────────── */}
      {showForm && (
        <CatalogFormModal
          form={form} setForm={setForm} editingId={editingId} saving={saving}
          onClose={() => { setShowForm(false); setEditingId(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ─── PendingCard ──────────────────────────────────────────────────────────────

function PendingCard({ req, actioning, onAction, onDetail }: {
  req: EnrichedRequest;
  actioning: boolean;
  onAction: (id: string, action: 'deliver' | 'return' | 'lost') => void;
  onDetail: () => void;
}) {
  const urg = URGENCY[req.urgency];
  const isLoan = req.item?.category === 'loan';

  return (
    <div
      style={{ background: '#1c1c1c', border: `1px solid ${urg.border}`, borderRadius: 18, overflow: 'hidden', cursor: 'pointer', transition: 'transform .15s', animation: 'concierge-fade-in .25s ease' }}
      onClick={onDetail}
    >
      {/* Urgency accent bar */}
      <div style={{ height: 3, background: urg.color, opacity: 0.7 }} />

      <div style={{ padding: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: `${urg.color}18`, border: `1px solid ${urg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: urg.color }}>
            {avatarFromName(req.cabinName || req.itemId || '?')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#eef0f8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.cabinName || '—'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
              <Pin size={10} style={{ color: 'rgba(238,240,248,0.22)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', fontWeight: 600 }}>Cabana</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: urg.bg, color: urg.color, border: `1px solid ${urg.border}` }}>{urg.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(238,240,248,0.42)', fontWeight: 600 }}>
              <Clock size={10} />
              {ageLabel(req.ageMin)}
            </div>
          </div>
        </div>

        {/* Item row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, marginBottom: 12 }}>
          {(() => {
            const icon = resolveItemIcon({ image_url: req.item?.image_url, category: req.item?.category ?? 'consumption' });
            if (icon.kind === 'emoji') return (
              <div style={{ width: 32, height: 32, borderRadius: 9, background: isLoan ? 'rgba(96,165,250,0.06)' : 'rgba(155,109,255,0.06)', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.15)' : 'rgba(155,109,255,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
                {icon.value}
              </div>
            );
            return (
              <div style={{ width: 32, height: 32, borderRadius: 9, background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isLoan ? <Package size={14} style={{ color: '#60a5fa' }} /> : <ShoppingBag size={14} style={{ color: '#9b6dff' }} />}
              </div>
            );
          })()}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#eef0f8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.quantity}× {req.item?.name || req.itemId}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
              <span style={{ padding: '1px 6px', borderRadius: 999, fontSize: 8, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', color: isLoan ? '#60a5fa' : '#9b6dff', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.2)' : 'rgba(155,109,255,0.2)'}` }}>{isLoan ? 'Empréstimo' : 'Consumo'}</span>
              {req.requestedBy === 'maid' && <span style={{ padding: '1px 6px', borderRadius: 999, fontSize: 8, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: 'rgba(192,132,252,0.08)', color: '#c084fc', border: '1px solid rgba(192,132,252,0.22)' }}>Camareira</span>}
            </div>
          </div>
        </div>

        {req.notes && (
          <div style={{ fontSize: 12, color: 'rgba(238,240,248,0.42)', fontStyle: 'italic', marginBottom: 12, paddingLeft: 10, borderLeft: '2px solid rgba(255,255,255,0.12)', lineHeight: 1.4 }}>&ldquo;{req.notes}&rdquo;</div>
        )}

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onAction(req.id, 'deliver')} disabled={actioning} style={{ flex: 1, padding: '8px', borderRadius: 10, border: '1px solid rgba(45,212,191,0.22)', background: 'rgba(45,212,191,0.08)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: '#2dd4bf', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: actioning ? 0.5 : 1 }}>
            {actioning ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Entregar
          </button>
          {isLoan && <>
            <button onClick={() => onAction(req.id, 'return')} disabled={actioning} style={{ flex: 1, padding: '8px', borderRadius: 10, border: '1px solid rgba(96,165,250,0.22)', background: 'rgba(96,165,250,0.08)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: actioning ? 0.5 : 1 }}>
              <RotateCcw size={12} />Devolvido
            </button>
            <button onClick={() => onAction(req.id, 'lost')} disabled={actioning} style={{ width: 34, borderRadius: 10, border: '1px solid rgba(248,113,113,0.22)', background: 'rgba(248,113,113,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: actioning ? 0.5 : 1 }}>
              <XCircle size={14} style={{ color: '#f87171' }} />
            </button>
          </>}
          <button onClick={onDetail} style={{ width: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.055)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,240,248,0.42)' }}>
            <Eye size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DetailPanel ──────────────────────────────────────────────────────────────

function DetailPanel({ req, onClose, onAction }: {
  req: EnrichedRequest;
  onClose: () => void;
  onAction: (id: string, action: 'deliver' | 'return' | 'lost') => void;
}) {
  const urg = URGENCY[req.urgency];
  const isLoan = req.item?.category === 'loan';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, height: '100%', background: '#1c1c1c', borderLeft: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', animation: 'concierge-slide-in .2s ease', boxShadow: '-20px 0 60px rgba(0,0,0,.5)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(238,240,248,0.42)', marginBottom: 4 }}>Pedido · {req.cabinName || '—'}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#eef0f8' }}>{req.item?.name || req.itemId}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,240,248,0.42)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
          {/* Item card */}
          <div style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {(() => {
                const icon = resolveItemIcon({ image_url: req.item?.image_url, category: req.item?.category ?? 'consumption' });
                if (icon.kind === 'emoji') return (
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: isLoan ? 'rgba(96,165,250,0.06)' : 'rgba(155,109,255,0.06)', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.15)' : 'rgba(155,109,255,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 26 }}>
                    {icon.value}
                  </div>
                );
                return (
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isLoan ? <Package size={22} style={{ color: '#60a5fa' }} /> : <ShoppingBag size={22} style={{ color: '#9b6dff' }} />}
                  </div>
                );
              })()}
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#eef0f8' }}>{req.quantity}× {req.item?.name || req.itemId}</div>
                <span style={{ display: 'inline-flex', marginTop: 4, padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', color: isLoan ? '#60a5fa' : '#9b6dff', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}` }}>{isLoan ? 'Empréstimo' : 'Consumo'}</span>
              </div>
            </div>
            {req.notes && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#242424', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', fontSize: 13, color: 'rgba(238,240,248,0.42)', lineHeight: 1.5, fontStyle: 'italic' }}>&ldquo;{req.notes}&rdquo;</div>
            )}
          </div>

          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Cabana', value: req.cabinName || '—' },
              { label: 'Tempo de espera', value: ageLabel(req.ageMin) },
              { label: 'Solicitante', value: req.requestedBy === 'maid' ? 'Camareira' : 'Hóspede' },
              { label: 'Valor estimado', value: req.item && req.item.price > 0 ? `R$ ${(req.item.price * req.quantity).toFixed(2)}` : 'Grátis' },
            ].map(info => (
              <div key={info.label} style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(238,240,248,0.42)', marginBottom: 4 }}>{info.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#eef0f8' }}>{info.value}</div>
              </div>
            ))}
          </div>

          {/* Urgency indicator */}
          <div style={{ padding: '12px 16px', borderRadius: 12, background: urg.bg, border: `1px solid ${urg.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={16} style={{ color: urg.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: urg.color }}>{urg.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', marginTop: 1 }}>Aguardando há {ageLabel(req.ageMin)}</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: 20, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button onClick={() => { onAction(req.id, 'deliver'); onClose(); }} style={{ width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(45,212,191,0.08)', color: '#2dd4bf', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px solid rgba(45,212,191,0.22)' }}>
            <CheckCircle2 size={15} />Confirmar Entrega
          </button>
          {isLoan && <>
            <button onClick={() => { onAction(req.id, 'return'); onClose(); }} style={{ width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px solid rgba(96,165,250,0.22)' }}>
              <RotateCcw size={15} />Item Devolvido
            </button>
            <button onClick={() => { onAction(req.id, 'lost'); onClose(); }} style={{ width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer', background: 'rgba(248,113,113,0.08)', color: '#f87171', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px solid rgba(248,113,113,0.22)' }}>
              <XCircle size={15} />Marcar como Extraviado
            </button>
          </>}
        </div>
      </div>
    </div>
  );
}

// ─── CatalogCard ──────────────────────────────────────────────────────────────

function CatalogCard({ item, onEdit, onToggleActive, onRequest }: {
  item: ConciergeItem;
  onEdit: () => void;
  onToggleActive: () => void;
  onRequest: () => void;
}) {
  const isLoan = item.category === 'loan';
  const accessLabel = item.availableForGuest && item.availableForMaid ? 'Ambos' : item.availableForGuest ? 'Só hóspede' : item.availableForMaid ? 'Só camareira' : 'Nenhum';
  const accessColor = item.availableForGuest && item.availableForMaid ? 'rgba(238,240,248,0.42)' : item.availableForGuest ? '#2dd4bf' : '#c084fc';
  const accessBg = item.availableForGuest && item.availableForMaid ? 'rgba(255,255,255,0.05)' : item.availableForGuest ? 'rgba(45,212,191,0.08)' : 'rgba(192,132,252,0.08)';
  const accessBorder = item.availableForGuest && item.availableForMaid ? 'rgba(255,255,255,0.12)' : item.availableForGuest ? 'rgba(45,212,191,0.22)' : 'rgba(192,132,252,0.22)';

  return (
    <div style={{
      background: '#1c1c1c',
      border: item.active ? '1px solid rgba(255,255,255,0.07)' : '1px dashed rgba(255,255,255,0.1)',
      borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      opacity: item.active ? 1 : 0.55,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {(() => {
          const icon = resolveItemIcon(item);
          if (icon.kind === 'emoji') return (
            <div style={{ width: 40, height: 40, borderRadius: 12, background: isLoan ? 'rgba(96,165,250,0.06)' : 'rgba(155,109,255,0.06)', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.15)' : 'rgba(155,109,255,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22, filter: item.active ? 'none' : 'grayscale(1) opacity(0.5)' }}>
              {icon.value}
            </div>
          );
          if (icon.kind === 'image') return (
            <div style={{ width: 40, height: 40, borderRadius: 12, overflow: 'hidden', flexShrink: 0, position: 'relative', filter: item.active ? 'none' : 'grayscale(1)' }}>
              <Image src={icon.value} alt={item.name} fill className="object-cover" />
            </div>
          );
          return (
            <div style={{ width: 40, height: 40, borderRadius: 12, background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {isLoan ? <Package size={18} style={{ color: '#60a5fa' }} /> : <ShoppingBag size={18} style={{ color: '#9b6dff' }} />}
            </div>
          );
        })()}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!item.active && (
            <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 8, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.06)', color: 'rgba(238,240,248,0.35)', border: '1px solid rgba(255,255,255,0.1)' }}>
              Desativado
            </span>
          )}
          <button
            onClick={onToggleActive}
            title={item.active ? 'Desativar' : 'Reativar'}
            style={{ width: 28, height: 28, borderRadius: 7, border: item.active ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(45,212,191,0.3)', background: item.active ? 'rgba(255,255,255,0.035)' : 'rgba(45,212,191,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.active ? 'rgba(238,240,248,0.42)' : '#2dd4bf' }}
          >
            {item.active ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button onClick={onEdit} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,240,248,0.42)' }}>
            <Edit2 size={13} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: item.active ? '#eef0f8' : 'rgba(238,240,248,0.4)', lineHeight: 1.3 }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: item.price > 0 ? '#9b6dff' : '#2dd4bf' }}>{item.price > 0 ? `R$ ${item.price.toFixed(2)}` : 'Grátis'}</div>
          {item.included_qty > 0 && <span style={{ fontSize: 10, color: 'rgba(238,240,248,0.42)' }}>· {item.included_qty} incluso(s)</span>}
        </div>
        {item.active && (
          <span style={{ marginTop: 6, display: 'inline-flex', padding: '2px 7px', borderRadius: 999, fontSize: 8, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: accessBg, color: accessColor, border: `1px solid ${accessBorder}` }}>{accessLabel}</span>
        )}
      </div>

      <button
        onClick={item.active ? onRequest : undefined}
        disabled={!item.active}
        style={{ padding: '7px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', cursor: item.active ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: item.active ? 'rgba(238,240,248,0.42)' : 'rgba(238,240,248,0.18)', transition: 'all .15s', width: '100%' }}
      >
        {item.active ? '+ Registrar Pedido' : '— Item desativado'}
      </button>
    </div>
  );
}

// ─── NewRequestModal ──────────────────────────────────────────────────────────

interface ActiveStay { id: string; cabinName: string; guestName: string; cabinId?: string; }
interface CabinOption { id: string; name: string; stay?: ActiveStay; }

function NewRequestModal({ items, preset, onClose }: {
  items: ConciergeItem[];
  preset: ConciergeItem | null;
  onClose: () => void;
}) {
  const { currentProperty: property } = useProperty();
  const { userData } = useAuth();
  const [itemId, setItemId] = useState(preset?.id || items[0]?.id || '');
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cabins, setCabins] = useState<CabinOption[]>([]);
  const [selectedCabinId, setSelectedCabinId] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedItem = items.find(i => i.id === itemId);
  const selectedCabin = cabins.find(c => c.id === selectedCabinId);
  const isLoan = selectedItem?.category === 'loan';

  useEffect(() => {
    if (!property) return;
    (async () => {
      try {
        const [{ data: cabinData }, { data: stayData }] = await Promise.all([
          supabase
            .from('cabins')
            .select('id, name')
            .eq('propertyId', property.id)
            .order('name', { ascending: true }),
          supabase
            .from('stays')
            .select('id, cabinId, guestId')
            .eq('propertyId', property.id)
            .eq('status', 'checked_in'),
        ]);

        const stays = (stayData || []) as any[];
        const guestIds = [...new Set(stays.map((s: any) => s.guestId).filter(Boolean))];
        const { data: guestData } = guestIds.length > 0
          ? await supabase.from('guests').select('id, fullName').in('id', guestIds)
          : { data: [] };
        const guestMap = Object.fromEntries((guestData || []).map((g: any) => [g.id, g.fullName]));

        const stayByCabinId = new Map<string, ActiveStay>();
        for (const s of stays) {
          if (!s.cabinId) continue;
          stayByCabinId.set(s.cabinId, {
            id: s.id,
            cabinId: s.cabinId,
            cabinName: '',
            guestName: guestMap[s.guestId] || '—',
          });
        }

        const opts: CabinOption[] = (cabinData || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          stay: stayByCabinId.get(c.id),
        }));

        setCabins(opts);
        const firstWithStay = opts.find(c => !!c.stay);
        setSelectedCabinId(firstWithStay?.id || opts[0]?.id || '');
      } finally {
        setLoading(false);
      }
    })();
  }, [property]);

  const handle = async () => {
    if (!property || !userData || !itemId || !selectedCabinId) return;
    setSaving(true);
    try {
      await ConciergeService.createRequest({
        propertyId: property.id,
        stayId: selectedCabin?.stay?.id,
        cabinId: selectedCabinId,
        itemId,
        quantity: qty,
        notes: notes.trim() || undefined,
        requestedBy: 'guest',
        urgent,
      }, userData.id, userData.fullName);
      toast.success('Pedido criado.');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar pedido.');
    } finally {
      setSaving(false);
    }
  };

  const inputSt: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: '9px 12px',
    color: '#eef0f8',
    fontFamily: 'inherit',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    transition: 'border-color .15s',
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
    color: 'rgba(238,240,248,0.35)', marginBottom: 10,
  };

  const canSubmit = !!itemId && !!selectedCabinId && !saving;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(8px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#0b0e18', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, width: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 100px rgba(0,0,0,.8)', animation: 'concierge-fade-in .2s ease' }}
      >
        {/* ── Header ── */}
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShoppingBag size={17} style={{ color: '#9b6dff' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#eef0f8' }}>Novo Pedido</div>
              <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', marginTop: 2 }}>Registrar solicitação manualmente</div>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,240,248,0.42)', flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22, scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>

          {/* ── Cabana ── */}
          <div>
            <div style={sectionLabel}>Cabana</div>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(238,240,248,0.42)', fontSize: 13, padding: '10px 0' }}>
                <Loader2 size={14} className="animate-spin" /> Carregando cabanas…
              </div>
            ) : cabins.length === 0 ? (
              <div style={{ fontSize: 13, color: 'rgba(238,240,248,0.42)', padding: '10px 0' }}>Nenhuma cabana cadastrada.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#161824', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 12px' }}>
                  <Pin size={13} style={{ color: 'rgba(238,240,248,0.42)', flexShrink: 0 }} />
                  <select
                    value={selectedCabinId}
                    onChange={e => setSelectedCabinId(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: '#eef0f8', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, outline: 'none', width: '100%', cursor: 'pointer' }}
                  >
                    {cabins.map(c => (
                      <option key={c.id} value={c.id} style={{ background: '#161824', color: '#eef0f8' }}>
                        {c.name}{c.stay ? ` — ${c.stay.guestName}` : ' — Sem estadia'}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedCabin && !selectedCabin.stay && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 9, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 11, color: '#f59e0b' }}>
                    <AlertTriangle size={11} />
                    Cabana sem estadia ativa — pedido será criado sem vínculo com hóspede.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Item ── */}
          <div>
            <div style={sectionLabel}>Item do Catálogo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#161824', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 12px' }}>
              <Package size={13} style={{ color: 'rgba(238,240,248,0.42)', flexShrink: 0 }} />
              <select
                value={itemId}
                onChange={e => setItemId(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: '#eef0f8', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, outline: 'none', width: '100%', cursor: 'pointer' }}
              >
                {(['loan', 'consumption'] as ConciergeCategory[]).map(cat => {
                  const catItems = items.filter(i => i.category === cat && i.active);
                  if (catItems.length === 0) return null;
                  return [
                    <option key={`sep-${cat}`} disabled style={{ background: '#0f1120', color: 'rgba(238,240,248,0.35)', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em' }}>
                      {'── ' + (cat === 'loan' ? 'EMPRÉSTIMOS' : 'CONSUMO')}
                    </option>,
                    ...catItems.map(i => (
                      <option key={i.id} value={i.id} style={{ background: '#161824', color: '#eef0f8' }}>
                        {i.name}{i.price > 0 ? ` · R$${i.price.toFixed(2)}` : ''}
                      </option>
                    )),
                  ];
                })}
              </select>
            </div>
            {selectedItem && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.2)' : 'rgba(155,109,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15 }}>
                  {isEmojiUrl(selectedItem.image_url) ? emojiFromUrl(selectedItem.image_url) : (isLoan ? <Package size={13} style={{ color: '#60a5fa' }} /> : <ShoppingBag size={13} style={{ color: '#9b6dff' }} />)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#eef0f8' }}>{selectedItem.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(238,240,248,0.42)', marginTop: 1 }}>{isLoan ? 'Empréstimo' : 'Consumo'}</div>
                </div>
                {selectedItem.price > 0 && (
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#9b6dff', flexShrink: 0 }}>R$ {(selectedItem.price * qty).toFixed(2)}</div>
                )}
              </div>
            )}
          </div>

          {/* ── Quantidade ── */}
          <div>
            <div style={sectionLabel}>Quantidade</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', fontSize: 20, color: '#eef0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >−</button>
              <span style={{ fontSize: 20, fontWeight: 900, minWidth: 36, textAlign: 'center', color: '#eef0f8' }}>{qty}</span>
              <button
                onClick={() => setQty(q => q + 1)}
                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', fontSize: 20, color: '#eef0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >+</button>
            </div>
          </div>

          {/* ── Urgente + Observações ── */}
          <div>
            <div style={sectionLabel}>Opções</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Urgente toggle */}
              <button
                onClick={() => setUrgent(u => !u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                  background: urgent ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.035)',
                  border: `1px solid ${urgent ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.07)'}`,
                  transition: 'all .15s', textAlign: 'left', fontFamily: 'inherit',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 6, border: `2px solid ${urgent ? '#f87171' : 'rgba(255,255,255,0.2)'}`,
                  background: urgent ? '#f87171' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all .15s',
                }}>
                  {urgent && <div style={{ width: 8, height: 8, borderRadius: 2, background: '#fff' }} />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: urgent ? '#f87171' : '#eef0f8' }}>Marcar como Urgente</div>
                  <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', marginTop: 1 }}>Pedido aparece destacado na fila de pendentes</div>
                </div>
                {urgent && (
                  <AlertTriangle size={15} style={{ color: '#f87171', marginLeft: 'auto', flexShrink: 0 }} />
                )}
              </button>

              {/* Observações */}
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observações (opcional) — Ex: gelado, sem açúcar…"
                style={inputSt}
                onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
              />
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'rgba(238,240,248,0.42)' }}
          >Cancelar</button>
          <button
            onClick={handle}
            disabled={!canSubmit}
            style={{
              flex: 2, padding: '12px', borderRadius: 12, border: 'none',
              background: urgent ? 'linear-gradient(135deg,#f87171,#f59e0b)' : 'linear-gradient(135deg,#9b6dff,#4ec9d4)',
              cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#fff',
              boxShadow: urgent ? '0 4px 14px rgba(248,113,113,.3)' : '0 4px 14px rgba(155,109,255,.35)',
              opacity: canSubmit ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all .15s',
            }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : urgent ? <AlertTriangle size={13} /> : null}
            {urgent ? 'Criar Pedido Urgente' : 'Criar Pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CatalogFormModal ─────────────────────────────────────────────────────────

type LangTab = 'pt' | 'en' | 'es';

function CatalogFormModal({ form, setForm, editingId, saving, onClose, onSave }: {
  form: ItemForm;
  setForm: React.Dispatch<React.SetStateAction<ItemForm>>;
  editingId: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const [lang, setLang] = useState<LangTab>('pt');
  const initialEmoji = isEmojiUrl(form.image_url) ? emojiFromUrl(form.image_url) : '💧';
  const [imageType, setImageType] = useState<'emoji' | 'url'>(isEmojiUrl(form.image_url) || !form.image_url ? 'emoji' : 'url');
  const [emoji, setEmoji] = useState(initialEmoji);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiPickerRef = React.useRef<HTMLDivElement>(null);

  const isLoan = form.category === 'loan';
  // active is derived: at least one audience must be selected
  const isActive = form.availableForGuest || form.availableForMaid;
  const canSave = form.name.trim().length > 0;

  // Keep image_url in sync with emoji picker / imageType
  React.useEffect(() => {
    if (imageType === 'emoji') {
      setForm(prev => ({ ...prev, image_url: emojiToUrl(emoji) }));
    }
    // when imageType === 'url', user edits the input directly — don't overwrite
  }, [emoji, imageType]); // eslint-disable-line

  // Sync active field with availability selection
  React.useEffect(() => {
    setForm(prev => ({ ...prev, active: prev.availableForGuest || prev.availableForMaid }));
  }, [form.availableForGuest, form.availableForMaid]); // eslint-disable-line

  // Close emoji picker on outside click
  React.useEffect(() => {
    if (!emojiOpen) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [emojiOpen]);

  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const LANGS: { id: LangTab; flag: string; label: string }[] = [
    { id: 'pt', flag: '🇧🇷', label: 'PT' },
    { id: 'en', flag: '🇺🇸', label: 'EN' },
    { id: 'es', flag: '🇪🇸', label: 'ES' },
  ];

  const inputSt: React.CSSProperties = {
    background: 'rgba(255,255,255,0.035)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: '9px 12px',
    color: '#eef0f8',
    fontFamily: 'inherit',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    transition: 'border-color .15s',
  };
  const labelSt: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
    color: 'rgba(238,240,248,0.42)', marginBottom: 5, display: 'block',
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
    color: 'rgba(238,240,248,0.42)', marginBottom: 12,
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(8px)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#0b0e18', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 100px rgba(0,0,0,.8)', animation: 'concierge-fade-in .2s ease' }}
      >
        {/* ── Header ── */}
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(155,109,255,0.12)', border: '1px solid rgba(155,109,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ListOrdered size={17} style={{ color: '#9b6dff' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#eef0f8' }}>{editingId ? 'Editar Item do Catálogo' : 'Novo Item do Catálogo'}</div>
              <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', marginTop: 2 }}>Preencha os dados do item em todos os idiomas</div>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,240,248,0.42)', flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22, scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>

          {/* ── Identidade Visual ── */}
          <div>
            <div style={sectionLabel}>Identidade Visual</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {/* Preview */}
              <div
                style={{ width: 72, height: 72, borderRadius: 18, flexShrink: 0, background: 'rgba(155,109,255,0.12)', border: '2px solid rgba(155,109,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, cursor: 'pointer', transition: 'border-color .15s' }}
                onClick={() => setEmojiOpen(p => !p)}
              >
                {imageType === 'emoji' ? emoji : (form.image_url ? '🖼️' : '📦')}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Type toggle */}
                <div style={{ display: 'flex', gap: 5 }}>
                  {([{ id: 'emoji', label: 'Emoji' }, { id: 'url', label: 'URL / Upload' }] as { id: 'emoji' | 'url'; label: string }[]).map(t => (
                    <button key={t.id} onClick={() => setImageType(t.id)} style={{
                      padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                      background: imageType === t.id ? 'rgba(155,109,255,0.12)' : 'rgba(255,255,255,0.035)',
                      color: imageType === t.id ? '#9b6dff' : 'rgba(238,240,248,0.42)',
                      border: `1px solid ${imageType === t.id ? 'rgba(155,109,255,.28)' : 'rgba(255,255,255,0.07)'}`,
                    }}>{t.label}</button>
                  ))}
                </div>

                {imageType === 'url' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      value={form.image_url} onChange={e => set('image_url', e.target.value)}
                      placeholder="https://…"
                      style={inputSt}
                      onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')}
                      onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                    />
                    <div style={{ fontSize: 10, color: 'rgba(238,240,248,0.42)' }}>Ou use o componente de upload abaixo</div>
                    <ImageUpload value={form.image_url} onUploadSuccess={url => set('image_url', url)} path="concierge-items" />
                  </div>
                ) : (
                  <div ref={emojiPickerRef} style={{ position: 'relative' }}>
                    <button onClick={() => setEmojiOpen(p => !p)} style={{
                      width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.035)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                      color: 'rgba(238,240,248,0.42)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 20 }}>{emoji}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Clique para trocar emoji</span>
                    </button>
                    {emojiOpen && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 80,
                        animation: 'concierge-fade-in .15s ease',
                        /* constrain width so it never overflows the 560px modal */
                        maxWidth: 'min(340px, calc(560px - 48px - 84px))',
                      }}>
                        <EmojiPicker
                          onEmojiClick={(data) => { setEmoji(data.emoji); setEmojiOpen(false); }}
                          theme={'dark' as any}
                          skinTonesDisabled
                          searchPlaceholder="Buscar emoji…"
                          width="100%"
                          height={360}
                          previewConfig={{ showPreview: false }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Nome & Descrição por idioma ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={sectionLabel}>Nome & Descrição</div>
              {/* Lang tabs */}
              <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: 3 }}>
                {LANGS.map(l => (
                  <button key={l.id} onClick={() => setLang(l.id)} style={{
                    padding: '4px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4,
                    background: lang === l.id ? '#0b0e18' : 'transparent',
                    color: lang === l.id ? '#eef0f8' : 'rgba(238,240,248,0.42)',
                    boxShadow: lang === l.id ? '0 1px 4px rgba(0,0,0,.3)' : 'none',
                    border: 'none', transition: 'all .15s',
                  }}>
                    <span>{l.flag}</span>{l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* PT */}
            {lang === 'pt' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'concierge-fade-in .15s ease' }}>
                <div>
                  <label style={labelSt}>Nome em Português <span style={{ color: '#f87171' }}>*</span></label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Água Mineral (500ml)" style={inputSt}
                    onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
                </div>
                <div>
                  <label style={labelSt}>Descrição em Português</label>
                  <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Água mineral sem gás, garrafa individual de 500ml." rows={3}
                    style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
                </div>
              </div>
            )}
            {/* EN */}
            {lang === 'en' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'concierge-fade-in .15s ease' }}>
                <div>
                  <label style={labelSt}>Name in English</label>
                  <input value={form.name_en} onChange={e => set('name_en', e.target.value)} placeholder="e.g. Still Water (500ml)" style={inputSt}
                    onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
                </div>
                <div>
                  <label style={labelSt}>Description in English</label>
                  <textarea value={form.description_en} onChange={e => set('description_en', e.target.value)} placeholder="e.g. Still mineral water, individual 500ml bottle." rows={3}
                    style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
                </div>
              </div>
            )}
            {/* ES */}
            {lang === 'es' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'concierge-fade-in .15s ease' }}>
                <div>
                  <label style={labelSt}>Nombre en Español</label>
                  <input value={form.name_es} onChange={e => set('name_es', e.target.value)} placeholder="Ej: Agua Mineral (500ml)" style={inputSt}
                    onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
                </div>
                <div>
                  <label style={labelSt}>Descripción en Español</label>
                  <textarea value={form.description_es} onChange={e => set('description_es', e.target.value)} placeholder="Ej: Agua mineral sin gas, botella individual de 500ml." rows={3}
                    style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
                </div>
              </div>
            )}

            {/* Completeness indicator */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'rgba(238,240,248,0.42)', fontWeight: 700 }}>Preenchimento:</span>
              {[
                { flag: '🇧🇷', label: 'PT', filled: !!form.name.trim() },
                { flag: '🇺🇸', label: 'EN', filled: !!form.name_en.trim() },
                { flag: '🇪🇸', label: 'ES', filled: !!form.name_es.trim() },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: l.filled ? '#2dd4bf' : 'rgba(255,255,255,0.12)' }} />
                  <span style={{ fontSize: 10, color: l.filled ? '#2dd4bf' : 'rgba(238,240,248,0.22)', fontWeight: 700 }}>{l.flag} {l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Tipo de Item ── */}
          <div>
            <div style={sectionLabel}>Tipo de Item</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([
                { id: 'consumption' as ConciergeCategory, label: 'Consumo', desc: 'Item entregue e cobrado. Ex: bebida, kit amenities.', Icon: ShoppingBag, color: '#9b6dff', bg: 'rgba(155,109,255,0.12)', border: 'rgba(155,109,255,0.3)' },
                { id: 'loan' as ConciergeCategory, label: 'Empréstimo', desc: 'Item cedido e devolvido. Ex: guarda-chuva, cadeira.', Icon: Package, color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.22)' },
              ]).map(cat => (
                <button key={cat.id} onClick={() => set('category', cat.id)} style={{
                  padding: 14, borderRadius: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  background: form.category === cat.id ? cat.bg : 'rgba(255,255,255,0.035)',
                  border: `2px solid ${form.category === cat.id ? cat.border : 'rgba(255,255,255,0.07)'}`,
                  transition: 'all .15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: form.category === cat.id ? cat.bg : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <cat.Icon size={14} style={{ color: form.category === cat.id ? cat.color : 'rgba(238,240,248,0.42)' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 900, color: form.category === cat.id ? cat.color : '#eef0f8' }}>{cat.label}</span>
                    {form.category === cat.id && <div style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color, marginLeft: 'auto', boxShadow: `0 0 8px ${cat.color}` }} />}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', lineHeight: 1.4 }}>{cat.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Preço & Quantidade ── */}
          <div>
            <div style={sectionLabel}>Preço & Quantidade</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelSt}>{isLoan ? 'Preço de entrega (opcional)' : 'Preço unitário (R$)'}</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 700, color: 'rgba(238,240,248,0.42)', pointerEvents: 'none' }}>R$</span>
                  <input type="number" min="0" step="0.01" value={form.price} onChange={e => set('price', e.target.value)}
                    placeholder="0,00" style={{ ...inputSt, paddingLeft: 34 }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(238,240,248,0.42)', marginTop: 4, lineHeight: 1.4 }}>
                  {isLoan ? 'Cobrado na entrega, se aplicável.' : 'Valor cobrado por unidade consumida.'}
                </div>
              </div>
              <div>
                <label style={labelSt}>Qtde inclusa na hospedagem</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => set('included_qty', String(Math.max(0, parseInt(form.included_qty || '0') - 1)))}
                    style={{ width: 34, height: 37, borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', fontSize: 18, color: '#eef0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
                  <input type="number" min="0" value={form.included_qty} onChange={e => set('included_qty', e.target.value)}
                    style={{ ...inputSt, textAlign: 'center', padding: '9px 4px' }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
                  <button onClick={() => set('included_qty', String(parseInt(form.included_qty || '0') + 1))}
                    style={{ width: 34, height: 37, borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', fontSize: 18, color: '#eef0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(238,240,248,0.42)', marginTop: 4, lineHeight: 1.4 }}>Unidades gratuitas por estadia.</div>
              </div>
            </div>

            {/* Loss price — loan only */}
            {isLoan && (
              <div style={{ marginTop: 10 }}>
                <label style={{ ...labelSt, color: 'rgba(248,113,113,0.7)' }}>Preço de extravio (R$)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 700, color: '#f87171', pointerEvents: 'none' }}>R$</span>
                  <input type="number" min="0" step="0.01" value={form.loss_price} onChange={e => set('loss_price', e.target.value)}
                    placeholder="0,00" style={{ ...inputSt, paddingLeft: 34, borderColor: 'rgba(248,113,113,0.3)' }}
                    onFocus={e => (e.target.style.borderColor = '#f87171')} onBlur={e => (e.target.style.borderColor = 'rgba(248,113,113,0.3)')} />
                </div>
                <div style={{ fontSize: 10, color: 'rgba(248,113,113,0.6)', marginTop: 4 }}>Cobrado automaticamente se o item for marcado como extraviado.</div>
              </div>
            )}

            {/* Order */}
            <div style={{ marginTop: 10 }}>
              <label style={labelSt}>Ordem de exibição</label>
              <input type="number" min="0" value={form.order} onChange={e => set('order', e.target.value)}
                style={inputSt}
                onFocus={e => (e.target.style.borderColor = 'rgba(155,109,255,.5)')} onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')} />
            </div>
          </div>

          {/* ── Disponibilidade ── */}
          <div>
            <div style={{ ...sectionLabel, marginBottom: 6 }}>Disponibilidade</div>
            <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.35)', marginBottom: 12 }}>
              Selecione quem pode solicitar este item. Nenhum selecionado = item inativo.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([
                { key: 'availableForGuest' as const, label: 'Hóspede', desc: 'Visível no app do hóspede.', Icon: User, color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)', border: 'rgba(45,212,191,0.22)' },
                { key: 'availableForMaid' as const, label: 'Camareira', desc: 'Visível no app da camareira.', Icon: Wrench, color: '#c084fc', bg: 'rgba(192,132,252,0.08)', border: 'rgba(192,132,252,0.22)' },
              ]).map(opt => {
                const on = form[opt.key];
                return (
                  <button key={opt.key} onClick={() => set(opt.key, !on)} style={{
                    padding: 14, borderRadius: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    background: on ? opt.bg : 'rgba(255,255,255,0.035)',
                    border: `2px solid ${on ? opt.border : 'rgba(255,255,255,0.07)'}`,
                    transition: 'all .15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: on ? opt.bg : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <opt.Icon size={14} style={{ color: on ? opt.color : 'rgba(238,240,248,0.42)' }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 900, color: on ? opt.color : '#eef0f8' }}>{opt.label}</span>
                      {/* checkmark */}
                      <div style={{
                        marginLeft: 'auto', width: 18, height: 18, borderRadius: 5,
                        background: on ? opt.color : 'transparent',
                        border: `2px solid ${on ? opt.color : 'rgba(255,255,255,0.2)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .15s', flexShrink: 0,
                      }}>
                        {on && <CheckCircle2 size={11} style={{ color: '#fff', strokeWidth: 3 }} />}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', lineHeight: 1.4 }}>{opt.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Status indicator — derived from selection */}
            {!isActive && (
              <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'center', gap: 8, animation: 'concierge-fade-in .2s ease' }}>
                <XCircle size={14} style={{ color: '#f87171', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'rgba(248,113,113,0.8)', fontWeight: 600 }}>Nenhum público selecionado — o item ficará inativo e oculto do catálogo.</span>
              </div>
            )}
          </div>

        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          {/* Live preview pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.035)', border: `1px solid ${isActive ? 'rgba(255,255,255,0.12)' : 'rgba(248,113,113,0.2)'}`, fontSize: 12, fontWeight: 700, flexShrink: 0, maxWidth: 220, overflow: 'hidden', transition: 'border-color .2s' }}>
            <span style={{ fontSize: 16, flexShrink: 0, opacity: isActive ? 1 : 0.4 }}>{imageType === 'emoji' ? emoji : '📦'}</span>
            <span style={{ color: form.name.trim() ? (isActive ? '#eef0f8' : 'rgba(238,240,248,0.35)') : 'rgba(238,240,248,0.42)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{form.name.trim() || 'Nome do item'}</span>
            <span style={{ flexShrink: 0, padding: '1px 6px', borderRadius: 999, fontSize: 8, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', color: isLoan ? '#60a5fa' : '#9b6dff', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}` }}>
              {isLoan ? 'Empréstimo' : 'Consumo'}
            </span>
            {!isActive && <span style={{ flexShrink: 0, padding: '1px 6px', borderRadius: 999, fontSize: 8, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.22)' }}>inativo</span>}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'rgba(238,240,248,0.42)' }}>
            Cancelar
          </button>
          <button onClick={onSave} disabled={!canSave || saving} style={{
            padding: '10px 22px', borderRadius: 11, border: 'none', cursor: canSave && !saving ? 'pointer' : 'default',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#fff',
            background: canSave ? 'linear-gradient(135deg,#9b6dff,#4ec9d4)' : 'rgba(155,109,255,0.3)',
            boxShadow: canSave && !saving ? '0 4px 14px rgba(155,109,255,.3)' : 'none',
            transition: 'all .2s', display: 'flex', alignItems: 'center', gap: 7, opacity: saving ? 0.7 : 1,
          }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {editingId ? 'Salvar Alterações' : 'Criar Item'}
          </button>
        </div>
      </div>
    </div>
  );
}
