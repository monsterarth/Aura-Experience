// src/app/admin/tarifario/page.tsx
// Tarifário — a página de PREÇOS da pousada, reconstruída na identidade do
// admin (fase 4): Calendário (preço "a partir de" mês a mês), Tabelas,
// Flutuações por período (alimentam a cotação Automática) e Arquivo
// (histórico de preços). Orçamento e funil moram em /admin/comercial/reservas;
// config comercial em Configurações → Comercial; descontos/promos em
// Comercial → Marketing. Recepção consulta e edita FLUTUAÇÕES (auditado);
// tabelas/regras são de gestão.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, CircleDollarSign, History, Loader2, Percent, Table2 } from "lucide-react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useTabParam } from "@/lib/settings-deeplink";
import { T } from "@/lib/admin-tokens";
import type { RateBundle } from "@/services/rate-service";
import { CalendarioTab } from "./_components/CalendarioTab";
import { TabelasTab } from "./_components/TabelasTab";
import { FlutuacoesTab } from "./_components/FlutuacoesTab";
import { ArquivoTab } from "./_components/ArquivoTab";

type TabId = "calendario" | "tabelas" | "flutuacoes" | "arquivo";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
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
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14, background: T.gradSoft,
          border: `1px solid ${T.g1Border}`, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CircleDollarSign size={20} color={T.g1} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-.02em", color: T.text }}>
            Tarifário
          </h1>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: T.muted }}>
            Preços por período, flutuações e o histórico da fazenda.
            Orçamentos vivem no Pipeline Estadias.
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, background: T.glass, borderRadius: 12, padding: 4 }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const on = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 13px",
                  borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 12, fontWeight: 800,
                  background: on ? T.bg : "transparent",
                  color: on ? "#fff" : T.muted,
                }}>
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "90px 0", color: T.muted, fontSize: 13 }}>
          <Loader2 size={17} className="animate-spin" /> Carregando tarifário…
        </div>
      ) : loadError || !bundle ? (
        <div style={{
          border: `1px dashed ${T.border2}`, borderRadius: 16, padding: "56px 24px",
          textAlign: "center", color: T.muted, fontSize: 13,
        }}>
          <p style={{ margin: "0 0 6px" }}>Não foi possível carregar o tarifário.</p>
          <p style={{ margin: "0 0 14px", fontSize: 11.5 }}>
            Primeiro uso? Confirme a migration <code style={{ color: T.text }}>tarifario_phase1.sql</code> no Supabase.
          </p>
          <button onClick={() => { setLoading(true); load(); }}
            style={{
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 12.5, fontWeight: 700, color: T.g1, textDecoration: "underline", textUnderlineOffset: 3,
            }}>
            Tentar novamente
          </button>
        </div>
      ) : (
        // Abas montadas (display) para não descartar edições ao alternar.
        <>
          <div style={{ display: tab === "calendario" ? "block" : "none" }}>
            <CalendarioTab propertyId={property.id} bundle={bundle}
              canManage={canManage} onRefresh={load} />
          </div>
          <div style={{ display: tab === "tabelas" ? "block" : "none" }}>
            <TabelasTab propertyId={property.id} bundle={bundle}
              canManage={canManage} onRefresh={load} />
          </div>
          <div style={{ display: tab === "flutuacoes" ? "block" : "none" }}>
            <FlutuacoesTab propertyId={property.id} bundle={bundle} onRefresh={load} />
          </div>
          <div style={{ display: tab === "arquivo" ? "block" : "none" }}>
            <ArquivoTab propertyId={property.id} bundle={bundle}
              canManage={canManage} onRefresh={load} />
          </div>
        </>
      )}
    </div>
  );
}

export default function TarifarioPageGuarded() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager", "reception"]}>
      <TarifarioPage />
    </RoleGuard>
  );
}
