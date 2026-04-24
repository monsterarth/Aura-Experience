"use client";

import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin:       "Administrador",
  hr:          "Recursos Humanos",
  reception:   "Recepção",
  governance:  "Governança",
  kitchen:     "Cozinha",
  maintenance: "Manutenção",
  marketing:   "Marketing",
  maid:        "Camareira",
  technician:  "Técnico",
  waiter:      "Garçom",
  porter:      "Porter",
  houseman:    "Houseman",
};

export function ImpersonateBanner() {
  const { impersonating, stopImpersonation } = useAuth();

  if (!impersonating) return null;

  const { staff } = impersonating;
  const roleLabel = ROLE_LABELS[staff.role] ?? staff.role;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 8000,
      background: "rgba(192,132,252,0.13)",
      backdropFilter: "blur(8px)",
      borderBottom: "1px solid rgba(192,132,252,0.3)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 20px",
      height: 42,
      gap: 12,
    }}>
      {/* Left: warning + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <AlertTriangle size={15} color="#c084fc" style={{ flexShrink: 0 }} />
        <span style={{
          color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 600,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          Visualizando como{" "}
          <span style={{ color: "#c084fc" }}>{staff.fullName}</span>
          {" "}
          <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400 }}>({roleLabel})</span>
        </span>
      </div>

      {/* Right: end button */}
      <button
        onClick={stopImpersonation}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 8, cursor: "pointer",
          background: "rgba(192,132,252,0.15)",
          border: "1px solid rgba(192,132,252,0.35)",
          color: "#c084fc", fontSize: 12, fontWeight: 700,
          fontFamily: "inherit", flexShrink: 0,
          transition: "background .15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(192,132,252,0.25)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(192,132,252,0.15)")}
      >
        <X size={12} />
        Encerrar modo
      </button>
    </div>
  );
}
