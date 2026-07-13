"use client";

import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types/aura";
import { ROLE_HOME } from "@/lib/role-routes";
import { usePathname, useRouter } from "next/navigation";

// Só os RÓTULOS são locais — o destino de cada cargo vem de ROLE_HOME (role-routes.ts,
// a fonte única do roteamento por cargo). Antes havia um mapa de paths duplicado aqui,
// que precisava ser editado em sincronia toda vez que um cargo mudava de casa.
const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  governance:  "Governanta",
  maid:        "Camareira",
  waiter:      "Garçom",
  houseman:    "Houseman",
  maintenance: "Manutenção",
  technician:  "Técnico",
};

export function RoleSwitcher() {
  const { userData } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!userData) return null;

  const allRoles: UserRole[] = [userData.role, ...(userData.secondaryRoles ?? [])];
  const areas = allRoles
    .filter(r => r in ROLE_LABELS && ROLE_HOME[r])
    .map(r => ({ role: r, path: ROLE_HOME[r], label: ROLE_LABELS[r]! }));

  // Menos de 2 áreas — não há o que trocar
  if (areas.length < 2) return null;

  // Match exato ou por segmento — startsWith puro destacava "Técnico" (/maintenance)
  // quando o usuário estava em /maintenance-ops.
  const currentArea = areas.find(a => pathname === a.path || pathname.startsWith(a.path + "/"));

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(6,8,15,0.85)",
      backdropFilter: "blur(12px)",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(238,240,248,0.35)", marginRight: 4 }}>
        Área
      </span>
      {areas.map(area => {
        const isCurrent = currentArea?.path === area.path;
        return (
          <button
            key={area.role}
            onClick={() => !isCurrent && router.push(area.path)}
            style={{
              padding: "4px 14px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              cursor: isCurrent ? "default" : "pointer",
              border: "none",
              outline: "none",
              transition: "all 0.15s",
              background: isCurrent
                ? "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)"
                : "rgba(255,255,255,0.07)",
              color: isCurrent ? "#fff" : "rgba(238,240,248,0.55)",
            }}
            disabled={isCurrent}
          >
            {area.label}
          </button>
        );
      })}
    </div>
  );
}
