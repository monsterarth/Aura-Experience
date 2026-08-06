"use client";

// src/components/ui/SettingRow.tsx
// Linha de configuração: ícone + título + explicação à esquerda, controle à direita.
// A explicação não é enfeite — é o que evita a pergunta "o que esse campo faz?",
// que é metade da confusão que este refactor existe para resolver.
import React from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: React.ReactNode;
  icon?: React.ElementType;
  iconClassName?: string;
  /** O controle da direita (Toggle, select, botão…). */
  children?: React.ReactNode;
  /** Torna a linha inteira clicável — use quando o controle for um Toggle. */
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function SettingRow({
  title, description, icon: Icon, iconClassName, children, onClick, disabled, className,
}: Props) {
  const content = (
    <>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <Icon size={18} className={cn("flex-shrink-0 text-primary", iconClassName)} />}
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-foreground leading-tight">{title}</p>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
          )}
        </div>
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </>
  );

  const base = "flex items-center justify-between w-full gap-3 px-4 py-3 bg-muted border border-border rounded-xl text-left";

  if (!onClick) return <div className={cn(base, className)}>{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(base, "cursor-pointer hover:opacity-80 disabled:opacity-60 transition-opacity", className)}
    >
      {content}
    </button>
  );
}
