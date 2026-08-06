"use client";

// src/components/ui/SectionCard.tsx
// Bloco de configuração: cartão com cabeçalho de ícone + título (+ explicação).
// Padroniza o que hoje é escrito à mão em cada tela com raios e paddings diferentes.
import React from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  icon?: React.ElementType;
  description?: React.ReactNode;
  /** Canto superior direito: contador, selo, botão auxiliar. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Vermelho para blocos destrutivos (Danger Zone). */
  tone?: "default" | "danger";
}

export function SectionCard({ title, icon: Icon, description, aside, children, className, tone = "default" }: Props) {
  const danger = tone === "danger";
  return (
    <section
      className={cn(
        "border rounded-3xl p-6 space-y-4",
        danger ? "bg-red-500/5 border-red-500/30" : "bg-card border-border",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn("font-bold text-lg flex items-center gap-2", danger && "text-red-500")}>
            {Icon && <Icon size={20} className={danger ? "text-red-500" : "text-primary"} />}
            {title}
          </h3>
          {description && <p className="text-xs text-muted-foreground mt-1 leading-snug">{description}</p>}
        </div>
        {aside && <div className="flex-shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
