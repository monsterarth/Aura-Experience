// Comercial · Casamentos — funil de negociações (o CRM).
// A GESTÃO do evento (fornecedores, cabanas, financeiro) continua em
// /admin/casamentos; aqui é o pipeline comercial.
"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";
import { FunnelPage } from "../_components/FunnelPage";

export default function ComercialCasamentosPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "manager", "reception"]}>
      <FunnelPage funnel="wedding" />
    </RoleGuard>
  );
}
