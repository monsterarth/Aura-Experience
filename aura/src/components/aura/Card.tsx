"use client";

import React, { forwardRef } from "react";
import Link from "next/link";
import { tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { renderIcon, type IconLike } from "./icon";

export interface CardHeader {
  title: React.ReactNode;
  sub?: React.ReactNode;
  icon?: IconLike;
  tone?: Tone;
  /** Conteúdo à direita do header (pill, botão, contagem). */
  aside?: React.ReactNode;
  /** Sem linha divisória. */
  bare?: boolean;
}

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  pad?: 0 | 12 | 16 | 20;
  /** Hover/press + cursor; vira <button> se tiver onClick e não tiver href. */
  interactive?: boolean;
  href?: string;
  header?: CardHeader;
  footer?: React.ReactNode;
  /** Borda/fundo tingidos (alerta, destaque). */
  tone?: Tone;
  children?: React.ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { pad = 16, interactive, href, header, footer, tone, children, className, style, onClick, ...rest },
  ref,
) {
  const t = tone ? toneOf(tone) : null;
  const s: React.CSSProperties = t ? { background: t.bg, borderColor: t.border, ...style } : { ...style };
  const cls = `ak-card${interactive || onClick || href ? " ak-press" : ""}${className ? ` ${className}` : ""}`;
  const data = { "data-pad": String(pad), "data-interactive": interactive || onClick || href ? "true" : undefined } as const;
  const inner = (
    <>
      {header && (
        <div className="ak-card__header" data-bare={header.bare || undefined}>
          {header.icon && (
            <span className="ak-card__tile" style={{ background: toneOf(header.tone ?? "brand").bg, borderColor: toneOf(header.tone ?? "brand").border, color: toneOf(header.tone ?? "brand").color }}>
              {renderIcon(header.icon, 14)}
            </span>
          )}
          <div className="ak-card__titles">
            <div className="ak-card__title">{header.title}</div>
            {header.sub && <div className="ak-card__sub">{header.sub}</div>}
          </div>
          {header.aside && <div className="ak-card__aside">{header.aside}</div>}
        </div>
      )}
      {children}
      {footer && <div className="ak-card__footer">{footer}</div>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} style={s} {...data} {...(rest as object)}>
        {inner}
      </Link>
    );
  }
  if (onClick && interactive !== false) {
    return (
      <button type="button" className={cls} style={s} onClick={onClick as unknown as React.MouseEventHandler<HTMLButtonElement>} {...data} {...(rest as object)}>
        {inner}
      </button>
    );
  }
  return (
    <div ref={ref} className={cls} style={s} onClick={onClick} {...data} {...rest}>
      {inner}
    </div>
  );
});

/** Rótulo de seção: 10px 800 caixa alta espaçado. */
export function SectionLabel({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return <div className={`ak-section-label${className ? ` ${className}` : ""}`} style={style}>{children}</div>;
}
