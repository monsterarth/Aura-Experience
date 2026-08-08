// src/app/admin/tarifario/page.tsx
// Tarifário — motor comercial nativo (substitui o SIT offline da recepção):
// orçamentos com cascata Base → Flutuação → Promoções → Descontos → Extra →
// Taxa pet, tabelas de preço por categoria × pagantes, regras de calendário
// com resolução de conflitos e config comercial (templates de WhatsApp).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useTabParam } from "@/lib/settings-deeplink";
import { cn } from "@/lib/utils";
import { Calculator, CalendarRange, Filter, Loader2, Percent, Table2 } from "lucide-react";
import { RateQuoteRecord } from "@/types/aura";
import type { RateBundle } from "@/services/rate-service";
import QuoteTab from "./QuoteTab";
import FunnelTab from "./FunnelTab";
import TablesTab from "./TablesTab";
import CalendarTab from "./CalendarTab";
import CommercialTab from "./CommercialTab";

type TabId = "orcamento" | "funil" | "tabelas" | "calendario" | "comercial";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "orcamento", label: "Orçamento", icon: Calculator },
  { id: "funil", label: "Funil", icon: Filter },
  { id: "tabelas", label: "Tabelas", icon: Table2 },
  { id: "calendario", label: "Calendário", icon: CalendarRange },
  { id: "comercial", label: "Comercial", icon: Percent },
];

function TarifarioPage() {
  const { currentProperty: property } = useProperty();
  const { userData } = useAuth();

  const [bundle, setBundle] = useState<RateBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // ?tab=comercial vem do hub de configurações.
  const [tab, setTab] = useState<TabId>(useTabParam(TABS.map(t => t.id), "orcamento"));
  // Sinal para a aba Funil recarregar quando o Orçamento salva um lead novo.
  const [funnelSignal, setFunnelSignal] = useState(0);
  // Orçamento reaberto na calculadora (via funil ou ?quoteId= no link).
  const [reopenQuote, setReopenQuote] = useState<RateQuoteRecord | null>(null);
  const searchParams = useSearchParams();
  const quoteIdHandled = useRef(false);

  const handleReopenQuote = useCallback((q: RateQuoteRecord) => {
    setReopenQuote(q);
    setTab("orcamento");
  }, []);

  // Deep-link ?quoteId= (usado pelo hub Comercial e por links compartilhados).
  useEffect(() => {
    const quoteId = searchParams.get("quoteId");
    if (!quoteId || !property?.id || quoteIdHandled.current) return;
    quoteIdHandled.current = true;
    fetch(`/api/admin/tarifario/quotes?propertyId=${property.id}&id=${quoteId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.quote) handleReopenQuote(d.quote); })
      .catch(() => {});
  }, [searchParams, property?.id, handleReopenQuote]);

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

  // Troca de propriedade: zera o bundle para não parear dados velhos com o id novo.
  useEffect(() => {
    setBundle(null);
    setLoading(true);
    setLoadError(false);
  }, [property?.id]);

  if (!property) return null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tarifário</h1>
          <p className="text-sm text-muted-foreground">
            Orçamentos, tabelas de preço e regras de calendário da pousada.
          </p>
        </div>
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                tab === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="animate-spin mr-2" size={20} /> Carregando tarifário…
        </div>
      ) : loadError || !bundle ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-14 text-center text-muted-foreground">
          <p className="mb-3">Não foi possível carregar o tarifário.</p>
          <p className="text-xs mb-4">
            Se este é o primeiro uso, confirme que a migration <code>tarifario_phase1.sql</code> foi
            aplicada no Supabase.
          </p>
          <button onClick={() => { setLoading(true); load(); }}
            className="text-sm font-medium text-primary underline underline-offset-4">
            Tentar novamente
          </button>
        </div>
      ) : (
        // Abas ficam montadas (display) para não descartar edições não salvas ao alternar.
        <>
          <div style={{ display: tab === "orcamento" ? "block" : "none" }}>
            <QuoteTab
              propertyId={property.id}
              bundle={bundle}
              attendantName={userData?.fullName || "Recepção"}
              onQuoteSaved={() => setFunnelSignal((n) => n + 1)}
              initialQuote={reopenQuote}
              onExitEdit={() => setReopenQuote(null)}
            />
          </div>
          <div style={{ display: tab === "funil" ? "block" : "none" }}>
            <FunnelTab
              propertyId={property.id}
              bundle={bundle}
              active={tab === "funil"}
              refreshSignal={funnelSignal}
              onReopenQuote={handleReopenQuote}
            />
          </div>
          <div style={{ display: tab === "tabelas" ? "block" : "none" }}>
            <TablesTab propertyId={property.id} bundle={bundle} onRefresh={load} />
          </div>
          <div style={{ display: tab === "calendario" ? "block" : "none" }}>
            <CalendarTab propertyId={property.id} bundle={bundle} onRefresh={load} />
          </div>
          <div style={{ display: tab === "comercial" ? "block" : "none" }}>
            <CommercialTab propertyId={property.id} bundle={bundle} onRefresh={load} />
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
