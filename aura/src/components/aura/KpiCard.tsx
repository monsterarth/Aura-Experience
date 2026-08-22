"use client";

import React from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { alpha, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { renderIcon, type IconLike } from "./icon";
import { Skeleton } from "./Skeleton";

export interface KpiCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: IconLike;
  tone?: Tone;
  trend?: { value: string; dir: "up" | "down" | "flat" };
  loading?: boolean;
  href?: string;
  onClick?: () => void;
  compact?: boolean;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
}

/** Cartão de indicador: tile de ícone + glow radial + valor 900. */
export function KpiCard({ label, value, sub, icon, tone = "brand", trend, loading, href, onClick, compact, style, className, title }: KpiCardProps) {
  const t = toneOf(tone);
  const interactive = !!(href || onClick);
  const cls = `ak-kpi${interactive ? " ak-press" : ""}${className ? ` ${className}` : ""}`;
  const isText = typeof value === "string" && value.length > 6;
  const body = loading ? (
    <>
      <Skeleton w={36} h={36} radius={10} />
      <div className="ak-kpi__body">
        <Skeleton w={72} h={20} radius={6} />
        <Skeleton w={96} h={10} radius={4} style={{ marginTop: 8 }} />
      </div>
    </>
  ) : (
    <>
      <span className="ak-kpi__glow" style={{ background: `radial-gradient(circle, ${alpha(t.color, 12)} 0%, transparent 70%)` }} />
      {icon && (
        <span className="ak-kpi__tile" style={{ background: t.bg, borderColor: t.border, color: t.color }}>
          {renderIcon(icon, 16)}
        </span>
      )}
      <div className="ak-kpi__body">
        <div className="ak-kpi__value" style={{ color: t.color }} data-text={isText || undefined}>
          {value}
          {trend && (
            <span className="ak-kpi__trend" style={{ color: trend.dir === "up" ? "var(--t-green)" : trend.dir === "down" ? "var(--t-red)" : "var(--t-muted)" }}>
              {trend.dir === "up" ? <TrendingUp size={11} /> : trend.dir === "down" ? <TrendingDown size={11} /> : null}
              {trend.value}
            </span>
          )}
        </div>
        <div className="ak-kpi__label">{label}</div>
        {sub && <div className="ak-kpi__sub">{sub}</div>}
      </div>
    </>
  );
  const data = { "data-interactive": interactive || undefined, "data-compact": compact || undefined } as const;
  if (href) return <Link href={href} className={cls} style={{ borderColor: t.border, ...style }} title={title} {...data}>{body}</Link>;
  if (onClick) return <button type="button" className={cls} style={{ borderColor: t.border, ...style }} onClick={onClick} title={title} {...data}>{body}</button>;
  return <div className={cls} style={{ borderColor: t.border, ...style }} title={title} {...data}>{body}</div>;
}

/**
 * Grade de KPIs: 2 colunas no celular, `cols` no desktop. `stagger` (padrão) é o
 * ÚNICO stagger permitido por página — entrada em sequência de 35ms, máx. 6.
 */
export function KpiGrid({ cols = 4, stagger = true, children, className, style }: { cols?: 2 | 3 | 4 | 5 | 6; stagger?: boolean; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <div className={`ak-kpis${className ? ` ${className}` : ""}`} data-cols={String(cols)} data-stagger={stagger || undefined} style={style}>
      {items.map((child, i) => {
        if (!React.isValidElement(child)) return child;
        const prev = (child.props as { style?: React.CSSProperties }).style ?? {};
        return React.cloneElement(child as React.ReactElement<{ style?: React.CSSProperties }>, {
          style: { ...prev, ["--i" as string]: Math.min(i, 6) } as React.CSSProperties,
        });
      })}
    </div>
  );
}
