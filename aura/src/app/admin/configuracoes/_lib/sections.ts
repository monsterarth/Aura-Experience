// src/app/admin/configuracoes/_lib/sections.ts
//
// Seções que já MORAM no hub (viram itens da sub-navegação). Começa vazio de
// propósito: o índice sobe primeiro apontando para a tela antiga, e cada seção
// portada entra aqui e vira `kind: "hub"` no catálogo. Enquanto a lista estiver
// vazia o layout não desenha sub-nav — igual food-and-beverage/layout.tsx, que
// esconde as abas quando só uma é visível.
import { UserRole, type Property } from "@/types/aura";
import type { LucideIcon } from "lucide-react";

export interface HubSection {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
  requires?: (p: Property) => boolean;
}

export const HUB_SECTIONS: HubSection[] = [];

export function visibleSections(role: UserRole | undefined, secondary: UserRole[], property: Property | null): HubSection[] {
  if (!role) return [];
  return HUB_SECTIONS.filter((s) => {
    if (s.requires && property && !s.requires(property)) return false;
    if (role === "super_admin") return true;
    return s.roles.includes(role) || secondary.some((r) => s.roles.includes(r));
  });
}
