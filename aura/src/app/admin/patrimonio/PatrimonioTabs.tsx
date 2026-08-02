// src/app/admin/patrimonio/PatrimonioTabs.tsx
// Navegação interna do módulo. Abas em vez de entradas no Sidebar: o grupo
// "Compras & Estoque" já carrega nove itens e não comporta mais quatro.
"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Landmark, ClipboardCheck, FileBarChart, QrCode } from "lucide-react";

export type PatrimonioTab = "ativos" | "inventario" | "relatorios" | "etiquetas";

const TABS: { id: PatrimonioTab; label: string; href: string; icon: React.ElementType }[] = [
  { id: "ativos", label: "Ativos", href: "/admin/patrimonio", icon: Landmark },
  { id: "inventario", label: "Conferência", href: "/admin/patrimonio/inventario", icon: ClipboardCheck },
  { id: "relatorios", label: "Relatórios", href: "/admin/patrimonio/relatorios", icon: FileBarChart },
  { id: "etiquetas", label: "Etiquetas", href: "/admin/patrimonio/etiquetas", icon: QrCode },
];

export default function PatrimonioTabs({ active }: { active: PatrimonioTab }) {
  return (
    <nav className="flex gap-1 border-b border-border overflow-x-auto">
      {TABS.map(({ id, label, href, icon: Icon }) => (
        <Link
          key={id}
          href={href}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition-colors",
            id === active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon size={15} /> {label}
        </Link>
      ))}
    </nav>
  );
}
