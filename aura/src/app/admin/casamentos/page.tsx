"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { supabase } from "@/lib/supabase";
import { Wedding, WeddingStatus } from "@/types/aura";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useConfigDeepLink } from "@/lib/settings-deeplink";
import { toast } from "sonner";
import { Heart, Shield, Clock, Sparkles, Search, Grid3X3, List, ChevronRight, Plus, Bed, Users, Loader2 } from "lucide-react";
import { T, alpha, fmt, todayIso, daysUntil, nightsBetween, fmtMoney, STATUS_CFG, Pill, leadState, installmentSummary } from "./_components/lib";
import { WeddingFormModal } from "./_components/WeddingFormModal";
import { DetailDrawer } from "./_components/DetailDrawer";
import { LeadSettingsModal } from "./_components/LeadSettingsModal";
import { LostReasonModal } from "./_components/LostReasonModal";

type FilterStatus = 'all' | WeddingStatus | 'followup_due';
type FilterExcl = 'all' | 'exclusive' | 'nonexclusive';
type ViewMode = 'grid' | 'list';

// ─── Wedding card ─────────────────────────────────────────────────────────────

function WeddingCard({ wedding, cabinsTotal, onOpen, view, showFinancial, highlightExclusive }: {
  wedding: Wedding; cabinsTotal: number; onOpen: (w: Wedding) => void; view: ViewMode;
  showFinancial: boolean; highlightExclusive: boolean;
}) {
  const sc = STATUS_CFG[wedding.status];
  const days = daysUntil(wedding.weddingDate);
  const isUpcoming = wedding.status === "confirmed" || wedding.status === "tentative";
  const nights = nightsBetween(wedding.checkin, wedding.checkout);
  const vendors = wedding.vendors ?? [];
  const fin = wedding.contractTotal;
  const { paidPct } = installmentSummary(wedding);
  const vendorConfirmed = vendors.filter(v => v.confirmed).length;

  const accentColor = wedding.status === "completed" ? T.muted
    : wedding.exclusivity && highlightExclusive ? T.violet
    : wedding.status === "tentative" ? T.amber
    : T.rose;

  if (view === "list") {
    return (
      <div
        onClick={() => onOpen(wedding)}
        style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, cursor: "pointer", transition: "all .15s" }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = T.glass2; el.style.borderColor = T.border2; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = T.card; el.style.borderColor = T.border; }}
      >
        <div style={{ display: "flex", flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.gradSoft, border: "2px solid rgba(155,109,255,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: T.g1, zIndex: 2, position: "relative" }}>
            {wedding.brideShort ?? wedding.bride.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.roseBg, border: `2px solid ${T.roseBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: T.rose, marginLeft: -8, zIndex: 1, position: "relative" }}>
            {wedding.groomShort ?? wedding.groom.slice(0, 2).toUpperCase()}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wedding.bride} ♥ {wedding.groom}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{fmt(wedding.weddingDate)} · {wedding.guestCount} convidados · {nights}n</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          <Pill label={sc.label} bg={sc.pillBg} color={sc.pillColor} border={sc.pillBorder} />
          {wedding.exclusivity && highlightExclusive && <Pill label="Exclusivo" bg={T.violetBg} color={T.violet} border={T.violetBorder} />}
          {isUpcoming && days >= 0 && <Pill label={`${days}d`} bg={days <= 30 ? T.redBg : days <= 90 ? T.amberBg : T.glass2} color={days <= 30 ? T.red : days <= 90 ? T.amber : T.muted} border={days <= 30 ? T.redBorder : days <= 90 ? T.amberBorder : T.border2} />}
        </div>
        {showFinancial && (
          <div style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: T.g1 }}>{fmtMoney(fin)}</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{paidPct}% pago</div>
          </div>
        )}
        <ChevronRight size={16} color={T.muted2} />
      </div>
    );
  }

  return (
    <div
      onClick={() => onOpen(wedding)}
      style={{ background: T.card, borderRadius: 20, overflow: "hidden", cursor: "pointer", border: `1px solid ${T.border}`, transition: "all .15s", display: "flex", flexDirection: "column" }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = T.border2; el.style.transform = "translateY(-2px)"; el.style.boxShadow = "0 12px 40px rgba(0,0,0,.4)"; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = T.border; el.style.transform = "none"; el.style.boxShadow = "none"; }}
    >
      <div style={{ height: 4, background: `linear-gradient(90deg,${accentColor},${accentColor}88)`, opacity: .8 }} />
      <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex" }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: T.gradSoft, border: "2px solid rgba(155,109,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: T.g1, zIndex: 2, position: "relative" }}>
              {wedding.brideShort ?? wedding.bride.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: T.roseBg, border: `2px solid ${T.roseBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: T.rose, marginLeft: -10, zIndex: 1, position: "relative" }}>
              {wedding.groomShort ?? wedding.groom.slice(0, 2).toUpperCase()}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <Pill label={sc.label} bg={sc.pillBg} color={sc.pillColor} border={sc.pillBorder} />
            {wedding.exclusivity && highlightExclusive && <Pill label="Exclusivo" bg={T.violetBg} color={T.violet} border={T.violetBorder} />}
            {(() => {
              const st = leadState(wedding, todayIso());
              if (st.tone !== "overdue" && st.tone !== "today") return null;
              return <Pill label={st.label}
                bg={st.tone === "overdue" ? T.redBg : T.amberBg}
                color={st.tone === "overdue" ? T.red : T.amber}
                border={st.tone === "overdue" ? T.redBorder : T.amberBorder} />;
            })()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.25, marginBottom: 4 }}>
            {wedding.bride?.split(" ")[0] ?? ""} <span style={{ color: T.rose }}>♥</span> {wedding.groom?.split(" ")[0] ?? ""}
          </div>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
            {wedding.bride?.split(" ").slice(1).join(" ") ?? ""} &amp; {wedding.groom?.split(" ").slice(1).join(" ") ?? ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Heart size={12} color={accentColor} />
            <span style={{ fontSize: 12, fontWeight: 700, color: accentColor }}>{fmt(wedding.weddingDate)}</span>
            {isUpcoming && days >= 0 && (
              <Pill label={`em ${days}d`} bg={days <= 30 ? T.redBg : days <= 60 ? T.amberBg : T.glass2} color={days <= 30 ? T.red : days <= 60 ? T.amber : T.muted} border={days <= 30 ? T.redBorder : days <= 60 ? T.amberBorder : T.border2} style={{ marginLeft: "auto", fontSize: 8 }} />
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={12} color={T.muted2} />
            <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{wedding.guestCount} convidados</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bed size={12} color={T.muted2} />
            <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{fmt(wedding.checkin)} → {fmt(wedding.checkout)} · {nights}n</span>
          </div>
          {wedding.exclusivity && wedding.cabinsOccupied != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={12} color={T.violet} />
              <span style={{ fontSize: 12, color: T.violet, fontWeight: 700 }}>{wedding.cabinsOccupied}/{cabinsTotal} cabanas reservadas</span>
              <span style={{ fontSize: 11, color: T.green, fontWeight: 700, marginLeft: "auto" }}>{cabinsTotal - (wedding.cabinsOccupied ?? 0)} livres</span>
            </div>
          )}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Fornecedores</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.green }}>{vendorConfirmed}/{vendors.length}</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: T.glass3, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 999, background: T.green, width: `${(vendorConfirmed / Math.max(1, vendors.length)) * 100}%` }} />
          </div>
        </div>
        {showFinancial && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Contrato</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: T.g1, marginTop: 2 }}>{fmtMoney(fin)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Recebido</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: paidPct === 100 ? T.green : T.amber, marginTop: 2 }}>{paidPct}%</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function CasamentosPageInner() {
  const { currentProperty: property, loading: propLoading } = useProperty();

  const [weddings, setWeddings] = useState<Wedding[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Wedding | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterExcl, setFilterExcl] = useState<FilterExcl>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [showFinancial] = useState(true);
  const [highlightExclusive] = useState(true);
  const [cabinsTotal, setCabinsTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Wedding | null>(null);
  const [leadSettingsOpen, setLeadSettingsOpen] = useState(false);
  // Link do hub abre o modal de prazos direto.
  useConfigDeepLink({ prazos: () => setLeadSettingsOpen(true) });

  // Deep-link ?weddingId= — o hub Comercial abre o drawer do casamento direto.
  const searchParams = useSearchParams();
  const weddingIdHandled = useRef(false);
  useEffect(() => {
    const wid = searchParams.get("weddingId");
    if (!wid || weddingIdHandled.current || weddings.length === 0) return;
    const found = weddings.find(w => w.id === wid);
    if (found) { weddingIdHandled.current = true; setSelected(found); }
  }, [searchParams, weddings]);
  const [deleting, setDeleting] = useState(false);

  const loadWeddings = useCallback(async () => {
    if (!property) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/weddings?propertyId=${property.id}`);
      if (!res.ok) throw new Error('Erro ao carregar casamentos');
      const list: Wedding[] = await res.json();
      setWeddings(list);
      // Mantém o drawer aberto em sincronia com o servidor: sem isso, editar o
      // casamento (ex.: vincular a tabela de tarifa) deixava a aba Site com o
      // objeto velho e o checklist de ativação travado no vermelho.
      setSelected(prev => (prev ? (list.find(w => w.id === prev.id) ?? prev) : prev));
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao carregar casamentos');
    } finally {
      setLoading(false);
    }
  }, [property]);

  useEffect(() => {
    loadWeddings();
  }, [loadWeddings]);

  useEffect(() => {
    if (!property) return;
    supabase.from('cabins').select('id', { count: 'exact', head: true }).eq('propertyId', property.id)
      .then((res: { count: number | null }) => { if (res.count) setCabinsTotal(res.count); });
  }, [property]);

  const handleEdit = useCallback((w: Wedding) => {
    setEditTarget(w);
    setFormOpen(true);
  }, []);

  // Troca só o status, sem passar pelo formulário completo — e confere o
  // resultado relendo do servidor, para não "dar certo" na tela e não no banco.
  const handleStatusChange = useCallback(async (w: Wedding, status: WeddingStatus) => {
    try {
      const res = await fetch(`/api/admin/weddings/${w.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao atualizar o status');
      }
      await loadWeddings();
      setSelected(prev => (prev && prev.id === w.id ? { ...prev, status } : prev));
      toast.success(status === 'completed' ? 'Casamento marcado como realizado.' : 'Status atualizado.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar o status');
    }
  }, [loadWeddings]);

  const handleDelete = useCallback(async (w: Wedding) => {
    if (!confirm(`Excluir o casamento de ${w.bride} & ${w.groom}? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/weddings/${w.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir');
      toast.success('Casamento excluído.');
      setSelected(null);
      loadWeddings();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  }, [loadWeddings]);

  const handleFollowUp = useCallback(async (w: Wedding) => {
    const note = window.prompt(`Follow-up com ${w.bride} & ${w.groom}\n\nO que ficou combinado? (opcional)`);
    if (note === null) return; // cancelou
    try {
      const res = await fetch(`/api/admin/weddings/${w.id}/follow-up`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao registrar o follow-up');
      }
      const d = await res.json();
      await loadWeddings();
      setSelected(prev => prev && prev.id === w.id
        ? { ...prev, followUpAt: d.followUpAt, expiresAt: d.expiresAt } : prev);
      toast.success(`Follow-up registrado. Próximo em ${fmt(d.followUpAt)}, validade até ${fmt(d.expiresAt)}.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar o follow-up');
    }
  }, [loadWeddings]);

  const handleMarkLost = useCallback(async (w: Wedding, reason: string) => {
    try {
      const res = await fetch(`/api/admin/weddings/${w.id}/lost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao arquivar a negociação');
      }
      await loadWeddings();
      setSelected(null);
      toast.success('Negociação arquivada como perdida.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao arquivar a negociação');
    }
  }, [loadWeddings]);

  const filtered = useMemo(() => weddings
    .filter(w => {
      if (filterStatus === "followup_due") {
        if (w.status !== "tentative") return false;
        const st = leadState(w, todayIso()).tone;
        if (st !== "overdue" && st !== "today") return false;
      } else if (filterStatus !== "all" && w.status !== filterStatus) return false;
      if (filterExcl === "exclusive" && !w.exclusivity) return false;
      if (filterExcl === "nonexclusive" && w.exclusivity) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!w.bride.toLowerCase().includes(q) && !w.groom.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    // Ativos primeiro (o que a operação precisa ver), do mais próximo ao mais
    // distante; realizados e cancelados vão para o fim, do mais recente ao mais
    // antigo. Antes era só por data, então o histórico enterrava os confirmados.
    .sort((a, b) => {
      const rank = (s: WeddingStatus) =>
        s === "completed" ? 1 : s === "cancelled" ? 2 : s === "lost" ? 3 : 0;
      const ra = rank(a.status), rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      const da = new Date(a.weddingDate).getTime();
      const db = new Date(b.weddingDate).getTime();
      return ra === 0 ? da - db : db - da;
    }),
    [weddings, filterStatus, filterExcl, search]
  );

  const upcoming = weddings.filter(w => w.status === "confirmed" || w.status === "tentative");
  const exclusive = weddings.filter(w => w.exclusivity && (w.status === "confirmed" || w.status === "tentative"));
  // Receita não conta o que caiu nem o que nunca fechou.
  const totalRevenue = weddings
    .filter(w => w.status !== "cancelled" && w.status !== "lost")
    .reduce((s, w) => s + w.contractTotal, 0);
  const lostRevenue = weddings
    .filter(w => w.status === "lost")
    .reduce((s, w) => s + (w.contractTotal || 0), 0);
  const pendingVendors = weddings.flatMap(w => w.vendors ?? []).filter(v => !v.confirmed).length;

  const kpis = [
    { label: "Próximos eventos",       value: upcoming.length,       sub: "confirmados ou em neg.", color: T.rose,   bg: T.roseBg,   border: T.roseBorder,   icon: Heart    },
    { label: "Com exclusividade",      value: exclusive.length,      sub: "pousada reservada",      color: T.violet, bg: T.violetBg, border: T.violetBorder, icon: Shield   },
    { label: "Fornecedores pendentes", value: pendingVendors,        sub: "aguardando confirmação", color: T.amber,  bg: T.amberBg,  border: T.amberBorder,  icon: Clock    },
    { label: "Receita total",          value: fmtMoney(totalRevenue),
      sub: lostRevenue > 0 ? `${fmtMoney(lostRevenue)} em negociações perdidas` : "todos os contratos",
      color: T.g1,     bg: T.gradSoft, border: "rgba(155,109,255,0.22)", icon: Sparkles },
  ];

  if (propLoading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: T.g1 }} />
    </div>
  );

  if (!property) return (
    <div className="flex items-center justify-center h-[60vh]">
      <p className="text-sm" style={{ color: T.muted }}>Selecione uma propriedade.</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      <style>{`
        @keyframes wedding-fade-in { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:translateY(0) } }
        @keyframes wedding-slide-in { from { opacity:0; transform:translateX(24px) } to { opacity:1; transform:translateX(0) } }
      `}</style>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[10px] mb-[14px]">
        {kpis.map((k, i) => (
          <div key={i} style={{ background: T.card, border: `1px solid ${k.border}`, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, animation: `wedding-fade-in .3s ease ${i * .07}s both`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -20, right: -20, width: 70, height: 70, borderRadius: "50%", background: `radial-gradient(circle,${alpha(k.color, 10)} 0%,transparent 70%)`, pointerEvents: "none" }} />
            <div style={{ width: 36, height: 36, borderRadius: 10, background: k.bg, border: `1px solid ${k.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <k.icon size={16} color={k.color} />
            </div>
            <div>
              <div style={{ fontSize: typeof k.value === "string" ? 16 : 22, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: typeof k.value === "string" ? "-.3px" : "-1px" }}>{k.value}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4, fontWeight: 600 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.glass, border: `1px solid ${T.border2}`, borderRadius: 10, padding: "7px 12px", flex: 1, maxWidth: 280 }}>
          <Search size={13} color={T.muted} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome do casal…" style={{ background: "none", border: "none", outline: "none", color: T.text, fontFamily: "inherit", fontSize: 13, flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {([
            { id: "all",       label: "Todos"      },
            { id: "confirmed", label: "Confirmado" },
            { id: "tentative", label: "Em neg."    },
            { id: "followup_due", label: "Follow-up" },
            { id: "completed", label: "Realizado"  },
            { id: "cancelled", label: "Cancelado"  },
            { id: "lost",      label: "Perdido"    },
          ] as { id: FilterStatus; label: string }[]).map(f => (
            <button key={f.id} onClick={() => setFilterStatus(f.id)} style={{ padding: "7px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: filterStatus === f.id ? "rgba(155,109,255,0.15)" : T.glass, color: filterStatus === f.id ? T.g1 : T.muted, outline: filterStatus === f.id ? `1px solid rgba(155,109,255,.28)` : `1px solid ${T.border}`, transition: "all .15s" }}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {([
            { id: "all",          label: "Todos"      },
            { id: "exclusive",    label: "Exclusivo"  },
            { id: "nonexclusive", label: "Sem exclus."},
          ] as { id: FilterExcl; label: string }[]).map(f => (
            <button key={f.id} onClick={() => setFilterExcl(f.id)} style={{ padding: "7px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: filterExcl === f.id ? T.violetBg : T.glass, color: filterExcl === f.id ? T.violet : T.muted, outline: filterExcl === f.id ? `1px solid ${T.violetBorder}` : `1px solid ${T.border}`, transition: "all .15s" }}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 2, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, marginLeft: "auto" }}>
          {([{ id: "grid" as ViewMode, Icon: Grid3X3 }, { id: "list" as ViewMode, Icon: List }]).map(({ id, Icon }) => (
            <button key={id} onClick={() => setView(id)} style={{ width: 30, height: 28, borderRadius: 7, border: "none", cursor: "pointer", background: view === id ? T.card : "transparent", color: view === id ? T.text : T.muted, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s" }}>
              <Icon size={14} />
            </button>
          ))}
        </div>
        <button onClick={() => setLeadSettingsOpen(true)} title="Prazos das negociações"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: `1px solid ${T.border2}`, background: T.glass, cursor: "pointer", color: T.muted, fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
          <Clock size={13} /> Prazos
        </button>
        <button onClick={() => { setEditTarget(null); setFormOpen(true); }} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10, border: "none", background: T.grad, cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "inherit", boxShadow: "0 4px 14px rgba(155,109,255,.3)" }}>
          <Plus size={14} color="#fff" /> Novo Casamento
        </button>
      </div>

      {/* Cards */}
      <div>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 0", gap: 12, color: T.muted }}>
            <Loader2 size={20} className="animate-spin" style={{ color: T.g1 }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Carregando casamentos…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 0", gap: 12, color: T.muted }}>
            <Heart size={32} color={T.muted2} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>{weddings.length === 0 ? "Nenhum casamento cadastrado" : "Nenhum casamento encontrado"}</div>
          </div>
        ) : view === "grid" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
            {filtered.map((w, i) => (
              <div key={w.id} style={{ animation: `wedding-fade-in .3s ease ${i * .06}s both` }}>
                <WeddingCard wedding={w} cabinsTotal={cabinsTotal} onOpen={setSelected} view="grid" showFinancial={showFinancial} highlightExclusive={highlightExclusive} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 900, margin: "0 auto" }}>
            {filtered.map((w, i) => (
              <div key={w.id} style={{ animation: `wedding-fade-in .2s ease ${i * .05}s both` }}>
                <WeddingCard wedding={w} cabinsTotal={cabinsTotal} onOpen={setSelected} view="list" showFinancial={showFinancial} highlightExclusive={highlightExclusive} />
              </div>
            ))}
          </div>
        )}
      </div>

      <DetailDrawer wedding={selected} cabinsTotal={cabinsTotal} onClose={() => setSelected(null)} showFinancial={showFinancial} onEdit={handleEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} onMarkLost={handleMarkLost} onFollowUp={handleFollowUp} onDataChanged={loadWeddings} />
      <WeddingFormModal open={formOpen} initial={editTarget} propertyId={property.id} onClose={() => setFormOpen(false)} onSaved={loadWeddings} />
      {leadSettingsOpen && <LeadSettingsModal propertyId={property.id} onClose={() => setLeadSettingsOpen(false)} />}
    </div>
  );
}

export default function CasamentosPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception", "manager"]}>
      <CasamentosPageInner />
    </RoleGuard>
  );
}

