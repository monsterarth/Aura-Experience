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
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { PropertyService } from "@/services/property-service";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { visibleSections } from "./_lib/sections";
import { Property, UserRole } from "@/types/aura";
import { cn } from "@/lib/utils";
import { Loader2, Settings, Building2 } from "lucide-react";

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
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-bold text-foreground">
        <Building2 size={13} className="text-primary" />
        Editando: {property.name}
      </span>
    );
  }

  return (
    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-xs font-bold text-foreground">
      <Building2 size={13} className="text-primary" />
      Editando:
      <select
        value={property.id}
        onChange={(e) => setProperty(all.find((p) => p.id === e.target.value) ?? null)}
        className="bg-transparent outline-none font-bold text-foreground cursor-pointer"
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

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-primary" /></div>;
  }
  if (!currentProperty) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-2">
        <Settings size={28} className="mx-auto text-muted-foreground" />
        <h1 className="text-lg font-bold text-foreground">Selecione uma propriedade</h1>
        <p className="text-sm text-muted-foreground">
          As configurações são por pousada. Escolha uma no seletor da barra lateral para continuar.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings size={22} /> Configurações
          </h1>
          <p className="text-sm text-muted-foreground">
            Tudo que se ajusta na pousada, num lugar só — inclusive o que se ajusta em outra tela.
          </p>
        </div>
        <PropertyChip property={currentProperty} />
      </header>

      {sections.length > 0 && (
        <nav className="flex gap-1 mb-6 bg-secondary/40 p-1 rounded-xl w-fit flex-wrap">
          <Link
            href="/admin/configuracoes"
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors",
              pathname === "/admin/configuracoes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Visão geral
          </Link>
          {sections.map(({ id, label, href, icon: Icon }) => (
            <Link
              key={id}
              href={href}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors",
                pathname.startsWith(href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={15} /> {label}
            </Link>
          ))}
        </nav>
      )}

      {children}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={HUB_ROLES} redirectTo="/admin/login">
      <ConfiguracoesLayout>{children}</ConfiguracoesLayout>
    </RoleGuard>
  );
}
