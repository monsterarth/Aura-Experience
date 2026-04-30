"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Search, UserCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { Staff, UserRole } from "@/types/aura";
import Image from "next/image";

// Cargos que existem apenas no mobile — mapeados para o app correspondente
const ROLE_TO_MOBILE_APP: Partial<Record<UserRole, string>> = {
  maid:       "maid",
  technician: "manutencao",
  waiter:     "garcom",
  porter:     "houseman",
  houseman:   "houseman",
};

// Hierarquia de roles — para bloquear impersonação de cargo igual ou superior
const ROLE_RANK: Record<UserRole, number> = {
  super_admin: 100,
  admin:       80,
  hr:          60,
  reception:   40,
  governance:  40,
  kitchen:     40,
  maintenance: 40,
  marketing:   40,
  maid:        20,
  technician:  20,
  waiter:      20,
  porter:      20,
  houseman:    20,
};

const ROLE_META: Record<string, { label: string; color: string; badgeBg: string; badgeBorder: string }> = {
  super_admin: { label: "Super Admin",      color: "#9b6dff", badgeBg: "rgba(155,109,255,0.12)", badgeBorder: "rgba(155,109,255,0.28)" },
  admin:       { label: "Administrador",    color: "#4ec9d4", badgeBg: "rgba(78,201,212,0.12)",  badgeBorder: "rgba(78,201,212,0.28)"  },
  hr:          { label: "Gestão",           color: "#60a5fa", badgeBg: "rgba(96,165,250,0.08)",  badgeBorder: "rgba(96,165,250,0.22)"  },
  reception:   { label: "Recepção",         color: "#2dd4bf", badgeBg: "rgba(45,212,191,0.08)",  badgeBorder: "rgba(45,212,191,0.22)"  },
  governance:  { label: "Governança",       color: "#c084fc", badgeBg: "rgba(192,132,252,0.08)", badgeBorder: "rgba(192,132,252,0.22)" },
  kitchen:     { label: "Cozinha",          color: "#fb923c", badgeBg: "rgba(251,146,60,0.08)",  badgeBorder: "rgba(251,146,60,0.25)"  },
  maintenance: { label: "Coord. Manutenção", color: "#f59e0b", badgeBg: "rgba(245,158,11,0.08)",  badgeBorder: "rgba(245,158,11,0.22)"  },
  marketing:   { label: "Marketing",        color: "#a3e635", badgeBg: "rgba(163,230,53,0.08)",  badgeBorder: "rgba(163,230,53,0.22)"  },
  maid:        { label: "Camareira",        color: "#4ec9d4", badgeBg: "rgba(78,201,212,0.08)",  badgeBorder: "rgba(78,201,212,0.22)"  },
  technician:  { label: "Manutenção",        color: "#f59e0b", badgeBg: "rgba(245,158,11,0.08)",  badgeBorder: "rgba(245,158,11,0.22)"  },
  waiter:      { label: "Garçom",           color: "#60a5fa", badgeBg: "rgba(96,165,250,0.08)",  badgeBorder: "rgba(96,165,250,0.22)"  },
  porter:      { label: "Porter",           color: "#fb923c", badgeBg: "rgba(251,146,60,0.08)",  badgeBorder: "rgba(251,146,60,0.25)"  },
  houseman:    { label: "Mensageiro",        color: "#fb923c", badgeBg: "rgba(251,146,60,0.08)",  badgeBorder: "rgba(251,146,60,0.25)"  },
};

function getRoleMeta(role: string) {
  return ROLE_META[role] ?? { label: role, color: "#4ec9d4", badgeBg: "rgba(78,201,212,0.08)", badgeBorder: "rgba(78,201,212,0.22)" };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImpersonateModal({ open, onClose }: Props) {
  const { userData, startImpersonation, impersonating } = useAuth();
  const { currentProperty: property } = useProperty();
  const router = useRouter();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const fetchStaff = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/staff?propertyId=${property.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setStaffList(Array.isArray(data) ? data : (data.staff ?? []));
    } finally {
      setLoading(false);
    }
  }, [property?.id]);

  useEffect(() => {
    if (open) {
      setSearch("");
      fetchStaff();
    }
  }, [open, fetchStaff]);

  if (!open) return null;

  const myRank = ROLE_RANK[userData?.role as UserRole] ?? 0;

  const filtered = staffList.filter(s => {
    if (s.id === userData?.id) return false;
    // Só mostra cargos de hierarquia inferior ao do usuário atual
    const targetRank = ROLE_RANK[s.role as UserRole] ?? 0;
    if (targetRank >= myRank) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.fullName.toLowerCase().includes(q) && !s.role.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function handleSelect(staff: Staff) {
    startImpersonation(staff);
    onClose();
    const mobileApp = ROLE_TO_MOBILE_APP[staff.role as UserRole];
    if (mobileApp) {
      router.push(`/admin/mobile-apps/${mobileApp}`);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#181818", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18, width: 420, maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <UserCircle2 size={18} color="#c084fc" />
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
              Impersonar funcionário
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.4)", padding: 4, borderRadius: 8,
              display: "flex", transition: "color .15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
          >
            <X size={17} />
          </button>
        </div>

        {/* Aviso */}
        <div style={{
          margin: "12px 16px 0",
          padding: "8px 12px",
          background: "rgba(192,132,252,0.07)",
          border: "1px solid rgba(192,132,252,0.2)",
          borderRadius: 10,
          color: "rgba(192,132,252,0.85)",
          fontSize: 12,
          lineHeight: 1.5,
        }}>
          Você verá a interface exatamente como o funcionário vê. Nenhuma ação afetará dados reais.
        </div>

        {/* Search */}
        <div style={{ padding: "12px 16px 8px", position: "relative" }}>
          <Search size={14} color="rgba(255,255,255,0.3)" style={{ position: "absolute", left: 28, top: "50%", transform: "translateY(-50%)" }} />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou cargo..."
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, padding: "9px 12px 9px 34px",
              color: "#fff", fontSize: 13, fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1, padding: "4px 8px 12px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 32, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
              Nenhum funcionário encontrado.
            </div>
          ) : (
            filtered.map(staff => {
              const meta = getRoleMeta(staff.role);
              const isMobile = !!ROLE_TO_MOBILE_APP[staff.role as UserRole];
              return (
                <button
                  key={staff.id}
                  onClick={() => handleSelect(staff)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", borderRadius: 12, cursor: "pointer",
                    background: "none", border: "none", fontFamily: "inherit",
                    transition: "background .12s", textAlign: "left",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                    background: "rgba(255,255,255,0.07)",
                    border: `2px solid ${meta.color}44`,
                    overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {staff.profilePictureUrl ? (
                      <Image src={staff.profilePictureUrl} alt={staff.fullName} width={38} height={38} style={{ objectFit: "cover" }} />
                    ) : (
                      <span style={{ color: meta.color, fontWeight: 700, fontSize: 14 }}>
                        {staff.fullName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {staff.fullName}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                        color: meta.color, background: meta.badgeBg, border: `1px solid ${meta.badgeBorder}`,
                        letterSpacing: ".02em",
                      }}>
                        {meta.label}
                      </span>
                      {isMobile && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 99,
                          color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}>
                          Mobile
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
