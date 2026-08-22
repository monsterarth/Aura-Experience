"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Coffee, FileText, ListOrdered } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageShell, PageHeader, SegmentedTabs } from "@/components/aura";

/** Shell do módulo F&B: cabeçalho + abas (Pedidos / Cardápio). As páginas renderizam só o conteúdo. */
export default function FandBLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { userData } = useAuth();
  const canSeeMenu = ["super_admin", "admin", "kitchen"].includes(userData?.role ?? "");

  const tabs = [
    { id: "orders", label: "Pedidos", icon: ListOrdered, href: "/admin/food-and-beverage/orders" },
    ...(canSeeMenu ? [{ id: "menu", label: "Cardápio", icon: FileText, href: "/admin/food-and-beverage/menu" }] : []),
  ];
  const active = pathname.startsWith("/admin/food-and-beverage/menu") ? "menu" : "orders";

  return (
    <PageShell>
      <PageHeader
        icon={Coffee}
        iconTone="amber"
        title={canSeeMenu ? "Gastronomia (F&B)" : "Pedidos de café da manhã"}
        subtitle={canSeeMenu ? "Gestão do restaurante e do café da manhã." : "Visualize e imprima os pedidos do dia."}
        tabs={tabs.length > 1 ? <SegmentedTabs items={tabs} value={active} ariaLabel="Seções de F&B" /> : undefined}
      />
      {children}
    </PageShell>
  );
}
