// src/app/admin/configuracoes/_lib/sections.ts
//
// Seções que já MORAM no hub (viram itens da sub-navegação). Começa vazio de
// propósito: o índice sobe primeiro apontando para a tela antiga, e cada seção
// portada entra aqui e vira `kind: "hub"` no catálogo. Enquanto a lista estiver
// vazia o layout não desenha sub-nav — igual food-and-beverage/layout.tsx, que
// esconde as abas quando só uma é visível.
import { UserRole, type Property } from "@/types/aura";
import { Palette, Clock, ScrollText, UtensilsCrossed, MessageSquare, Blocks, type LucideIcon } from "lucide-react";

export interface HubSection {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
  requires?: (p: Property) => boolean;
}

export const HUB_SECTIONS: HubSection[] = [
  { id: "marca", label: "Marca", href: "/admin/configuracoes/marca", icon: Palette, roles: ["super_admin", "admin"] },
  { id: "operacao", label: "Operação", href: "/admin/configuracoes/operacao", icon: Clock, roles: ["super_admin", "admin", "manager"] },
  { id: "politicas", label: "Políticas", href: "/admin/configuracoes/politicas", icon: ScrollText, roles: ["super_admin", "admin"] },
  { id: "gastronomia", label: "Gastronomia", href: "/admin/configuracoes/gastronomia", icon: UtensilsCrossed, roles: ["super_admin", "admin", "manager", "kitchen"] },
  { id: "integracoes", label: "Integrações", href: "/admin/configuracoes/integracoes", icon: MessageSquare, roles: ["super_admin", "admin"] },
  { id: "modulos", label: "Módulos", href: "/admin/configuracoes/modulos", icon: Blocks, roles: ["super_admin", "admin"] },
];

export function visibleSections(role: UserRole | undefined, secondary: UserRole[], property: Property | null): HubSection[] {
  if (!role) return [];
  return HUB_SECTIONS.filter((s) => {
    if (s.requires && property && !s.requires(property)) return false;
    if (role === "super_admin") return true;
    return s.roles.includes(role) || secondary.some((r) => s.roles.includes(r));
  });
}
