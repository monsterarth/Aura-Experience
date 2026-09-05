// src/components/auth/ModuleGuard.tsx
//
// Irmão do RoleGuard para módulo desligável — camada 2 do enforcement
// (`docs/MODULARIZATION.md` §7). Lê a mesma resposta que o menu e a API
// (`src/lib/modules.ts`), então a página nunca fica aberta com o item escondido.
//
// RENDERIZA um aviso em vez de redirecionar, e isso é a decisão central do
// componente: `ROLE_HOME` (`src/lib/role-routes.ts`) pode mandar um cargo direto
// para a página de um módulo desligado, e um redirect daqui para a home voltaria
// para cá — loop. Uma tela que explica e aponta o caminho não entra em loop, e
// diz a verdade para quem chegou por URL antiga ou favorito.
"use client";

import React from "react";
import { Blocks, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { isModuleOn, MODULES, type ModuleKey } from "@/lib/modules";
import { EmptyState, PageShell } from "@/components/aura";

interface ModuleGuardProps {
  module: ModuleKey;
  children: React.ReactNode;
}

export function ModuleGuard({ module, children }: ModuleGuardProps) {
  const { currentProperty, loading } = useProperty();
  const { isSuperAdmin } = useAuth();

  // Sem propriedade resolvida ainda: não decidir. Mostrar a página e depois
  // trocá-la pelo aviso seria um flash de conteúdo que a pessoa não tem.
  if (loading && !currentProperty) {
    return (
      <div style={{ minHeight: "60dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--t-muted)" }} />
      </div>
    );
  }

  // super_admin sem propriedade selecionada no topo: a página cuida do próprio
  // estado vazio (é o que todas já fazem com `if (!currentProperty) return`).
  if (!currentProperty) return <>{children}</>;

  if (isModuleOn(currentProperty.settings, module)) return <>{children}</>;

  const label = MODULES[module].label;
  return (
    <PageShell>
      <EmptyState
        icon={Blocks}
        bordered
        title={`Módulo ${label} desligado`}
        description={
          isSuperAdmin
            ? "Esta pousada não tem este módulo ligado. Nada foi apagado — ligar de volta restaura tudo como estava."
            : "Esta pousada não contratou este módulo. Nada foi apagado — a contratação é com a plataforma."
        }
        action={isSuperAdmin ? { label: "Abrir Módulos", href: "/admin/configuracoes/modulos" } : undefined}
        secondaryAction={{ label: "Voltar ao Painel", href: "/admin/dashboard" }}
      />
    </PageShell>
  );
}
