"use client";

import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { T, alpha } from "@/lib/admin-tokens";
import { Button } from "@/components/aura/Button";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin:       "Administrador",
  hr:          "Gestão",
  manager:     "Gestão",
  reception:   "Recepção",
  governance:  "Governança",
  kitchen:     "Cozinha",
  maintenance: "Coordenador de Manutenção",
  marketing:   "Marketing",
  compras:     "Compras",
  maid:        "Camareira",
  technician:  "Manutenção",
  waiter:      "Garçom",
  porter:      "Porter",
  houseman:    "Mensageiro",
};

/** Faixa de impersonação — in-flow no topo do <main> (não é mais fixed; nada de paddingTop mágico). */
export function ImpersonateBanner() {
  const { impersonating, stopImpersonation } = useAuth();

  if (!impersonating) return null;

  const { staff } = impersonating;
  const roleLabel = ROLE_LABELS[staff.role] ?? staff.role;

  return (
    <div
      role="status"
      style={{
        flexShrink: 0,
        minHeight: 38,
        background: alpha(T.violet, 12),
        borderBottom: `1px solid ${T.violetBorder}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px var(--page-pad)",
        gap: 12,
        paddingTop: "calc(4px + env(safe-area-inset-top, 0px))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <AlertTriangle size={15} color={T.violet} style={{ flexShrink: 0 }} />
        <span style={{ color: T.text, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Visualizando como <span style={{ color: T.violet }}>{staff.fullName}</span>{" "}
          <span style={{ color: T.muted, fontWeight: 400 }}>({roleLabel})</span>
        </span>
      </div>
      <Button variant="soft" tone="violet" size="sm" icon={X} onClick={stopImpersonation}>Encerrar</Button>
    </div>
  );
}
