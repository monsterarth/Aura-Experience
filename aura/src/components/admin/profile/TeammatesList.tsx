"use client";

import { useState, useEffect } from "react";
import { Staff } from "@/types/aura";
import { StaffService } from "@/services/staff-service";
import { Users } from "lucide-react";
import Link from "next/link";

const ROLE_META: Record<string, { label: string; color: string }> = {
  super_admin: { label: "Super Admin",      color: "#9b6dff" },
  admin:       { label: "Administrador",    color: "#4ec9d4" },
  hr:          { label: "Gestão",            color: "#60a5fa" },
  reception:   { label: "Recepção",         color: "#2dd4bf" },
  governance:  { label: "Governança",       color: "#c084fc" },
  kitchen:     { label: "Cozinha",          color: "#fb923c" },
  maintenance: { label: "Manutenção",       color: "#f59e0b" },
  marketing:   { label: "Marketing",        color: "#a3e635" },
};

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

interface Props {
  propertyId: string;
  currentStaffId: string;
}

export function TeammatesList({ propertyId, currentStaffId }: Props) {
  const [teammates, setTeammates] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    StaffService.getStaffByProperty(propertyId)
      .then(all => setTeammates(all.filter(s => s.id !== currentStaffId && s.active)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [propertyId, currentStaffId]);

  if (!loading && teammates.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} className="text-cyan-400 flex-shrink-0" />
        <span className="text-[13px] font-extrabold text-foreground uppercase tracking-wider">
          Equipe
        </span>
        {!loading && (
          <span className="text-[11px] text-muted-foreground ml-1">
            {teammates.length} {teammates.length === 1 ? "colega" : "colegas"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse opacity-40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {teammates.map(mate => {
            const role = ROLE_META[mate.role] ?? { label: mate.role, color: "#4ec9d4" };
            return (
              <Link
                key={mate.id}
                href={`/admin/perfil/${mate.id}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border hover:border-[color:var(--tw-ring-color)] transition-all group"
                style={{ "--tw-ring-color": `${role.color}55` } as React.CSSProperties}
              >
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-black overflow-hidden transition-transform group-hover:scale-105"
                  style={{
                    background: `linear-gradient(135deg,${role.color}22,${role.color}11)`,
                    border: `1px solid ${role.color}44`,
                    color: role.color,
                  }}
                >
                  {mate.profilePictureUrl ? (
                    <img
                      src={mate.profilePictureUrl}
                      alt={mate.fullName}
                      className="w-full h-full object-cover rounded-xl"
                    />
                  ) : (
                    getInitials(mate.fullName)
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-foreground leading-tight truncate">
                    {mate.fullName.split(" ")[0]}
                  </p>
                  <p
                    className="text-[10px] font-semibold truncate mt-0.5"
                    style={{ color: role.color }}
                  >
                    {role.label}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
