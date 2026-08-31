// src/lib/roles.ts
// Fonte única de verdade para APRESENTAR cargos (rótulo + ordem).
//
// Contexto: hoje existem ~9 cópias divergentes deste mapa espalhadas pelo app
// (admin/staff, admin/hr, escalas, escalas/mensal, director, maid,
// ImpersonateBanner, ImpersonateModal, RoleSwitcher) — algumas com um cargo "hr"
// que nem existe em UserRole, e com os rótulos de maintenance/technician
// invertidos entre si. Este arquivo é o destino para onde elas devem convergir;
// código novo importa daqui. Migrar as antigas é tarefa à parte.
//
// Os rótulos vêm de src/app/admin/staff/page.tsx, a cópia mais completa.
import { UserRole } from "@/types/aura";

/** Rótulo completo, como na tela de cadastro de funcionários. */
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Administrador",
  director: "Diretor",
  manager: "Gerente / RH",
  compras: "Compras",
  reception: "Recepção",
  governance: "Governanta (Gestão)",
  maid: "Camareira (Mobile)",
  maintenance: "Coordenador de Manutenção",
  technician: "Manutenção (Mobile)",
  kitchen: "Cozinha (Gestão)",
  waiter: "Garçom (Mobile)",
  porter: "Porteiro (Mobile)",
  houseman: "Mensageiro (Mobile)",
  marketing: "Marketing",
};

/** Rótulo curto, para chips, cabeçalhos de grupo e colunas estreitas. */
export const ROLE_SHORT_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Administrador",
  director: "Diretor",
  manager: "Gerência",
  compras: "Compras",
  reception: "Recepção",
  governance: "Governança",
  maid: "Camareiras",
  maintenance: "Coord. Manutenção",
  technician: "Manutenção",
  kitchen: "Cozinha",
  waiter: "Garçons",
  porter: "Portaria",
  houseman: "Mensageiros",
  marketing: "Marketing",
};

/**
 * Ordem de exibição: operação primeiro (quem mais aparece nas listas do dia a
 * dia), gestão depois. Serve para agrupar selects e ordenar listas de pessoas.
 */
export const ROLE_ORDER: UserRole[] = [
  "governance", "maid", "houseman", "maintenance", "technician",
  "reception", "porter", "kitchen", "waiter",
  "compras", "marketing", "manager", "director", "admin", "super_admin",
];

export function roleLabel(role?: string | null): string {
  if (!role) return "Sem cargo";
  return ROLE_LABELS[role as UserRole] ?? role;
}

export function roleShortLabel(role?: string | null): string {
  if (!role) return "Sem cargo";
  return ROLE_SHORT_LABELS[role as UserRole] ?? role;
}

