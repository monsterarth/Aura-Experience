// Comercial · Reservas — funil de orçamentos de hospedagem.
// Vendedores de reservas e de casamentos são pessoas diferentes: cada funil
// tem página própria (o miolo comum vive em _components/FunnelPage).
"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { FunnelPage } from "../_components/FunnelPage";

export default function ComercialReservasPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager", "reception"]}>
      <FunnelPage funnel="quote" />
    </RoleGuard>
  );
}
