// src/lib/role-routes.ts
//
// Fonte ÚNICA de verdade para o roteamento por cargo.
// Antes existiam dois mapas que se contradiziam (mobileRoleApp no middleware e
// ROLE_DESTINATIONS em /admin/dashboard), e o login despejava todo cargo de
// desktop em /admin/stays. Centralizar aqui elimina a divergência.
//
// Usado por:
//  - src/lib/supabase-middleware.ts  (redirect ao logar + bounce de cargos mobile)
//  - src/app/admin/dashboard/page.tsx (re-dispatch por cargo)
//  - src/components/admin/Sidebar.tsx (guarda secundária de cargos mobile)

/** Tela inicial de cada cargo ao logar (e destino do "voltar ao início"). */
export const ROLE_HOME: Record<string, string> = {
  super_admin: '/admin/core/dashboard',
  admin:       '/admin/hr',
  manager:     '/admin/hr',
  director:    '/director',
  reception:   '/admin/reception',
  kitchen:     '/admin/cafe-salao/kds',
  marketing:   '/admin/surveys/responses',
  compras:     '/admin/estoque',
  // Cargos operacionais mobile — caem direto no seu app de campo
  governance:  '/governanta',
  maid:        '/maid',
  maintenance: '/maintenance-ops', // coordenador → console de gestão
  technician:  '/maintenance',
  waiter:      '/waiter',
  houseman:    '/houseman',
  porter:      '/porter', // WIP — módulo ainda não criado
};

/** Fallback quando o cargo é desconhecido. Nunca /admin/stays (ninguém deve
 *  cair em Estadias por padrão). Recepção é acessível e segura. */
export const DEFAULT_HOME = '/admin/reception';

/** Cargos operacionais mobile: têm o seu próprio app e NÃO acessam /admin.
 *  O middleware os redireciona para fora de qualquer rota /admin. */
export const MOBILE_ONLY_ROLES = [
  'governance',
  'maid',
  'maintenance',
  'technician',
  'waiter',
  'houseman',
  'porter',
];

/** Resolve a tela inicial de um cargo. */
export function roleHome(role?: string | null): string {
  return (role && ROLE_HOME[role]) || DEFAULT_HOME;
}

/** true se o cargo é operacional mobile (deve ser barrado das rotas /admin). */
export function isMobileOnlyRole(role?: string | null): boolean {
  return !!role && MOBILE_ONLY_ROLES.includes(role);
}
