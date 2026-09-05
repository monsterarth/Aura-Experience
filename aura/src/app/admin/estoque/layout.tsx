"use client";

// Todo /admin/estoque/* atrás do módulo — camada 2 do enforcement. A rota da
// API ainda não checa a flag (fatia 3 da modularização); até lá, este guard e o
// menu são o que separa quem contratou de quem não contratou.
import { ModuleGuard } from "@/components/auth/ModuleGuard";

export default function EstoqueLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGuard module="estoque">{children}</ModuleGuard>;
}
