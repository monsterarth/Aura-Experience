// Comercial · Marketing — placeholder do projeto de design: o escopo do
// módulo (dashboards de campanha, funil de origem de leads) ainda não foi
// fechado. A Fase C do CRM (relatórios/KPIs) alimenta este espaço.
"use client";

import { Megaphone } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { T } from "@/lib/admin-tokens";

export default function ComercialMarketingPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager", "marketing"]}>
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-.02em", color: T.text }}>Marketing</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: T.muted }}>Campanhas e origem de leads.</p>
        </div>
        <div style={{
          border: `1px dashed ${T.border2}`, borderRadius: 16, padding: "64px 24px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center",
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, background: T.gradSoft,
            border: `1px solid ${T.g1Border}`, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Megaphone size={22} color={T.g1} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Módulo em definição</div>
          <div style={{ fontSize: 13, color: T.muted, maxWidth: 420 }}>
            Dashboards de campanha e funil de origem de leads entram aqui.
            O escopo ainda não foi fechado com o time.
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
