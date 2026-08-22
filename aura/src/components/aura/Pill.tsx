import React from "react";
import { tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { renderIcon, type IconLike } from "./icon";

export interface PillProps {
  tone?: Tone;
  /** Cores livres (compatível com o Pill antigo de casamentos / pillS do comercial). */
  bg?: string;
  color?: string;
  border?: string;
  size?: "sm" | "md" | "lg";
  icon?: IconLike;
  /** Ponto colorido antes do texto (status). */
  dot?: boolean;
  label?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
}

/** Etiqueta: 9–11px, 800, caixa alta, raio 999, trio cor/fundo/borda. */
export function Pill({ tone = "neutral", bg, color, border, size = "sm", icon, dot, label, children, style, className, title }: PillProps) {
  const t = toneOf(tone);
  const s: React.CSSProperties = {
    background: bg ?? t.bg,
    color: color ?? t.color,
    borderColor: border ?? t.border,
    ...style,
  };
  return (
    <span className={`ak-pill${className ? ` ${className}` : ""}`} data-size={size} style={s} title={title}>
      {dot && <span className="ak-pill__dot" />}
      {icon && renderIcon(icon, size === "lg" ? 12 : 10)}
      <span className="ak-pill__text">{label ?? children}</span>
    </span>
  );
}
