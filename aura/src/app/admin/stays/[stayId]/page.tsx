// src/app/admin/stays/[stayId]/page.tsx
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Edit2, FileText, LogOut, Printer, Receipt, RotateCcw, Save, SearchX } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import type { UserRole } from "@/types/aura";
import { T } from "@/lib/admin-tokens";
import { useAuth } from "@/context/AuthContext";
import { PageShell, PageHeader, Loadable, PageSkeleton, EmptyState, Button, Pill, Card, BottomActionBar, useConfirm } from "@/components/aura";
import { useStayDetail } from "./_components/useStayDetail";
import { stayStatus } from "./_components/stay-detail-utils";
import { HeroStrip, GuestCard, LodgingCard, TravelCard } from "./_components/StayDetailCards";
import { TransferDialog, CheckoutKeyDialog } from "./_components/StayDialogs";
import { StayOriginPills, StayRequestsCard } from "@/components/admin/StayOpsBlocks";
import { useStayAccount } from "@/components/admin/folio/useStayAccount";
import { StayAccountPanel } from "@/components/admin/folio/StayAccountPanel";

const ROLES: UserRole[] = ["super_admin", "admin", "reception", "governance", "manager"];

export default function StayDetailPage() {
  return (
    <RoleGuard allowedRoles={ROLES}>
      <StayDetailInner />
    </RoleGuard>
  );
}

function StayDetailInner() {
  const { stayId } = useParams<{ stayId: string }>();
  const { userData } = useAuth();
  const confirm = useConfirm();
  const s = useStayDetail(stayId);
  const { stay, guest, loading, notFound, isEditing, isSaving, isGovOnly } = s;

  // A conta é o MESMO componente da ficha rápida e do modal da Conta.
  const account = useStayAccount(s.propertyId, stay, { id: userData?.id, name: userData?.fullName }, !!stay);

  const handleCloseBill = async () => {
    const summary = account.pending.map(c => `${c.label.toLowerCase()} (${c.detail})`).join(" · ");
    const ok = await confirm({
      title: "Encerrar a conta desta estadia?",
      description: account.pending.length
        ? `Fica para trás: ${summary}. Os lançamentos pendentes serão marcados como pagos e a estadia vai para Encerradas.`
        : "Ciclo completo. Os lançamentos pendentes serão marcados como pagos e a estadia vai para Encerradas.",
      confirmLabel: "Encerrar conta",
      tone: account.pending.length ? "danger" : undefined,
      icon: Receipt,
    });
    if (ok) await account.closeBill(summary || undefined);
  };

  if (!loading && (notFound || !stay)) {
    return (
      <PageShell>
        <EmptyState icon={SearchX} title="Estadia não encontrada" description="O link pode estar vencido ou a estadia foi arquivada." action={{ label: "Voltar para Estadias", href: "/admin/stays" }} />
      </PageShell>
    );
  }

  const st = stay ? stayStatus(stay.status) : null;
  const viewActions = stay ? (
    <>
      {stay.status === "active" && <Button variant="soft" tone="orange" icon={LogOut} onClick={s.handleToggleCheckOut} disabled={isSaving}>Check-out</Button>}
      {stay.status === "finished" && <Button variant="soft" tone="blue" icon={RotateCcw} onClick={s.handleToggleCheckOut} loading={isSaving}>Reativar</Button>}
      {!isGovOnly && <Button variant="secondary" icon={Edit2} onClick={() => s.setIsEditing(true)}>Editar</Button>}
      <span className="ak-hide-mobile"><Button variant="secondary" icon={Printer} onClick={() => window.print()}>Imprimir</Button></span>
    </>
  ) : null;
  const editActions = (
    <>
      <Button variant="ghost" onClick={s.handleCancel} disabled={isSaving}>Cancelar</Button>
      <Button variant="primary" icon={Save} onClick={() => void s.handleSave()} loading={isSaving} loadingText="Salvando…">Salvar</Button>
    </>
  );

  return (
    <PageShell>
      <style>{`@media print { .no-print, .ak-tabbar, .ak-fab { display: none !important; } }`}</style>
      <div className="no-print">
        <PageHeader
          back={{ href: "/admin/stays", label: "Estadias" }}
          icon={FileText}
          title={guest?.fullName || stay?.guestName || "Ficha da estadia"}
          badge={st && stay ? <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}><Pill tone={st.tone} label={st.label} /><StayOriginPills stay={stay} /></span> : undefined}
          subtitle={stay ? (
            <span style={{ color: T.muted }}>
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>Reserva {stay.accessCode}</span>
              {stay.externalId && <> · HUNIT <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{stay.externalId}</span></>}
              {stay.createdAt && <> · criada em {new Date(stay.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</>}
            </span>
          ) : undefined}
          actions={isEditing ? <span className="ak-hide-mobile" style={{ display: "inline-flex", gap: 8 }}>{editActions}</span> : viewActions}
        />
      </div>

      <Loadable loading={loading} skeleton={<PageSkeleton kpis={4} rows={6} />}>
        {stay && (
          <>
            <HeroStrip s={s} />
            <StayRequestsCard stay={stay} requests={account.requests} />
            <Card
              header={{
                icon: Receipt,
                tone: account.folio.balance > 0.005 ? "orange" : "brand",
                title: "Conta",
                sub: account.closed ? "encerrada" : `${account.folio.items.length} lançamento${account.folio.items.length === 1 ? "" : "s"}`,
                aside: !isGovOnly ? (
                  account.closed ? (
                    <Button size="sm" variant="secondary" icon={RotateCcw} loading={account.busy} onClick={() => void account.reopenBill()}>Reabrir conta</Button>
                  ) : (
                    <Button size="sm" variant="soft" icon={CheckCircle2} loading={account.busy} onClick={() => void handleCloseBill()}>Encerrar conta</Button>
                  )
                ) : undefined,
              }}
            >
              <StayAccountPanel a={account} readOnly={isGovOnly} />
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <GuestCard s={s} />
              <LodgingCard s={s} />
              <TravelCard s={s} />
            </div>
            {isEditing && <div className="ak-only-mobile no-print"><BottomActionBar>{editActions}</BottomActionBar></div>}
            <TransferDialog s={s} />
            <CheckoutKeyDialog s={s} />
          </>
        )}
      </Loadable>
    </PageShell>
  );
}
