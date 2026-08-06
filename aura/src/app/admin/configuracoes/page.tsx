"use client";

// src/app/admin/configuracoes/page.tsx
//
// O índice. É a peça que resolve a queixa: antes, achar uma configuração exigia
// saber de cor em que tela ela tinha sido enfiada. Aqui se digita o que se quer
// mudar ("prazo", "frete", "pet", "chave") e o card diz onde fica — mesmo quando
// o "onde" é dentro de uma tela operacional.
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { filterDomains } from "./_lib/catalog";
import { UserRole } from "@/types/aura";
import { Search, ArrowUpRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

const TAG_LABEL: Record<string, string> = { cadastro: "cadastro", pessoal: "pessoal" };

export default function ConfiguracoesIndexPage() {
  const { userData } = useAuth();
  const { currentProperty } = useProperty();
  const [query, setQuery] = useState("");

  const domains = useMemo(
    () => filterDomains({
      role: userData?.role as UserRole | undefined,
      secondaryRoles: (userData?.secondaryRoles ?? []) as UserRole[],
      property: currentProperty,
      query,
    }),
    [userData?.role, userData?.secondaryRoles, currentProperty, query],
  );

  const total = domains.reduce((n, d) => n + d.entries.length, 0);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="O que você quer configurar? Ex.: prazo, pet, chave do WhatsApp, estoque principal"
          className="field-input w-full pl-10 pr-10 py-3"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Limpar busca"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {query && (
        <p className="text-xs text-muted-foreground -mt-3">
          {total === 0 ? "Nada encontrado." : `${total} resultado(s).`}
        </p>
      )}

      {domains.map((domain) => {
        const DomainIcon = domain.icon;
        return (
          <section key={domain.id} className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <DomainIcon size={14} /> {domain.label}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {domain.entries.map((entry) => {
                const Icon = entry.icon;
                const href = entry.href(currentProperty?.id ?? "");
                const external = entry.kind === "external";
                return (
                  <Link
                    key={entry.id}
                    href={href}
                    className={cn(
                      "group flex gap-3 p-4 rounded-2xl border border-border bg-card",
                      "hover:border-primary/40 hover:bg-secondary/30 transition-colors",
                    )}
                  >
                    <Icon size={18} className="text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground">{entry.title}</span>
                        {entry.tag && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                            {TAG_LABEL[entry.tag]}
                          </span>
                        )}
                        {external && (
                          <ArrowUpRight size={13} className="text-muted-foreground group-hover:text-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">{entry.description}</p>
                      {/* O caminho é o ponto do card: ele responde "onde fica" sem exigir que a pessoa já saiba. */}
                      {entry.where && (
                        <p className="text-[10px] text-muted-foreground/70 mt-1.5 truncate">{entry.where}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {domains.length === 0 && !query && (
        <p className="text-sm text-muted-foreground py-12 text-center">
          Seu cargo não tem configurações disponíveis.
        </p>
      )}
    </div>
  );
}
