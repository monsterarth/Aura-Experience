// src/app/admin/concierge/page.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { ConciergeService } from "@/services/concierge-service";
import { ConciergeRequest, ConciergeItem, ConciergeCategory } from "@/types/aura";
import { ImageUpload } from "@/components/admin/ImageUpload";
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
        return { ...r, ageMin, urgency: getUrgency(ageMin) };
      }));
    }, 60_000);
    return () => { if (ageIntervalRef.current) clearInterval(ageIntervalRef.current); };
  }, []);

  // ─── Compute enriched requests with age ──────────────────────────────────

  useEffect(() => {
    const enriched: EnrichedRequest[] = rawOpen.map(r => {
      const ageMin = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60_000);
      return { ...r, ageMin, urgency: getUrgency(ageMin) };
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg, #06080f)', position: 'relative' }}>

      {/* ── KPI Bar ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 24px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, flexShrink: 0 }}>
        {[
          { label: 'Pendentes',     value: openRequests.length, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.22)',  Icon: Clock        },
          { label: 'Urgentes',      value: urgentCount,         color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.22)', Icon: AlertTriangle },
          { label: 'Entregues hoje',value: tab === 'history' ? todayDeliveredCount : '—', color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)',   border: 'rgba(45,212,191,0.22)',  Icon: CheckCircle2 },
          { label: 'Faturado hoje', value: tab === 'history' ? `R$ ${todayDeliveredRevenue.toFixed(2)}` : '—', color: '#9b6dff', bg: 'rgba(155,109,255,0.08)', border: 'rgba(155,109,255,0.22)', Icon: Sparkles },
        ].map((stat, i) => (
          <div key={i} style={{ background: 'var(--bg2, #0b0e18)', border: `1px solid ${stat.border}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
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
      <div style={{ padding: '14px 24px 0', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
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
              background: tab === t.id ? 'var(--bg2, #0b0e18)' : 'transparent',
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 24px 40px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, background: 'var(--bg2, #0b0e18)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '10px 14px' }}>
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
                    <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'var(--bg2, #0b0e18)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
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
      <div style={{ position: 'absolute', bottom: 20, right: 24, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: 'var(--bg2, #0b0e18)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 999, pointerEvents: 'none', zIndex: 10 }}>
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
      style={{ background: 'var(--bg2, #0b0e18)', border: `1px solid ${urg.border}`, borderRadius: 18, overflow: 'hidden', cursor: 'pointer', transition: 'transform .15s', animation: 'concierge-fade-in .25s ease' }}
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
          <div style={{ width: 32, height: 32, borderRadius: 9, background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isLoan ? <Package size={14} style={{ color: '#60a5fa' }} /> : <ShoppingBag size={14} style={{ color: '#9b6dff' }} />}
          </div>
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
      <div onClick={e => e.stopPropagation()} style={{ width: 400, height: '100%', background: 'var(--bg2, #0b0e18)', borderLeft: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', animation: 'concierge-slide-in .2s ease', boxShadow: '-20px 0 60px rgba(0,0,0,.5)' }}>
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
              <div style={{ width: 48, height: 48, borderRadius: 14, background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isLoan ? <Package size={22} style={{ color: '#60a5fa' }} /> : <ShoppingBag size={22} style={{ color: '#9b6dff' }} />}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#eef0f8' }}>{req.quantity}× {req.item?.name || req.itemId}</div>
                <span style={{ display: 'inline-flex', marginTop: 4, padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', color: isLoan ? '#60a5fa' : '#9b6dff', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}` }}>{isLoan ? 'Empréstimo' : 'Consumo'}</span>
              </div>
            </div>
            {req.notes && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg3, #0d1020)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', fontSize: 13, color: 'rgba(238,240,248,0.42)', lineHeight: 1.5, fontStyle: 'italic' }}>&ldquo;{req.notes}&rdquo;</div>
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
      background: 'var(--bg2, #0b0e18)',
      border: item.active ? '1px solid rgba(255,255,255,0.07)' : '1px dashed rgba(255,255,255,0.1)',
      borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      opacity: item.active ? 1 : 0.55,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {item.image_url ? (
          <div style={{ width: 40, height: 40, borderRadius: 12, overflow: 'hidden', flexShrink: 0, position: 'relative', filter: item.active ? 'none' : 'grayscale(1)' }}>
            <Image src={item.image_url} alt={item.name} fill className="object-cover" />
          </div>
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: 12, background: isLoan ? 'rgba(96,165,250,0.08)' : 'rgba(155,109,255,0.08)', border: `1px solid ${isLoan ? 'rgba(96,165,250,0.22)' : 'rgba(155,109,255,0.22)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isLoan ? <Package size={18} style={{ color: '#60a5fa' }} /> : <ShoppingBag size={18} style={{ color: '#9b6dff' }} />}
          </div>
        )}
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
  const [saving, setSaving] = useState(false);
  const [stays, setStays] = useState<ActiveStay[]>([]);
  const [stayId, setStayId] = useState('');
  const [loadingStays, setLoadingStays] = useState(true);

  const selectedItem = items.find(i => i.id === itemId);

  useEffect(() => {
    if (!property) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('stays')
          .select('id, cabinId, guestId, cabins:cabinId(name), guests:guestId(fullName)')
          .eq('propertyId', property.id)
          .eq('status', 'checked_in')
          .order('checkIn', { ascending: false });

        const mapped: ActiveStay[] = (data || []).map((s: any) => ({
          id: s.id,
          cabinId: s.cabinId,
          cabinName: s.cabins?.name || '—',
          guestName: s.guests?.fullName || '—',
        }));
        setStays(mapped);
        if (mapped.length > 0) setStayId(mapped[0].id);
      } finally {
        setLoadingStays(false);
      }
    })();
  }, [property]);

  const handle = async () => {
    if (!property || !userData || !itemId || !stayId) return;
    setSaving(true);
    const selectedStay = stays.find(s => s.id === stayId);
    try {
      await ConciergeService.createRequest({
        propertyId: property.id,
        stayId,
        cabinId: selectedStay?.cabinId,
        itemId,
        quantity: qty,
        notes: notes.trim() || undefined,
        requestedBy: 'guest',
      }, userData.id, userData.fullName);
      toast.success('Pedido criado.');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar pedido.');
    } finally {
      setSaving(false);
    }
  };

  const inputSt: React.CSSProperties = { background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 12px', color: '#eef0f8', fontFamily: 'inherit', fontSize: 13, outline: 'none', width: '100%' };
  const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(238,240,248,0.42)', marginBottom: 5, display: 'block' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg2, #0b0e18)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 22, width: 460, boxShadow: '0 24px 80px rgba(0,0,0,.7)', animation: 'concierge-fade-in .2s ease' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#eef0f8' }}>Novo Pedido</div>
            <div style={{ fontSize: 11, color: 'rgba(238,240,248,0.42)', marginTop: 2 }}>Registrar solicitação manualmente</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(238,240,248,0.42)' }}>
            <X size={13} />
          </button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stay picker */}
          <div>
            <label style={labelSt}>Cabana / Hóspede</label>
            {loadingStays ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(238,240,248,0.42)', fontSize: 13 }}>
                <Loader2 size={14} className="animate-spin" /> Carregando estadias…
              </div>
            ) : stays.length === 0 ? (
              <div style={{ fontSize: 13, color: 'rgba(238,240,248,0.42)', padding: '9px 0' }}>Nenhuma estadia ativa no momento.</div>
            ) : (
              <select value={stayId} onChange={e => setStayId(e.target.value)} style={{ ...inputSt, appearance: 'none' }}>
                {stays.map(s => (
                  <option key={s.id} value={s.id} style={{ background: '#0d1020' }}>{s.cabinName} — {s.guestName}</option>
                ))}
              </select>
            )}
          </div>
          {/* Item */}
          <div>
            <label style={labelSt}>Item do Catálogo</label>
            <select value={itemId} onChange={e => setItemId(e.target.value)} style={{ ...inputSt, appearance: 'none' }}>
              {(['loan', 'consumption'] as ConciergeCategory[]).map(cat => (
                <optgroup key={cat} label={cat === 'loan' ? 'Empréstimos' : 'Consumo'}>
                  {items.filter(i => i.category === cat).map(i => (
                    <option key={i.id} value={i.id} style={{ background: '#0d1020' }}>{i.name}{i.price > 0 ? ` · R$${i.price.toFixed(2)}` : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {/* Qty */}
          <div>
            <label style={labelSt}>Quantidade</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', fontSize: 18, color: '#eef0f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ fontSize: 18, fontWeight: 900, minWidth: 32, textAlign: 'center', color: '#eef0f8' }}>{qty}</span>
              <button onClick={() => setQty(q => q + 1)} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', fontSize: 18, color: '#eef0f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              {selectedItem && selectedItem.price > 0 && <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: '#9b6dff' }}>R$ {(selectedItem.price * qty).toFixed(2)}</span>}
            </div>
          </div>
          {/* Notes */}
          <div>
            <label style={labelSt}>Observações (opcional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: gelado, sem açúcar…" style={inputSt} />
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.035)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'rgba(238,240,248,0.42)' }}>Cancelar</button>
          <button onClick={handle} disabled={!itemId || !stayId || saving} style={{ flex: 2, padding: '11px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#9b6dff,#4ec9d4)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: '#fff', boxShadow: '0 4px 14px rgba(155,109,255,.35)', opacity: (!itemId || !stayId || saving) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            Criar Pedido
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CatalogFormModal ─────────────────────────────────────────────────────────

function CatalogFormModal({ form, setForm, editingId, saving, onClose, onSave }: {
  form: ItemForm;
  setForm: React.Dispatch<React.SetStateAction<ItemForm>>;
  editingId: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-3xl w-full max-w-2xl my-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm uppercase tracking-wide">{editingId ? 'Editar Item' : 'Novo Item'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Category */}
          <div>
            <label className="field-label">Categoria</label>
            <div className="flex gap-2">
              {(['consumption', 'loan'] as ConciergeCategory[]).map(cat => (
                <button key={cat} onClick={() => setForm(prev => ({ ...prev, category: cat }))} className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wide transition-all', form.category === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground hover:text-foreground')}>
                  {cat === 'consumption' ? <ShoppingBag size={13} /> : <Package size={13} />}
                  {cat === 'consumption' ? 'Consumo' : 'Empréstimo'}
                </button>
              ))}
            </div>
          </div>
          {/* Image */}
          <div>
            <label className="field-label">Imagem</label>
            <ImageUpload value={form.image_url} onUploadSuccess={(url) => setForm(prev => ({ ...prev, image_url: url }))} path="concierge-items" />
          </div>
          {/* Names */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([{ lang: 'PT', key: 'name' as const, ph: 'Ex: Lenha', req: true }, { lang: 'EN', key: 'name_en' as const, ph: 'E.g. Firewood' }, { lang: 'ES', key: 'name_es' as const, ph: 'Ej: Leña' }]).map(({ lang, key, ph, req }) => (
              <div key={key}>
                <label className="field-label">Nome ({lang}){req ? ' *' : ''}</label>
                <input className="field-input" value={form[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} placeholder={ph} />
              </div>
            ))}
          </div>
          {/* Descriptions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['description', 'description_en', 'description_es'] as const).map((key, i) => (
              <div key={key}>
                <label className="field-label">Descrição ({['PT', 'EN', 'ES'][i]})</label>
                <textarea className="field-input resize-none" rows={2} value={form[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          {/* Pricing */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="field-label">Preço (R$)</label>
              <input type="number" min="0" step="0.01" className="field-input" value={form.price} onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))} />
            </div>
            {form.category === 'loan' && (
              <div>
                <label className="field-label">Multa Extravio (R$)</label>
                <input type="number" min="0" step="0.01" className="field-input" value={form.loss_price} placeholder="0.00" onChange={e => setForm(prev => ({ ...prev, loss_price: e.target.value }))} />
              </div>
            )}
            <div>
              <label className="field-label">Qtd Inclusa</label>
              <input type="number" min="0" className="field-input" value={form.included_qty} onChange={e => setForm(prev => ({ ...prev, included_qty: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Ordem</label>
              <input type="number" min="0" className="field-input" value={form.order} onChange={e => setForm(prev => ({ ...prev, order: e.target.value }))} />
            </div>
          </div>
          {/* Availability */}
          <div className="space-y-2">
            <label className="field-label">Disponibilidade</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'availableForGuest' as const, label: 'Hóspede', Icon: User, on: 'bg-blue-500/10 border-blue-500/40 text-blue-600', check: 'bg-blue-500 border-blue-500' },
                { key: 'availableForMaid' as const, label: 'Camareira', Icon: Wrench, on: 'bg-orange-500/10 border-orange-500/40 text-orange-600', check: 'bg-orange-500 border-orange-500' },
              ].map(({ key, label, Icon, on, check }) => (
                <button key={key} type="button" onClick={() => setForm(prev => ({ ...prev, [key]: !prev[key] }))} className={cn('flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all', form[key] ? on : 'bg-secondary border-border text-muted-foreground')}>
                  <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors', form[key] ? check : 'border-muted-foreground/40')}>
                    {form[key] && <span className="text-white text-[10px] font-black">✓</span>}
                  </div>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>
          </div>
          {/* Active */}
          <div className="flex items-center gap-3">
            <button onClick={() => setForm(prev => ({ ...prev, active: !prev.active }))} className={cn('relative w-11 h-6 rounded-full transition-colors', form.active ? 'bg-primary' : 'bg-secondary border border-border')}>
              <span className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform', form.active ? 'translate-x-6' : 'translate-x-1')} />
            </button>
            <span className="text-xs font-semibold text-foreground">{form.active ? 'Ativo' : 'Inativo'}</span>
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-secondary text-foreground text-xs font-bold uppercase tracking-wide hover:bg-border transition-colors">Cancelar</button>
          <button onClick={onSave} disabled={saving} className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
