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
 * Cargos que recebem o canal INTERRUPTIVO. Para ampliar o público no futuro,
 * edite esta lista.
 *
 * O canal tem dois níveis desde 09/2026, e a régua é "isto pode esperar?":
 *
 * - URGENTE (pedido de concierge do hóspede, reserva de estrutura pendente):
 *   card fixo na tela + campainha a cada 2 min + notificação do navegador +
 *   badge âmbar no sino + título da aba piscando. Fica até alguém resolver.
 * - PASSIVO (mensagem de WhatsApp): toast e som na chegada, contador no menu
 *   lateral e no painel do sino — sem badge com número, sem piscar a aba.
 *
 * A separação veio de um número: ~9.800 mensagens recebidas em 30 dias contra
 * 8 pedidos de hóspede. Com tudo no mesmo badge, o sino vivia marcado e o
 * urgente sumia no meio do volume.
 */
export const NOTIFICATION_ALERT_ROLES: UserRole[] = ["reception"];

/** Campainha do card de urgência enquanto ninguém resolve. */
export const URGENT_REMIND_MS = 2 * 60_000;
/** "Suprimir por 5 min" — cala só o que já estava na fila; pedido novo fura. */
export const URGENT_SUPPRESS_MS = 5 * 60_000;
/** Onde o silêncio fica guardado (por navegador, sobrevive ao F5). */
export const URGENT_SUPPRESS_KEY = "aura:urgent-suppress";

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
