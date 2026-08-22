"use client";

// src/app/admin/configuracoes/layout.tsx
//
// Casca do hub de configurações.
//
// A regra que dá nome ao refactor: a propriedade vem SEMPRE do PropertyContext,
// nunca de um parâmetro da URL. A tela antiga (/admin/core/properties/[id]) lia
// params.id e ignorava o seletor — dava para editar a Fazenda do Rosa com o sistema
// apontando para outra pousada, e o breadcrumb ainda exibia a outra. Sem id na URL,
// a URL não tem como mentir.
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { PropertyService } from "@/services/property-service";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { visibleSections } from "./_lib/sections";
import { Property, UserRole } from "@/types/aura";
import { Settings, Building2, LayoutGrid } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { PageShell, PageHeader, SegmentedTabs, PageSkeleton, EmptyState, Pill } from "@/components/aura";

const HUB_ROLES: UserRole[] = [
  "super_admin", "admin", "manager", "reception", "kitchen", "compras", "governance",
];

/** Mostra em qual pousada as mudanças vão cair. Super admin troca aqui mesmo. */
function PropertyChip({ property }: { property: Property }) {
  const { isSuperAdmin } = useAuth();
  const { setProperty } = useProperty();
  const [all, setAll] = useState<Property[]>([]);

  useEffect(() => {
    if (isSuperAdmin) PropertyService.getAllProperties().then(setAll).catch(() => setAll([]));
  }, [isSuperAdmin]);

  if (!isSuperAdmin || all.length <= 1) {
    return <Pill tone="brand" icon={Building2} label={`Editando: ${property.name}`} size="md" />;
  }

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 10, background: T.glass, border: `1px solid ${T.border}`, fontSize: 12, fontWeight: 700, color: T.text }}>
      <Building2 size={13} color={T.brandText} />
      Editando:
      <select
        value={property.id}
        onChange={(e) => setProperty(all.find((p) => p.id === e.target.value) ?? null)}
        style={{ background: "transparent", border: "none", outline: "none", fontWeight: 700, color: T.text, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
        aria-label="Trocar a propriedade que está sendo configurada"
      >
        {all.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}

function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { userData } = useAuth();
  const { currentProperty, loading } = useProperty();

  const sections = visibleSections(
    userData?.role as UserRole | undefined,
    (userData?.secondaryRoles ?? []) as UserRole[],
    currentProperty,
  );

  if (loading) return <PageShell><PageSkeleton kpis={0} rows={5} /></PageShell>;
  if (!currentProperty) {
    return (
      <PageShell>
        <EmptyState icon={Settings} title="Selecione uma propriedade" description="As configurações são por pousada. Escolha uma no seletor da barra lateral para continuar." />
      </PageShell>
    );
  }

  const tabItems = [
    { id: "hub", label: "Visão geral", icon: LayoutGrid, href: "/admin/configuracoes" },
    ...sections.map(({ id, label, href, icon }) => ({ id, label, icon, href })),
  ];
  const active = pathname === "/admin/configuracoes" ? "hub" : (sections.find((s) => pathname.startsWith(s.href))?.id ?? "hub");

  return (
    <PageShell maxWidth="lg">
      <PageHeader
        icon={Settings}
        title="Configurações"
        subtitle="Tudo que se ajusta na pousada, num lugar só — inclusive o que se ajusta em outra tela."
        badge={<PropertyChip property={currentProperty} />}
        tabs={sections.length > 0 ? <SegmentedTabs items={tabItems} value={active} ariaLabel="Seções das configurações" /> : undefined}
      />
      {children}
    </PageShell>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={HUB_ROLES} redirectTo="/admin/login">
      <ConfiguracoesLayout>{children}</ConfiguracoesLayout>
    </RoleGuard>
  );
}
