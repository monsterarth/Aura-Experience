"use client";

import React from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { renderIcon, type IconLike } from "./icon";
import { Button, IconButton } from "./Button";
import { FAB } from "./FAB";
import { useIsMobile } from "./hooks";

/** Raiz de toda página: gap vertical padrão + entrada única (fade-up 180ms). */
export function PageShell({ maxWidth = "xl", gap = 16, animate = true, children, className, style }: {
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full"; gap?: number; animate?: boolean; children: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={`ak-pageshell${animate ? " ak-page" : ""}${className ? ` ${className}` : ""}`} data-maxw={maxWidth} style={{ gap, ...style }}>
      {children}
    </div>
  );
}

export interface PrimaryAction {
  label: string;
  icon?: IconLike;
  onClick?: () => void;
  href?: string;
  loading?: boolean;
  disabled?: boolean;
  /** No celular: "fab" (padrão, botão flutuante), "inline" (fica no header), "bar" (a página renderiza uma BottomActionBar). */
  mobile?: "fab" | "inline" | "bar";
}

export interface PageHeaderProps {
  title: React.ReactNode;
  /** Palavra em gradiente depois do título ("Dashboard <Gestão>"). */
  titleAccent?: string;
  subtitle?: React.ReactNode;
  icon?: IconLike;
  iconTone?: Tone;
  badge?: React.ReactNode;
  back?: { href?: string; onClick?: () => void; label?: string };
  actions?: React.ReactNode;
  primaryAction?: PrimaryAction;
  /** Abas/filtros logo abaixo do título. */
  tabs?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function PageHeader({ title, titleAccent, subtitle, icon, iconTone = "brand", badge, back, actions, primaryAction, tabs, children, className, style }: PageHeaderProps) {
  const isMobile = useIsMobile();
  const mobileMode = primaryAction?.mobile ?? "fab";
  const t = toneOf(iconTone);
  const showFab = !!primaryAction && mobileMode === "fab" && isMobile;
  return (
    <header className={`ak-pagehead${className ? ` ${className}` : ""}`} data-has-fab={primaryAction && mobileMode === "fab" ? "true" : undefined} style={style}>
      <div className="ak-pagehead__row">
        <div className="ak-pagehead__main">
          {back && <IconButton icon={ChevronLeft} label={back.label ?? "Voltar"} size="lg" variant="secondary" href={back.href} onClick={back.onClick} />}
          {icon && !back && (
            <span className="ak-pagehead__tile" style={{ background: t.bg, borderColor: t.border, color: t.color }}>{renderIcon(icon, 18)}</span>
          )}
          <div className="ak-pagehead__titles">
            {badge && <div className="ak-pagehead__badge">{badge}</div>}
            <h1 className="ak-pagehead__title">
              {title}{titleAccent && <> <span className="ak-grad-text">{titleAccent}</span></>}
            </h1>
            {subtitle && <div className="ak-pagehead__sub">{subtitle}</div>}
          </div>
        </div>
        {(actions || (primaryAction && mobileMode !== "bar")) && (
          <div className="ak-pagehead__actions">
            {actions}
            {primaryAction && mobileMode !== "bar" && (
              <span className="ak-pagehead__primary">
                <Button variant="primary" icon={primaryAction.icon ?? Plus} onClick={primaryAction.onClick} href={primaryAction.href} loading={primaryAction.loading} disabled={primaryAction.disabled} fullWidth="mobile">
                  {primaryAction.label}
                </Button>
              </span>
            )}
          </div>
        )}
      </div>
      {tabs}
      {children}
      {showFab && <FAB icon={primaryAction!.icon ?? Plus} label={primaryAction!.label} onClick={primaryAction!.onClick} href={primaryAction!.href} disabled={primaryAction!.disabled || primaryAction!.loading} />}
    </header>
  );
}
