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

// ── Tab bar inferior do celular (revamp 08/2026) ───────────────────────────────
// 4 destinos por cargo + "Mais" (abre o menu completo). Ícones são NOMES (este
// módulo roda no middleware/edge — nada de importar lucide aqui); o shell mapeia.
export type RoleTabIcon =
  | 'panel' | 'stays' | 'governance' | 'concierge' | 'reception' | 'guests'
  | 'maintenance' | 'kds' | 'orders' | 'menu' | 'cafe' | 'reviews' | 'surveys'
  | 'marketing' | 'messages' | 'stock' | 'products' | 'purchases' | 'movements' | 'cabins';

export interface RoleTab {
  id: string;
  label: string;
  href: string;
  icon: RoleTabIcon;
  /** Ativo só no caminho exato (hubs que têm subrotas em outras abas). */
  exact?: boolean;
}

const MGMT_TABS: RoleTab[] = [
  { id: 'panel',      label: 'Painel',     href: '/admin/hr',                icon: 'panel' },
  { id: 'stays',      label: 'Estadias',   href: '/admin/stays',             icon: 'stays' },
  { id: 'governance', label: 'Governança', href: '/admin/governance/kanban', icon: 'governance' },
  { id: 'concierge',  label: 'Concierge',  href: '/admin/concierge',         icon: 'concierge' },
];

export const ROLE_TABS: Record<string, RoleTab[]> = {
  super_admin: MGMT_TABS,
  admin:       MGMT_TABS,
  manager:     MGMT_TABS,
  reception: [
    { id: 'reception', label: 'Recepção',  href: '/admin/reception', icon: 'reception' },
    { id: 'stays',     label: 'Estadias',  href: '/admin/stays',     icon: 'stays' },
    { id: 'guests',    label: 'Hóspedes',  href: '/admin/guests',    icon: 'guests' },
    { id: 'concierge', label: 'Concierge', href: '/admin/concierge', icon: 'concierge' },
  ],
  governance: [
    { id: 'governance', label: 'Governança', href: '/admin/governance/kanban', icon: 'governance' },
    { id: 'stays',      label: 'Estadias',   href: '/admin/stays',             icon: 'stays' },
    { id: 'cabins',     label: 'Cabanas',    href: '/admin/cabins',            icon: 'cabins' },
    { id: 'concierge',  label: 'Concierge',  href: '/admin/concierge',         icon: 'concierge' },
  ],
  maintenance: [
    { id: 'kanban',    label: 'Manutenção', href: '/admin/maintenance/kanban', icon: 'maintenance' },
    { id: 'panel',     label: 'Painel',     href: '/admin/maintenance',        icon: 'panel', exact: true },
    { id: 'stays',     label: 'Estadias',   href: '/admin/stays',              icon: 'stays' },
    { id: 'concierge', label: 'Concierge',  href: '/admin/concierge',          icon: 'concierge' },
  ],
  kitchen: [
    { id: 'kds',    label: 'KDS',      href: '/admin/cafe-salao/kds',            icon: 'kds' },
    { id: 'orders', label: 'Pedidos',  href: '/admin/food-and-beverage/orders',  icon: 'orders' },
    { id: 'menu',   label: 'Cardápio', href: '/admin/food-and-beverage/menu',    icon: 'menu' },
    { id: 'cafe',   label: 'Café',     href: '/admin/cafe-salao',                icon: 'cafe', exact: true },
  ],
  marketing: [
    { id: 'reviews',   label: 'Avaliações',  href: '/admin/surveys/responses',   icon: 'reviews' },
    { id: 'surveys',   label: 'Pesquisas',   href: '/admin/surveys',             icon: 'surveys', exact: true },
    { id: 'marketing', label: 'Marketing',   href: '/admin/comercial/marketing', icon: 'marketing' },
    { id: 'messages',  label: 'Comunicação', href: '/admin/comunicacao',         icon: 'messages' },
  ],
  compras: [
    { id: 'stock',     label: 'Estoque',  href: '/admin/estoque',               icon: 'stock', exact: true },
    { id: 'products',  label: 'Produtos', href: '/admin/estoque/produtos',      icon: 'products' },
    { id: 'purchases', label: 'Compras',  href: '/admin/estoque/compras',       icon: 'purchases' },
    { id: 'movements', label: 'Movim.',   href: '/admin/estoque/movimentacoes', icon: 'movements' },
  ],
};

/** Abas do celular para um cargo (recepção como fallback seguro). */
export function roleTabs(role?: string | null): RoleTab[] {
  return (role && ROLE_TABS[role]) || ROLE_TABS.reception;
}
