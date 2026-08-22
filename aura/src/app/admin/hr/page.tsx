"use client";

import React from "react";
import { Cake, Clock, Download, Palmtree, Plus, Users } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { PageShell, PageHeader, KpiGrid, KpiCard, Loadable, PageSkeleton, Pill, Button } from "@/components/aura";
import { useHrDashboard } from "./_components/useHrDashboard";
import { TeamTodayCard } from "./_components/TeamTodayCard";
import { BirthdaysCard, DaysOffCard } from "./_components/SideCards";
import { DeptDistributionCard } from "./_components/DeptDistributionCard";
import { WeekBarsCard } from "./_components/WeekBarsCard";
import { QuickActions } from "./_components/QuickActions";

export default function HRDashboardPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager"]}>
      <HRDashboardInner />
    </RoleGuard>
  );
}

function HRDashboardInner() {
  const { userData } = useAuth();
  const { currentProperty } = useProperty();
  const propertyId = currentProperty?.id ?? userData?.propertyId;
  const { loading, error, reload, data } = useHrDashboard(propertyId);

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        titleAccent="Gestão"
        icon={Users}
        badge={<Pill tone="blue" label={`RH · ${currentProperty?.name ?? "Pousada"}`} />}
        subtitle={<span style={{ textTransform: "capitalize" }}>{data.todayLabel} · {data.weekLabel}</span>}
        actions={<Button variant="secondary" icon={Download} href="/admin/staff">Relatório</Button>}
        primaryAction={{ label: "Novo funcionário", icon: Plus, href: "/admin/staff" }}
      />

      <Loadable loading={loading} skeleton={<PageSkeleton kpis={4} rows={4} />} error={error} onRetry={reload}>
        <KpiGrid cols={4}>
          <KpiCard label="Equipe ativa" value={data.activeCount} sub="funcionários cadastrados" icon={Users} tone="brand" href="/admin/staff" />
          <KpiCard label="Hoje em turno" value={data.todayWorkingCount} sub={`de ${data.activeCount} escalados`} icon={Clock} tone="green" href="/admin/escalas" />
          <KpiCard label="Aniversários" value={data.birthdayList.length} sub="este mês" icon={Cake} tone="rose" />
          <KpiCard label="Folgas hoje" value={data.folgaCount} sub="registradas na semana" icon={Palmtree} tone="amber" href="/admin/escalas" />
        </KpiGrid>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
          <TeamTodayCard shifts={data.todayShifts} workingCount={data.todayWorkingCount} today={data.today} />
          <div className="flex flex-col gap-4 min-w-0">
            <BirthdaysCard items={data.birthdayList} />
            <DaysOffCard items={data.folgaList} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DeptDistributionCard items={data.deptDist} total={data.totalStaff} activeCount={data.activeCount} />
          <WeekBarsCard bars={data.weekBarData} maxShifts={data.maxShifts} totalShifts={data.totalWeekShifts} rangeLabel={data.weekRangeLabel} weekLabel={data.weekLabel} />
        </div>

        <QuickActions />
      </Loadable>
    </PageShell>
  );
}
