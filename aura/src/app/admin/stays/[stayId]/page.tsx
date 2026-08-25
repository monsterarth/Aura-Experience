// src/app/admin/stays/[stayId]/page.tsx
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Edit2, FileText, LogOut, Printer, RotateCcw, Save, SearchX } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import type { UserRole } from "@/types/aura";
import { T } from "@/lib/admin-tokens";
import { PageShell, PageHeader, Loadable, PageSkeleton, EmptyState, Button, Pill, BottomActionBar } from "@/components/aura";
import { useStayDetail } from "./_components/useStayDetail";
import { stayStatus } from "./_components/stay-detail-utils";
import { HeroStrip, FolioCard, GuestCard, LodgingCard, TravelCard } from "./_components/StayDetailCards";
import { TransferDialog, CheckoutKeyDialog } from "./_components/StayDialogs";
import { StayOriginPills, StayPendingCard } from "@/components/admin/StayOpsBlocks";

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
  const s = useStayDetail(stayId);
  const { stay, guest, loading, notFound, isEditing, isSaving, isGovOnly } = s;

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
            <StayPendingCard propertyId={stay.propertyId} stay={stay} active />
            <FolioCard s={s} />
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
