//src/app/admin/stays/page.tsx

"use client";

import React, { useMemo, useState } from "react";
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
  PageShell, PageHeader, SegmentedTabs, SearchInput, Loadable, SkeletonCards, SkeletonList,
  EmptyState, DataList, Pill, useConfirm, useAlert, useTabParam,
  type Column, type RowAction,
} from "@/components/aura";
import { GuestContactModal } from "@/components/admin/GuestContactModal";
import { StayCard } from "./_components/StayCard";
import { PendingAccountCard } from "./_components/PendingAccountCard";
import { useStaysLive } from "./_components/useStaysLive";
import {
  TABS, filterAndSort, fmtDay, hasPendingAccount, isUnknownGuest, npsInfo, shortName, titleCase,
  type StayRow, type TabStatus,
} from "./_components/stay-utils";

// Ficha completa (67K) só baixa quando alguém abre uma estadia.
const StayDetailsModal = dynamic(
  () => import("@/components/admin/StayDetailsModal").then(m => m.StayDetailsModal),
  { ssr: false },
);

const TAB_ITEMS = [
  { id: "ativas" as const, label: "Ativas", icon: Home },
  { id: "futuras" as const, label: "Futuras", icon: CalendarClock },
  { id: "pendente" as const, label: "Conta", icon: Receipt, tone: "orange" as const },
  { id: "encerradas" as const, label: "Encerradas", icon: Archive },
];

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
  const { stays, setStays, loading, error, reload } = useStaysLive(property?.id, tab);

  // Seleção para os modais
  const [selectedStay, setSelectedStay] = useState<StayRow | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<StayRow | null>(null);
  const [selectedCabin, setSelectedCabin] = useState<StayRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  // Estados de progresso por cartão (o botão certo gira, não a página inteira)
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const filtered = useMemo(() => filterAndSort(stays, tab, search), [stays, tab, search]);
  const pendingCount = useMemo(() => stays.filter(hasPendingAccount).length, [stays]);

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
    if (isUnknownGuest(s)) {
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

  const handleCloseBill = async (s: StayRow) => {
    if (!property?.id || !userData?.id) return;
    const ok = await confirm({
      title: `Encerrar a conta de ${shortName(s.guestName)}?`,
      description: "Todos os lançamentos pendentes serão marcados como pagos.",
      confirmLabel: "Encerrar conta",
      icon: Receipt,
    });
    if (!ok) return;
    setClosingId(s.id);
    try {
      await StayService.closeStayBill(property.id, s.id, userData.id, userData.fullName);
      toast.success("Conta encerrada.");
      setTab("encerradas");
    } catch {
      toast.error("Erro ao encerrar conta.");
    } finally {
      setClosingId(null);
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
  ) : tab === "ativas" ? (
    <EmptyState icon={Home} title="Nenhuma estadia ativa" description="Quando um hóspede fizer check-in, ele aparece aqui." action={{ label: "Nova hospedagem", href: "/admin/stays/new", icon: Plus }} />
  ) : tab === "futuras" ? (
    <EmptyState icon={CalendarClock} title="Nenhuma chegada prevista" description="Reservas futuras aparecem aqui assim que forem criadas." action={{ label: "Nova hospedagem", href: "/admin/stays/new", icon: Plus }} />
  ) : tab === "pendente" ? (
    <EmptyState icon={Receipt} tone="green" title="Nenhuma conta pendente" description="Estadias encerradas com fólio em aberto ou objetos esquecidos aparecem aqui." />
  ) : (
    <EmptyState icon={Archive} title="Nenhuma estadia encerrada" description="O histórico de check-outs e cancelamentos aparece aqui." />
  );

  return (
    <PageShell>
      <PageHeader
        title="Estadias"
        icon={Home}
        subtitle={property?.name}
        primaryAction={{ label: "Nova hospedagem", icon: Plus, href: "/admin/stays/new" }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <SegmentedTabs
          ariaLabel="Filtrar estadias"
          items={TAB_ITEMS.map(t => (t.id === "pendente" && tab === "pendente" && pendingCount > 0 ? { ...t, count: pendingCount } : t))}
          value={tab}
          onChange={setTab}
          style={{ maxWidth: "100%" }}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Hóspede, cabana ou data…"
          debounce={150}
          wrapStyle={{ flex: "1 1 240px", maxWidth: 380 }}
        />
      </div>

      <Loadable
        loading={loading && stays.length === 0}
        skeleton={tab === "encerradas" ? <SkeletonList rows={6} avatar={false} /> : <SkeletonCards n={6} minWidth={300} />}
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
        ) : tab === "pendente" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(s => (
              <PendingAccountCard key={s.id} stay={s} onOpen={handleOpenFicha} onCloseBill={handleCloseBill} opening={openingId === s.id} closing={closingId === s.id} />
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
            {filtered.map(s => (
              <StayCard
                key={s.id}
                stay={s}
                mode={tab}
                onOpen={handleOpenFicha}
                onWhatsapp={handleOpenWhatsapp}
                onCheckIn={tab === "futuras" ? handleCheckIn : undefined}
                onCancel={tab === "futuras" ? handleCancel : undefined}
                onCopyLink={handleCopyLink}
                opening={openingId === s.id}
                checkingIn={checkingInId === s.id}
              />
            ))}
          </div>
        )}
      </Loadable>

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
