//src/app/admin/stays/page.tsx

"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive, ArrowUpRight, Ban, CalendarClock, DollarSign, Home, LogIn,
  MessageCircle, Plus, Receipt, SearchX, ShieldAlert, Star,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { StayService } from "@/services/stay-service";
import { chatwootSyncOnCheckIn, chatwootSyncOnCancelled } from "@/app/actions/chatwoot-actions";
import { T } from "@/lib/admin-tokens";
import {
  PageShell, PageHeader, SegmentedTabs, Loadable, SkeletonCards, SkeletonList,
  EmptyState, DataList, Pill, useConfirm, useAlert, useTabParam,
  type Column, type RowAction,
} from "@/components/aura";
import { GuestContactModal } from "@/components/admin/GuestContactModal";
import { CheckoutKeyDialog, type KeyLocation } from "@/components/admin/CheckoutKeyDialog";
import { isAccountOpen } from "@/lib/stay-account";
import { StayCard } from "./_components/StayCard";
import { StayListView } from "./_components/StayListView";
import { StaysToolbar } from "./_components/StaysToolbar";
import { GroupSection } from "./_components/GroupSection";
import { useStaysLive } from "./_components/useStaysLive";
import { useStaysPrefs, type PrefTab } from "./_components/useStaysPrefs";
import {
  DEFAULT_SORT, EMPTY_FILTERS, applyFilters, applySearch, applySort, groupFuturas,
  hasDateFilter, isFiltering, type SortState, type StayFilters,
} from "./_components/stay-filters";
import {
  TABS, fmtDay, isDocPending, isInHouse, npsInfo, shortName, titleCase,
  type StayRow, type TabStatus,
} from "./_components/stay-utils";

// Ficha completa (67K) só baixa quando alguém abre uma estadia.
const StayDetailsModal = dynamic(
  () => import("@/components/admin/StayDetailsModal").then(m => m.StayDetailsModal),
  { ssr: false },
);

const StayAccountModal = dynamic(
  () => import("@/components/admin/StayAccountModal").then(m => m.StayAccountModal),
  { ssr: false },
);

// A aba "Conta" saiu: a conta é da estadia. Quem fez check-out e não encerrou a
// conta continua em Ativas, no grupo "Saíram" — a cabana não some da vista de
// quem opera antes do ciclo fechar.
const TAB_ITEMS = [
  { id: "ativas" as const, label: "Ativas", icon: Home },
  { id: "futuras" as const, label: "Futuras", icon: CalendarClock },
  { id: "encerradas" as const, label: "Encerradas", icon: Archive },
];

/** Abas com alternador de modo — as outras têm layout próprio. */
const VIEW_TABS: TabStatus[] = ["ativas", "futuras"];

const REASON_MAP: Record<string, string> = {
  rule_inactive: "Automação de boas-vindas inativa nas configurações.",
  template_missing: "Template de boas-vindas não encontrado.",
  guest_no_phone: "Hóspede sem telefone cadastrado.",
  queue_error: "Falha ao inserir mensagem na fila.",
  exception: "Erro interno ao processar automação.",
};
const CABIN_STATUS_MAP: Record<string, string> = {
  occupied: "ocupada por outra estadia",
  cleaning: "em limpeza",
  maintenance: "em manutenção",
};

export default function StaysPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception", "governance", "manager"]}>
      <StaysPageInner />
    </RoleGuard>
  );
}

function StaysPageInner() {
  const router = useRouter();
  const { userData } = useAuth();
  const { currentProperty: property } = useProperty();
  const confirm = useConfirm();
  const alert = useAlert();

  const [tab, setTab] = useTabParam<TabStatus>("tab", "ativas", TABS);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT.ativas);
  const [filters, setFilters] = useState<StayFilters>(EMPTY_FILTERS);
  const { stays, setStays, loading, error, reload } = useStaysLive(property?.id, tab);
  const { getView, setView } = useStaysPrefs();

  // Ordenação e filtros são do momento, não preferência: cada aba começa no seu
  // padrão e nada fica ligado escondido de uma visita para a outra.
  useEffect(() => {
    setSort(DEFAULT_SORT[tab]);
    setFilters(EMPTY_FILTERS);
    setSearch("");
  }, [tab]);

  const view = VIEW_TABS.includes(tab) ? getView(tab as PrefTab) : "card";

  // Seleção para os modais
  const [selectedStay, setSelectedStay] = useState<StayRow | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<StayRow | null>(null);
  const [selectedCabin, setSelectedCabin] = useState<StayRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [checkoutTarget, setCheckoutTarget] = useState<StayRow | null>(null);
  const [accountTarget, setAccountTarget] = useState<StayRow | null>(null);

  // Estados de progresso por cartão (o botão certo gira, não a página inteira)
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const filtered = useMemo(
    () => applySort(applyFilters(applySearch(stays, search), filters, tab), sort),
    [stays, tab, search, filters, sort],
  );

  // Filtrar por período já é dizer qual janela interessa — agrupar de novo por
  // 72h em cima disso só embaralha a resposta.
  const futureGroups = useMemo(
    () => (tab === "futuras" ? groupFuturas(filtered, !hasDateFilter(filters)) : []),
    [tab, filtered, filters],
  );

  // Ativas em duas frentes: quem está na casa e quem já saiu deixando a conta
  // aberta. Sem ninguém no segundo grupo, a aba volta a ser uma lista simples —
  // cabeçalho de grupo sozinho é ruído.
  const activeGroups = useMemo(() => {
    if (tab !== "ativas") return [];
    const leaving = filtered.filter(s => !isInHouse(s));
    if (leaving.length === 0) return [];
    return [
      { id: "inhouse", label: "Na casa", rows: filtered.filter(isInHouse), tone: "neutral" as const },
      { id: "account", label: "Saíram · conta aberta", rows: leaving, tone: "orange" as const },
    ].filter(g => g.rows.length > 0);
  }, [tab, filtered]);

  const openAccountCount = useMemo(() => stays.filter(isAccountOpen).length, [stays]);

  // ---------- handlers ----------
  const handleOpenFicha = async (s: StayRow) => {
    if (!property?.id) return;
    setOpeningId(s.id);
    try {
      const data = await StayService.getStayWithGuestAndCabinAdmin(property.id, s.id);
      if (data) {
        setSelectedStay({ ...data.stay, guestName: data.guest?.fullName, cabinName: data.cabin?.name });
        setSelectedGuest(data.guest);
        setSelectedCabin(data.cabin ?? null);
        setDetailsOpen(true);
      } else {
        toast.error("Ficha não encontrada para esta reserva.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar ficha.");
    } finally {
      setOpeningId(null);
    }
  };

  const handleOpenWhatsapp = async (s: StayRow) => {
    if (!property?.id) return;
    try {
      const data = await StayService.getStayWithGuestAndCabinAdmin(property.id, s.id);
      if (data?.guest) {
        setSelectedStay(data.stay);
        setSelectedGuest(data.guest);
        setSelectedCabin(data.cabin ?? null);
        setContactOpen(true);
      } else {
        toast.error("Hóspede não encontrado para esta reserva.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao preparar contato com o hóspede.");
    }
  };

  const handleCopyLink = (code: string) => {
    const link = `${window.location.origin}/check-in/login?code=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("Link de check-in copiado!", { description: "Envie para o hóspede acessar diretamente." });
  };

  const handleCheckIn = async (s: StayRow) => {
    if (!property?.id || !userData?.id) return;
    const guestName = shortName(s.guestName);
    if (isDocPending(s)) {
      await alert({ title: "Hóspede sem documento", description: "Solicite o documento antes de confirmar o check-in.", tone: "amber", icon: ShieldAlert });
    }
    const ok = await confirm({
      title: `Confirmar entrada de ${guestName}?`,
      description: `${s.cabinName || "Sem cabana definida"} · a cabana passa a ocupada e a mensagem de boas-vindas entra na fila.`,
      confirmLabel: "Fazer check-in",
      icon: LogIn,
    });
    if (!ok) return;
    setCheckingInId(s.id);
    try {
      const result = await StayService.performCheckIn(property.id, s.id, userData.id, userData.fullName);
      chatwootSyncOnCheckIn(s.id).catch(() => {});
      void reload();
      if (result?.messagedQueued) {
        toast.success("Check-in realizado!", { description: "Mensagem de boas-vindas enfileirada." });
      } else {
        const desc = result?.messageQueueReason ? REASON_MAP[result.messageQueueReason] : undefined;
        toast.warning("Check-in realizado, mas a mensagem não foi enfileirada.", { description: desc });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("CABIN_NOT_AVAILABLE")) {
        const cabinStatus = msg.split(":")[1] ?? "";
        toast.error(`Check-in bloqueado: acomodação ${CABIN_STATUS_MAP[cabinStatus] ?? "indisponível"}.`, { description: "Verifique a cabana antes de prosseguir." });
      } else if (msg.startsWith("CHECKIN_")) {
        toast.error("Check-in não foi gravado. Nada foi alterado — tente novamente.");
      } else {
        toast.error("Erro ao realizar check-in.");
      }
    } finally {
      setCheckingInId(null);
    }
  };

  // Check-out direto da lista: o passo da chave é o mesmo da ficha, e fechar o
  // diálogo (X, Esc ou clique fora) não faz nada.
  const handleConfirmCheckOut = async (keyLocation: KeyLocation) => {
    const s = checkoutTarget;
    if (!s || !property?.id || !userData?.id) return;
    setCheckingOut(true);
    try {
      await StayService.performCheckOut(property.id, s.id, userData.id, userData.fullName, keyLocation);
      toast.success("Check-out realizado!", { description: keyLocation === "reception" ? undefined : "A governança confirma a chave na conferência da cabana." });
      setCheckoutTarget(null);
      void reload();
    } catch {
      toast.error("Erro ao realizar check-out.");
    } finally {
      setCheckingOut(false);
    }
  };

  const handleCancel = async (s: StayRow) => {
    if (!property?.id || !userData?.id) return;
    const ok = await confirm({
      title: "Cancelar esta reserva?",
      description: `${shortName(s.guestName)} · ${s.cabinName || "sem cabana"}. Esta ação é irreversível e a cabana é liberada na hora.`,
      confirmLabel: "Cancelar reserva",
      cancelLabel: "Voltar",
      tone: "danger",
      icon: Ban,
    });
    if (!ok) return;
    try {
      await StayService.cancelStay(property.id, s.id, userData.id, userData.fullName);
      chatwootSyncOnCancelled(s.id).catch(() => {});
      toast.success("Reserva cancelada.");
      void reload();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao cancelar reserva.");
    }
  };

  const handleArchive = async (s: StayRow) => {
    if (!property?.id || !userData?.id) return;
    const ok = await confirm({
      title: "Arquivar esta estadia?",
      description: "Ela sai desta lista e fica guardada no histórico do Aura.",
      confirmLabel: "Arquivar",
      tone: "danger",
      icon: Archive,
    });
    if (!ok) return;
    try {
      await StayService.archiveStay(property.id, s.id, userData.id, userData.fullName);
      toast.success("Estadia arquivada.");
      setStays(prev => prev.filter(x => x.id !== s.id));
    } catch {
      toast.error("Erro ao arquivar.");
    }
  };

  // ---------- encerradas (DataList) ----------
  const closedColumns: Column<StayRow>[] = useMemo(() => [
    { id: "cabin", header: "Cabana", width: 200, mobile: "meta", cell: s => <Pill tone={s.cabinId ? "brand" : "amber"} size="md" label={s.cabinName || "Sem cabana"} /> },
    {
      id: "guest", header: "Hóspede", priority: 1, mobile: "title",
      cell: s => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800, color: T.text }}>
          {titleCase(s.guestName) || "Hóspede desconhecido"}
          {s.status === "cancelled" && <Pill tone="red" label="Cancelada" />}
        </span>
      ),
    },
    { id: "period", header: "Período", nowrap: true, mobile: "subtitle", cell: s => <span style={{ color: T.muted, fontSize: 12, fontWeight: 600 }}>{fmtDay(s.checkIn, "dd/MM")} → {fmtDay(s.checkOut, "dd/MM")}</span> },
    { id: "alerts", header: "Avisos", align: "center", priority: 3, mobile: "trailing", cell: s => (s.hasOpenFolio ? <Pill tone="orange" icon={DollarSign} label="Conta aberta" /> : null) },
    {
      id: "nps", header: "Avaliação", align: "center", priority: 2, mobile: "trailing",
      cell: s => {
        const n = npsInfo(s);
        return n
          ? <Pill tone={n.tone} icon={Star} label={n.label} />
          : <span style={{ fontSize: 10, color: T.muted2, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800 }}>Sem avaliação</span>;
      },
    },
  ], []);

  const closedActions = (s: StayRow): RowAction<StayRow>[] => [
    { id: "wa", label: "WhatsApp", icon: MessageCircle, onClick: handleOpenWhatsapp },
    { id: "open", label: "Abrir ficha", icon: ArrowUpRight, onClick: handleOpenFicha },
    { id: "archive", label: "Arquivar", icon: Archive, onClick: handleArchive, danger: true },
  ];

  // ---------- vazios ----------
  const emptyState = search.trim() ? (
    <EmptyState
      icon={SearchX}
      title={`Nada encontrado para “${search.trim()}”`}
      description="Tente outro nome, cabana ou data (dd/mm/aaaa)."
      action={{ label: "Limpar busca", onClick: () => setSearch("") }}
    />
  ) : isFiltering(filters) ? (
    <EmptyState
      icon={SearchX}
      title="Nenhuma estadia com esses filtros"
      description="Os filtros ativos aparecem em chips abaixo da busca."
      action={{ label: "Limpar filtros", onClick: () => setFilters(EMPTY_FILTERS) }}
    />
  ) : tab === "ativas" ? (
    <EmptyState icon={Home} title="Nenhuma estadia ativa" description="Quando um hóspede fizer check-in, ele aparece aqui." action={{ label: "Nova hospedagem", href: "/admin/stays/new", icon: Plus }} />
  ) : tab === "futuras" ? (
    <EmptyState icon={CalendarClock} title="Nenhuma chegada prevista" description="Reservas futuras aparecem aqui assim que forem criadas." action={{ label: "Nova hospedagem", href: "/admin/stays/new", icon: Plus }} />
  ) : (
    <EmptyState icon={Archive} title="Nenhuma estadia encerrada" description="O histórico de check-outs e cancelamentos aparece aqui." />
  );

  // ---------- render das estadias (cartão / compacto / lista) ----------
  const renderStays = (rows: StayRow[], mode: "ativas" | "futuras") => {
    if (view === "list") {
      return (
        <StayListView
          rows={rows}
          mode={mode}
          onOpen={handleOpenFicha}
          onWhatsapp={handleOpenWhatsapp}
          onCheckIn={mode === "futuras" ? handleCheckIn : undefined}
          onCheckOut={mode === "ativas" ? setCheckoutTarget : undefined}
          onAccount={mode === "ativas" ? setAccountTarget : undefined}
          onCancel={mode === "futuras" ? handleCancel : undefined}
          onCopyLink={handleCopyLink}
        />
      );
    }
    const min = view === "compact" ? 240 : 300;
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap: 12 }}>
        {rows.map(s => (
          <StayCard
            key={s.id}
            stay={s}
            mode={mode}
            variant={view === "compact" ? "compact" : "full"}
            onOpen={handleOpenFicha}
            onWhatsapp={handleOpenWhatsapp}
            onCheckIn={mode === "futuras" ? handleCheckIn : undefined}
            onCheckOut={mode === "ativas" ? setCheckoutTarget : undefined}
            onAccount={mode === "ativas" ? setAccountTarget : undefined}
            onCancel={mode === "futuras" ? handleCancel : undefined}
            onCopyLink={handleCopyLink}
            opening={openingId === s.id}
            checkingIn={checkingInId === s.id}
          />
        ))}
      </div>
    );
  };

  return (
    <PageShell>
      <PageHeader
        title="Estadias"
        icon={Home}
        subtitle={property?.name}
        primaryAction={{ label: "Nova hospedagem", icon: Plus, href: "/admin/stays/new" }}
      />

      <SegmentedTabs
        ariaLabel="Filtrar estadias"
        items={TAB_ITEMS.map(t => (t.id === "ativas" && openAccountCount > 0 ? { ...t, count: openAccountCount } : t))}
        value={tab}
        onChange={setTab}
        style={{ maxWidth: "100%" }}
      />

      <StaysToolbar
        tab={tab}
        search={search}
        onSearch={setSearch}
        sort={sort}
        onSort={setSort}
        filters={filters}
        onFilters={setFilters}
        rows={stays}
        view={VIEW_TABS.includes(tab) ? view : undefined}
        onView={VIEW_TABS.includes(tab) ? (v => setView(tab as PrefTab, v)) : undefined}
      />

      <Loadable
        loading={loading && stays.length === 0}
        skeleton={tab === "encerradas" || view === "list" ? <SkeletonList rows={6} avatar={false} /> : <SkeletonCards n={6} minWidth={300} />}
        error={error}
        onRetry={() => void reload()}
        isEmpty={filtered.length === 0}
        empty={emptyState}
      >
        {tab === "encerradas" ? (
          <DataList<StayRow>
            rows={filtered}
            columns={closedColumns}
            rowKey={s => s.id}
            onRowClick={handleOpenFicha}
            rowActions={closedActions}
            actionsLabel="Ações da estadia"
          />
        ) : tab === "futuras" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {futureGroups.map(g => (
              g.label ? (
                <GroupSection key={g.id} label={g.label} count={g.rows.length} tone={g.tone}>
                  {renderStays(g.rows, "futuras")}
                </GroupSection>
              ) : (
                <React.Fragment key={g.id}>{renderStays(g.rows, "futuras")}</React.Fragment>
              )
            ))}
          </div>
        ) : activeGroups.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {activeGroups.map(g => (
              <GroupSection key={g.id} label={g.label} count={g.rows.length} tone={g.tone}>
                {renderStays(g.rows, "ativas")}
              </GroupSection>
            ))}
          </div>
        ) : (
          renderStays(filtered, "ativas")
        )}
      </Loadable>

      {accountTarget && property?.id && (
        <StayAccountModal
          open
          onClose={() => setAccountTarget(null)}
          stay={accountTarget}
          propertyId={property.id}
          actor={{ id: userData?.id, name: userData?.fullName }}
          onChanged={() => void reload()}
        />
      )}

      <CheckoutKeyDialog
        open={!!checkoutTarget}
        onClose={() => setCheckoutTarget(null)}
        onConfirm={handleConfirmCheckOut}
        context={checkoutTarget ? `${checkoutTarget.cabinName || "Sem cabana"} · ${shortName(checkoutTarget.guestName)}` : undefined}
        saving={checkingOut}
      />

      {/* selectedGuest pode ser null (uso da casa) — a ficha tolera e mostra o rótulo interno */}
      {selectedStay && (
        <StayDetailsModal
          isOpen={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          stay={selectedStay}
          guest={selectedGuest}
          onViewGuest={(id: string) => router.push(`/admin/guests/${id}`)}
          onUpdate={() => void reload()}
        />
      )}

      {selectedStay && selectedGuest && property?.id && (
        <GuestContactModal
          key={selectedGuest.id}
          open={contactOpen}
          propertyId={property.id}
          stay={selectedStay}
          guest={selectedGuest}
          cabin={selectedCabin}
          onClose={() => setContactOpen(false)}
        />
      )}
    </PageShell>
  );
}
