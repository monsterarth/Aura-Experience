// Comercial · Marketing — placeholder do projeto de design: o escopo do
// módulo (dashboards de campanha, funil de origem de leads) ainda não foi
// fechado. A Fase C do CRM (relatórios/KPIs) alimenta este espaço.
"use client";

import { Megaphone } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";

export default function ComercialMarketingPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager", "marketing"]}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Marketing</h1>
          <p className="text-sm text-muted-foreground">Campanhas e origem de leads.</p>
        </div>
        <div className="border border-dashed border-border rounded-2xl px-6 py-16 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center">
            <Megaphone size={22} className="text-primary" />
          </div>
          <p className="text-[15px] font-bold text-foreground">Módulo em definição</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Dashboards de campanha e funil de origem de leads entram aqui.
            O escopo ainda não foi fechado com o time.
          </p>
        </div>
      </div>
    </RoleGuard>
  );
}
