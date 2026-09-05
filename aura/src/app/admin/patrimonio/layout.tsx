"use client";

// Patrimônio é parte do módulo Compras & Estoque (decisão 2 do doc, uma chave só).
import { ModuleGuard } from "@/components/auth/ModuleGuard";

export default function PatrimonioLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGuard module="estoque">{children}</ModuleGuard>;
}
