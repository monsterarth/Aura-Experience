"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { supabase } from "@/lib/supabase";
import { Wedding, WeddingStatus } from "@/types/aura";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useConfigDeepLink } from "@/lib/settings-deeplink";
import { toast } from "sonner";
import { Heart, Shield, Clock, Sparkles, Grid3X3, List, ChevronRight, Plus, Bed, Users } from "lucide-react";
import { T, fmt, todayIso, daysUntil, nightsBetween, fmtMoney, STATUS_CFG, Pill, leadState, installmentSummary } from "./_components/lib";
import { WeddingFormModal } from "./_components/WeddingFormModal";
import { DetailDrawer } from "./_components/DetailDrawer";
import { LeadSettingsModal } from "./_components/LeadSettingsModal";
import {
  PageShell, PageHeader, KpiGrid, KpiCard, Card, SearchInput, FilterChips, SegmentedTabs, Button,
  Loadable, SkeletonCards, EmptyState, PageSkeleton, useConfirm, usePrompt,
} from "@/components/aura";

type FilterStatus = "all" | WeddingStatus | "followup_due";
type FilterExcl = "all" | "exclusive" | "nonexclusive";
type ViewMode = "grid" | "list";

// ─── Wedding card ─────────────────────────────────────────────────────────────

function CoupleAvatars({ wedding, size = 42 }: { wedding: Wedding; size?: number }) {
  const r = Math.round(size * 0.31);
  return (
    <div style={{ display: "flex", flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: r, background: T.gradSoft, border: `2px solid ${T.g1Border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 36 ? 13 : 11, fontWeight: 900, color: T.brandText, zIndex: 2, position: "relative" }}>
        {wedding.brideShort ?? wedding.bride.slice(0, 2).toUpperCase()}
      </div>
      <div style={{ width: size, height: size, borderRadius: r, background: T.roseBg, border: `2px solid ${T.roseBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 36 ? 13 : 11, fontWeight: 900, color: T.rose, marginLeft: -Math.round(size * 0.24), zIndex: 1, position: "relative" }}>
        {wedding.groomShort ?? wedding.groom.slice(0, 2).toUpperCase()}
      </div>
    </div>
  );
}

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
      <Card pad={12} interactive onClick={() => onOpen(wedding)} style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <CoupleAvatars wedding={wedding} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: T.text }}>{wedding.bride} ♥ {wedding.groom}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{fmt(wedding.weddingDate)} · {wedding.guestCount} convidados · {nights}n</div>
          <div className="sm:hidden" style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <Pill label={sc.label} bg={sc.pillBg} color={sc.pillColor} border={sc.pillBorder} />
            {isUpcoming && days >= 0 && <Pill label={`${days}d`} bg={days <= 30 ? T.redBg : days <= 90 ? T.amberBg : T.glass2} color={days <= 30 ? T.red : days <= 90 ? T.amber : T.muted} border={days <= 30 ? T.redBorder : days <= 90 ? T.amberBorder : T.border2} />}
          </div>
        </div>
        <div className="hidden sm:flex" style={{ gap: 6, flexShrink: 0, alignItems: "center" }}>
          <Pill label={sc.label} bg={sc.pillBg} color={sc.pillColor} border={sc.pillBorder} />
          {wedding.exclusivity && highlightExclusive && <Pill label="Exclusivo" bg={T.violetBg} color={T.violet} border={T.violetBorder} />}
          {isUpcoming && days >= 0 && <Pill label={`${days}d`} bg={days <= 30 ? T.redBg : days <= 90 ? T.amberBg : T.glass2} color={days <= 30 ? T.red : days <= 90 ? T.amber : T.muted} border={days <= 30 ? T.redBorder : days <= 90 ? T.amberBorder : T.border2} />}
        </div>
        {showFinancial && (
          <div className="hidden sm:block" style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: T.brandText }}>{fmtMoney(fin)}</div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{paidPct}% pago</div>
          </div>
        )}
        <ChevronRight size={16} color={T.muted2} />
      </Card>
    );
  }

  return (
    <Card pad={0} interactive onClick={() => onOpen(wedding)} style={{ overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ height: 4, background: `linear-gradient(90deg,${accentColor},transparent)`, opacity: .85 }} />
      <div style={{ padding: 18, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <CoupleAvatars wedding={wedding} />
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
          <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.25, marginBottom: 4, color: T.text }}>
            {wedding.bride?.split(" ")[0] ?? ""} <span style={{ color: T.rose }}>♥</span> {wedding.groom?.split(" ")[0] ?? ""}
          </div>
          {(() => {
            const bs = wedding.bride?.split(" ").slice(1).join(" ") ?? "";
            const gs = wedding.groom?.split(" ").slice(1).join(" ") ?? "";
            if (!bs && !gs) return null;
            return <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{bs} &amp; {gs}</div>;
          })()}
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
              <div style={{ fontSize: 15, fontWeight: 900, color: T.brandText, marginTop: 2 }}>{fmtMoney(fin)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Recebido</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: paidPct === 100 ? T.green : T.amber, marginTop: 2 }}>{paidPct}%</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { id: FilterStatus; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "confirmed", label: "Confirmado" },
  { id: "tentative", label: "Em neg." },
  { id: "followup_due", label: "Follow-up" },
  { id: "completed", label: "Realizado" },
  { id: "cancelled", label: "Cancelado" },
  { id: "lost", label: "Perdido" },
];
const EXCL_FILTERS: { id: FilterExcl; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "exclusive", label: "Exclusivo" },
  { id: "nonexclusive", label: "Sem exclus." },
];

function CasamentosPageInner() {
  const { currentProperty: property, loading: propLoading } = useProperty();
  const confirm = useConfirm();
  const prompt = usePrompt();

  const [weddings, setWeddings] = useState<Wedding[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadWeddings = useCallback(async () => {
    if (!property) return;
    try {
      const res = await fetch(`/api/admin/weddings?propertyId=${property.id}`);
      if (!res.ok) throw new Error("Erro ao carregar casamentos");
      const list: Wedding[] = await res.json();
      setWeddings(list);
      // Mantém o drawer aberto em sincronia com o servidor: sem isso, editar o
      // casamento (ex.: vincular a tabela de tarifa) deixava a aba Site com o
      // objeto velho e o checklist de ativação travado no vermelho.
      setSelected(prev => (prev ? (list.find(w => w.id === prev.id) ?? prev) : prev));
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar casamentos");
    } finally {
      setLoading(false);
    }
  }, [property]);

  useEffect(() => { loadWeddings(); }, [loadWeddings]);

  useEffect(() => {
    if (!property) return;
    supabase.from("cabins").select("id", { count: "exact", head: true }).eq("propertyId", property.id)
      .then((res: { count: number | null }) => { if (res.count) setCabinsTotal(res.count); });
  }, [property]);

  const handleEdit = useCallback((w: Wedding) => { setEditTarget(w); setFormOpen(true); }, []);

  // Troca só o status, sem passar pelo formulário completo — e confere o
  // resultado relendo do servidor, para não "dar certo" na tela e não no banco.
  const handleStatusChange = useCallback(async (w: Wedding, status: WeddingStatus) => {
    try {
      const res = await fetch(`/api/admin/weddings/${w.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao atualizar o status");
      }
      await loadWeddings();
      setSelected(prev => (prev && prev.id === w.id ? { ...prev, status } : prev));
      toast.success(status === "completed" ? "Casamento marcado como realizado." : "Status atualizado.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar o status");
    }
  }, [loadWeddings]);

  const handleDelete = useCallback(async (w: Wedding) => {
    const ok = await confirm({ title: "Excluir casamento?", description: `${w.bride} & ${w.groom} — esta ação não pode ser desfeita.`, confirmLabel: "Excluir", tone: "danger" });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/weddings/${w.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      toast.success("Casamento excluído.");
      setSelected(null);
      loadWeddings();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
  }, [loadWeddings, confirm]);

  const handleFollowUp = useCallback(async (w: Wedding) => {
    const note = await prompt({ title: `Follow-up com ${w.bride} & ${w.groom}`, description: "O que ficou combinado? (opcional)", placeholder: "Ex.: ligaram pedindo a proposta atualizada", inputType: "textarea", confirmLabel: "Registrar" });
    if (note === null) return; // cancelou
    try {
      const res = await fetch(`/api/admin/weddings/${w.id}/follow-up`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao registrar o follow-up");
      }
      const d = await res.json();
      await loadWeddings();
      setSelected(prev => prev && prev.id === w.id ? { ...prev, followUpAt: d.followUpAt, expiresAt: d.expiresAt } : prev);
      toast.success(`Follow-up registrado. Próximo em ${fmt(d.followUpAt)}, validade até ${fmt(d.expiresAt)}.`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar o follow-up");
    }
  }, [loadWeddings, prompt]);

  const handleMarkLost = useCallback(async (w: Wedding, reason: string) => {
    try {
      const res = await fetch(`/api/admin/weddings/${w.id}/lost`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao arquivar a negociação");
      }
      await loadWeddings();
      setSelected(null);
      toast.success("Negociação arquivada como perdida.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao arquivar a negociação");
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
    // distante; realizados e cancelados vão para o fim, do mais recente ao mais antigo.
    .sort((a, b) => {
      const rank = (s: WeddingStatus) => s === "completed" ? 1 : s === "cancelled" ? 2 : s === "lost" ? 3 : 0;
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
  const totalRevenue = weddings.filter(w => w.status !== "cancelled" && w.status !== "lost").reduce((s, w) => s + w.contractTotal, 0);
  const lostRevenue = weddings.filter(w => w.status === "lost").reduce((s, w) => s + (w.contractTotal || 0), 0);
  const pendingVendors = weddings.flatMap(w => w.vendors ?? []).filter(v => !v.confirmed).length;

  if (propLoading) return <PageShell><PageSkeleton kpis={4} rows={4} /></PageShell>;
  if (!property) return <PageShell><EmptyState icon={Heart} title="Selecione uma propriedade" description="Os casamentos são por propriedade." /></PageShell>;

  return (
    <PageShell>
      <PageHeader
        icon={Heart}
        iconTone="rose"
        title="Casamentos"
        subtitle="Negociações, eventos confirmados e hospedagem dos convidados"
        primaryAction={{ label: "Novo casamento", icon: Plus, onClick: () => { setEditTarget(null); setFormOpen(true); } }}
        actions={(
          <>
            <SegmentedTabs<ViewMode> items={[{ id: "grid", label: "Cards", icon: Grid3X3 }, { id: "list", label: "Lista", icon: List }]} value={view} onChange={setView} size="sm" iconOnlyOnMobile ariaLabel="Modo de visualização" />
            <Button variant="secondary" icon={Clock} onClick={() => setLeadSettingsOpen(true)}>Prazos</Button>
          </>
        )}
      />

      <KpiGrid cols={4}>
        <KpiCard label="Próximos eventos" value={upcoming.length} sub="confirmados ou em neg." icon={Heart} tone="rose" />
        <KpiCard label="Com exclusividade" value={exclusive.length} sub="pousada reservada" icon={Shield} tone="violet" />
        <KpiCard label="Fornecedores pendentes" value={pendingVendors} sub="aguardando confirmação" icon={Clock} tone="amber" />
        <KpiCard label="Receita total" value={fmtMoney(totalRevenue)} sub={lostRevenue > 0 ? `${fmtMoney(lostRevenue)} em negociações perdidas` : "todos os contratos"} icon={Sparkles} tone="brand" />
      </KpiGrid>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Nome do casal…" wrapStyle={{ flex: "1 1 220px", maxWidth: 320 }} />
          <FilterChips<FilterExcl> items={EXCL_FILTERS} value={filterExcl} onChange={v => setFilterExcl(v ?? "all")} ariaLabel="Exclusividade" scroll={false} />
        </div>
        <FilterChips<FilterStatus> items={STATUS_FILTERS} value={filterStatus} onChange={v => setFilterStatus(v ?? "all")} ariaLabel="Status" />
      </div>

      <Loadable loading={loading} skeleton={<SkeletonCards n={6} minWidth={300} />} isEmpty={filtered.length === 0}
        empty={<EmptyState icon={Heart} tone="rose" title={weddings.length === 0 ? "Nenhum casamento cadastrado" : "Nenhum casamento encontrado"} description={weddings.length === 0 ? "Cadastre a primeira negociação para acompanhar prazos, fornecedores e hospedagem." : "Ajuste os filtros ou a busca."} action={weddings.length === 0 ? { label: "Novo casamento", icon: Plus, onClick: () => { setEditTarget(null); setFormOpen(true); } } : undefined} />}>
        {view === "grid" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(300px,100%),1fr))", gap: 12 }}>
            {filtered.map(w => (
              <WeddingCard key={w.id} wedding={w} cabinsTotal={cabinsTotal} onOpen={setSelected} view="grid" showFinancial={showFinancial} highlightExclusive={highlightExclusive} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 900, margin: "0 auto", width: "100%" }}>
            {filtered.map(w => (
              <WeddingCard key={w.id} wedding={w} cabinsTotal={cabinsTotal} onOpen={setSelected} view="list" showFinancial={showFinancial} highlightExclusive={highlightExclusive} />
            ))}
          </div>
        )}
      </Loadable>

      <DetailDrawer wedding={selected} cabinsTotal={cabinsTotal} onClose={() => setSelected(null)} showFinancial={showFinancial} onEdit={handleEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} onMarkLost={handleMarkLost} onFollowUp={handleFollowUp} onDataChanged={loadWeddings} />
      <WeddingFormModal open={formOpen} initial={editTarget} propertyId={property.id} onClose={() => setFormOpen(false)} onSaved={loadWeddings} />
      <LeadSettingsModal open={leadSettingsOpen} propertyId={property.id} onClose={() => setLeadSettingsOpen(false)} />
    </PageShell>
  );
}

export default function CasamentosPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception", "manager"]}>
      <CasamentosPageInner />
    </RoleGuard>
  );
}
