"use client";

import React from "react";
import { Building2, Clock, Home, LogIn, LogOut, Users } from "lucide-react";
import { useProperty } from "@/context/PropertyContext";
import { MaintenanceReportButton } from "@/components/field/MaintenanceReportSheet";
import { T } from "@/lib/admin-tokens";
import { PageShell, PageHeader, KpiGrid, KpiCard, Loadable, PageSkeleton, EmptyState, Pill } from "@/components/aura";
import { useReceptionLive } from "./_components/useReceptionLive";
import { AlertsCard, BreakfastCard, GovernanceCard, GuestRequestsCard, StructuresAgendaCard } from "./_components/ReceptionCards";

export default function ReceptionDashboard() {
  const { loading: propLoading } = useProperty();
  const r = useReceptionLive();
  const { stats, property } = r;

  if (!propLoading && !property) {
    return (
      <PageShell>
        <EmptyState icon={Building2} title="Selecione uma propriedade" description="A recepção mostra a operação da propriedade ativa." />
      </PageShell>
    );
  }

  const occupancyPct = stats.totalCabins > 0 ? Math.round((stats.occupiedCabins / stats.totalCabins) * 100) : null;
  const timeLabel = r.currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateLabel = r.currentTime.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" });

  return (
    <PageShell>
      <PageHeader
        title="Recepção"
        icon={Home}
        badge={<Pill tone="green" dot label="Ao vivo" />}
        subtitle={<span style={{ textTransform: "capitalize" }}>{dateLabel} · {timeLabel}</span>}
        actions={(
          <>
            <MaintenanceReportButton variant="admin" />
            <span className="ak-hide-mobile" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 10, background: T.glass, border: `1px solid ${T.border}`, color: T.text, fontWeight: 800, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
              <Clock size={15} color={T.brandText} /> {timeLabel}
            </span>
          </>
        )}
      />

      <Loadable loading={propLoading || r.loading} skeleton={<PageSkeleton kpis={4} rows={4} />} error={r.error} onRetry={r.reload}>
        <KpiGrid cols={4}>
          <KpiCard label="Ocupação" value={`${stats.occupiedCabins}/${stats.totalCabins}`} sub={occupancyPct !== null ? `${occupancyPct}% das cabanas` : "—"} icon={Users} tone="emerald" title="Apenas cabanas consideradas na ocupação" href="/admin/reservation-map" />
          <KpiCard label="Check-ins hoje" value={`${stats.checkinsDone}/${stats.checkinsTotal}`} sub={stats.checkinsTotal > 0 && stats.checkinsDone === stats.checkinsTotal ? "todos concluídos" : "feitos / previstos"} icon={LogIn} tone="blue" href="/admin/stays?tab=futuras" />
          <KpiCard label="Check-outs hoje" value={`${stats.checkoutsDone}/${stats.checkoutsTotal}`} sub={stats.checkoutsTotal > 0 && stats.checkoutsDone === stats.checkoutsTotal ? "todos concluídos" : "feitos / previstos"} icon={LogOut} tone="orange" href="/admin/stays?tab=ativas" />
          <KpiCard label="Disponíveis walk-in" value={stats.walkIns} sub="cabanas livres agora" icon={Home} tone="brand" href="/admin/stays/new" />
        </KpiGrid>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-4 min-w-0">
            <GovernanceCard tasks={r.activeTasks} recentlyReleased={r.recentlyReleasedCabins} />
            <StructuresAgendaCard items={r.structureAgenda} />
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            <AlertsCard items={r.alertItems} />
            <GuestRequestsCard requests={r.pendingRequests} />
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            <BreakfastCard
              orders={r.breakfastOrders}
              mode={r.breakfastMode}
              onMode={m => { void r.setBreakfastMode(m); }}
              saving={r.savingMode}
              showModeSwitch={property?.settings?.fbSettings?.breakfast?.modality === "both"}
            />
          </div>
        </div>
      </Loadable>
    </PageShell>
  );
}
