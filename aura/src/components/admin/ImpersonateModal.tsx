"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserCircle2 } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { Staff, UserRole } from "@/types/aura";
import { T, alpha } from "@/lib/admin-tokens";
import { Dialog } from "@/components/aura/Dialog";
import { SearchInput } from "@/components/aura/SearchInput";
import { SkeletonList } from "@/components/aura/Skeleton";
import { EmptyState } from "@/components/aura/EmptyState";
import { Pill } from "@/components/aura/Pill";

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
  director:    75,
  manager:     60,
  reception:   40,
  governance:  40,
  kitchen:     40,
  maintenance: 40,
  marketing:   40,
  compras:     40,
  maid:        20,
  technician:  20,
  waiter:      20,
  porter:      20,
  houseman:    20,
};

const ROLE_META: Record<string, { label: string; color: string; badgeBg: string; badgeBorder: string }> = {
  super_admin: { label: "Super Admin",      color: T.brandText, badgeBg: "rgba(155,109,255,0.12)", badgeBorder: "rgba(155,109,255,0.28)" },
  admin:       { label: "Administrador",    color: T.g2,        badgeBg: "rgba(78,201,212,0.12)",  badgeBorder: "rgba(78,201,212,0.28)"  },
  hr:          { label: "Gestão",           color: T.blue,      badgeBg: T.blueBg,   badgeBorder: T.blueBorder   },
  manager:     { label: "Gestão",           color: T.blue,      badgeBg: T.blueBg,   badgeBorder: T.blueBorder   },
  reception:   { label: "Recepção",         color: T.green,     badgeBg: T.greenBg,  badgeBorder: T.greenBorder  },
  governance:  { label: "Governança",       color: T.violet,    badgeBg: T.violetBg, badgeBorder: T.violetBorder },
  kitchen:     { label: "Cozinha",          color: T.orange,    badgeBg: T.orangeBg, badgeBorder: T.orangeBorder },
  maintenance: { label: "Coord. Manutenção", color: T.amber,    badgeBg: T.amberBg,  badgeBorder: T.amberBorder  },
  marketing:   { label: "Marketing",        color: T.emerald,   badgeBg: T.emeraldBg, badgeBorder: T.emeraldBorder },
  compras:     { label: "Compras",          color: T.emerald,   badgeBg: T.emeraldBg, badgeBorder: T.emeraldBorder },
  maid:        { label: "Camareira",        color: T.g2,        badgeBg: "rgba(78,201,212,0.08)",  badgeBorder: "rgba(78,201,212,0.22)"  },
  technician:  { label: "Manutenção",       color: T.amber,     badgeBg: T.amberBg,  badgeBorder: T.amberBorder  },
  waiter:      { label: "Garçom",           color: T.blue,      badgeBg: T.blueBg,   badgeBorder: T.blueBorder   },
  porter:      { label: "Porter",           color: T.orange,    badgeBg: T.orangeBg, badgeBorder: T.orangeBorder },
  houseman:    { label: "Mensageiro",       color: T.orange,    badgeBg: T.orangeBg, badgeBorder: T.orangeBorder },
};

function getRoleMeta(role: string) {
  return ROLE_META[role] ?? { label: role, color: T.g2, badgeBg: "rgba(78,201,212,0.08)", badgeBorder: "rgba(78,201,212,0.22)" };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImpersonateModal({ open, onClose }: Props) {
  const { userData, startImpersonation } = useAuth();
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
    <Dialog
      open={open}
      onClose={onClose}
      presentation="auto"
      size="sm"
      title="Impersonar funcionário"
      subtitle="Você verá a interface como o funcionário vê; nada afeta dados reais."
      icon={UserCircle2}
      iconTone="violet"
      bodyPad={12}
    >
      <div style={{ marginBottom: 10 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome ou cargo…" fullWidth autoFocus />
      </div>
      {loading ? (
        <SkeletonList rows={5} card={false} />
      ) : filtered.length === 0 ? (
        <EmptyState compact title="Nenhum funcionário encontrado" description={search ? "Tente outro nome ou cargo." : undefined} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {filtered.map(staff => {
            const meta = getRoleMeta(staff.role);
            const isMobileRole = !!ROLE_TO_MOBILE_APP[staff.role as UserRole];
            return (
              <button
                key={staff.id}
                type="button"
                onClick={() => handleSelect(staff)}
                className="ak-press ak-focus ak-menu__item"
                style={{ padding: "10px 12px", borderRadius: 12, gap: 12, minHeight: 52 }}
              >
                <span style={{
                  width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                  background: T.glass2, border: `2px solid ${alpha(meta.color, 30)}`,
                  overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {staff.profilePictureUrl ? (
                    <Image src={staff.profilePictureUrl} alt={staff.fullName} width={38} height={38} style={{ objectFit: "cover" }} />
                  ) : (
                    <span style={{ color: meta.color, fontWeight: 800, fontSize: 14 }}>{staff.fullName.charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: T.text, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{staff.fullName}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Pill size="md" color={meta.color} bg={meta.badgeBg} border={meta.badgeBorder} label={meta.label} />
                    {isMobileRole && <Pill size="md" tone="neutral" label="Mobile" />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
