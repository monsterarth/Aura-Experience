import type { UserRole } from "@/types/aura";

// ─── Roteamento de notificações por cargo ───────────────────────────────────────
// Centraliza "quem recebe o quê". Base para a continuidade do trabalho de privacidade
// do sistema de notificações.

/**
 * Cargos que VEEM o sininho/painel de notificações (canal passivo, não interruptivo).
 * Mesmo conjunto que já abre Comunicação/Concierge/Agendamentos no menu lateral.
 */
export const NOTIFICATION_VISIBLE_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "reception",
];

/**
 * Cargos que recebem o canal INTERRUPTIVO: toast + som + notificação do navegador +
 * piscar o título da aba. Para ampliar o público no futuro, edite esta lista.
 */
export const NOTIFICATION_ALERT_ROLES: UserRole[] = ["reception"];

/**
 * Verdadeiro se o cargo primário OU algum cargo secundário estiver na lista permitida.
 * Mesmo idioma do RoleGuard (src/components/auth/RoleGuard.tsx).
 */
export function hasAnyRole(
  role: UserRole | undefined | null,
  secondaryRoles: UserRole[] | undefined | null,
  allowed: UserRole[]
): boolean {
  if (role && allowed.includes(role)) return true;
  return (secondaryRoles ?? []).some((r) => allowed.includes(r));
}
