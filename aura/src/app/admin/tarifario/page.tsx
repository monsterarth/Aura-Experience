// src/app/admin/tarifario/page.tsx
// Tarifário — a página de PREÇOS da pousada (fase 4): Calendário (preço "a
// partir de" mês a mês), Tabelas, Flutuações por período (alimentam a cotação
// Automática) e Arquivo (histórico de preços). Orçamento e funil moram em
// /admin/comercial/reservas; config comercial em Configurações → Comercial;
// descontos/promos em Comercial → Marketing. Recepção consulta e edita
// FLUTUAÇÕES (auditado); tabelas/regras são de gestão.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, CircleDollarSign, History, Percent, Table2, type LucideIcon } from "lucide-react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useTabParam } from "@/lib/settings-deeplink";
import { T } from "@/lib/admin-tokens";
import type { RateBundle } from "@/services/rate-service";
import { PageShell, PageHeader, SegmentedTabs, Loadable, PageSkeleton, ErrorState } from "@/components/aura";
import { CalendarioTab } from "./_components/CalendarioTab";
import { TabelasTab } from "./_components/TabelasTab";
import { FlutuacoesTab } from "./_components/FlutuacoesTab";
import { ArquivoTab } from "./_components/ArquivoTab";

type TabId = "calendario" | "tabelas" | "flutuacoes" | "arquivo";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "calendario", label: "Calendário", icon: CalendarRange },
  { id: "tabelas", label: "Tabelas", icon: Table2 },
  { id: "flutuacoes", label: "Flutuações", icon: Percent },
  { id: "arquivo", label: "Arquivo", icon: History },
];

function TarifarioPage() {
  const { currentProperty: property } = useProperty();
  const { userData, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bundle, setBundle] = useState<RateBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<TabId>(useTabParam(TABS.map((t) => t.id), "calendario"));

  // Tabelas e regras de calendário são de gestão; recepção consulta (e edita
  // flutuações — a rota audita).
  const canManage = isSuperAdmin || isAdmin || userData?.role === "manager";

  // Links legados: a calculadora/funil viraram pipeline, a config virou hub.
  useEffect(() => {
    const quoteId = searchParams.get("quoteId");
    const waitlistId = searchParams.get("waitlistId");
    const legacyTab = searchParams.get("tab");
    if (quoteId) { router.replace(`/admin/comercial/reservas?quoteId=${quoteId}`); return; }
    if (waitlistId) { router.replace(`/admin/comercial/reservas?tab=espera`); return; }
    if (legacyTab === "comercial") { router.replace(`/admin/configuracoes/comercial`); return; }
    if (legacyTab === "orcamento" || legacyTab === "funil") {
      router.replace(`/admin/comercial/reservas`);
    }
  }, [searchParams, router]);

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const res = await fetch(`/api/admin/tarifario?propertyId=${property.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBundle(await res.json());
      setLoadError(false);
    } catch (e) {
      console.error("Erro ao carregar tarifário:", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [property?.id]);

  useEffect(() => { load(); }, [load]);

  // Troca de propriedade: zera o bundle para não parear dados velhos.
  useEffect(() => {
    setBundle(null);
    setLoading(true);
    setLoadError(false);
  }, [property?.id]);

  if (!property) return null;

  return (
    <PageShell maxWidth="xl">
      <PageHeader
        icon={CircleDollarSign}
        title="Tarifário"
        subtitle="Preços por período, flutuações e o histórico da fazenda. Orçamentos vivem no Pipeline Estadias."
        tabs={<SegmentedTabs<TabId> items={TABS} value={tab} onChange={setTab} ariaLabel="Seções do tarifário" iconOnlyOnMobile={false} />}
      />

      <Loadable loading={loading} skeleton={<PageSkeleton kpis={0} rows={6} />}>
        {loadError || !bundle ? (
          <ErrorState
            title="Não foi possível carregar o tarifário"
            description={<>Primeiro uso? Confirme a migration <code style={{ color: T.text }}>tarifario_phase1.sql</code> no Supabase.</>}
            onRetry={() => { setLoading(true); load(); }}
          />
        ) : (
          // Abas montadas (display) para não descartar edições ao alternar.
          <>
            <div style={{ display: tab === "calendario" ? "block" : "none" }}>
              <CalendarioTab propertyId={property.id} bundle={bundle} canManage={canManage} onRefresh={load} />
            </div>
            <div style={{ display: tab === "tabelas" ? "block" : "none" }}>
              <TabelasTab propertyId={property.id} bundle={bundle} canManage={canManage} onRefresh={load} />
            </div>
            <div style={{ display: tab === "flutuacoes" ? "block" : "none" }}>
              <FlutuacoesTab propertyId={property.id} bundle={bundle} onRefresh={load} />
            </div>
            <div style={{ display: tab === "arquivo" ? "block" : "none" }}>
              <ArquivoTab propertyId={property.id} bundle={bundle} canManage={canManage} onRefresh={load} />
            </div>
          </>
        )}
      </Loadable>
    </PageShell>
  );
}

export default function TarifarioPageGuarded() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager", "reception"]}>
      <TarifarioPage />
    </RoleGuard>
  );
}
