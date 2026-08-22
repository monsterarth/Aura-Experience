"use client";

import React from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { renderIcon, type IconLike } from "./icon";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon?: IconLike;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: { label: string; onClick?: () => void; href?: string; icon?: IconLike };
  secondaryAction?: { label: string; onClick?: () => void; href?: string };
  compact?: boolean;
  /** Cartão tracejado em volta. */
  bordered?: boolean;
  tone?: Tone;
  style?: React.CSSProperties;
  className?: string;
}

/** Estado vazio — nunca um beco: explica e dá o próximo passo. */
export function EmptyState({ icon = Inbox, title, description, action, secondaryAction, compact, bordered, tone = "neutral", style, className }: EmptyStateProps) {
  const t = toneOf(tone);
  return (
    <div className={`ak-empty${className ? ` ${className}` : ""}`} data-compact={compact || undefined} data-bordered={bordered || undefined} style={style} role="status">
      <span className="ak-empty__icon" style={{ background: t.bg, borderColor: t.border, color: tone === "neutral" ? "var(--t-muted)" : t.color }}>
        {renderIcon(icon, compact ? 18 : 24)}
      </span>
      <div className="ak-empty__title">{title}</div>
      {description && <div className="ak-empty__desc">{description}</div>}
      {(action || secondaryAction) && (
        <div className="ak-empty__actions">
          {action && <Button variant="primary" size={compact ? "sm" : "md"} icon={action.icon} onClick={action.onClick} href={action.href}>{action.label}</Button>}
          {secondaryAction && <Button variant="ghost" size={compact ? "sm" : "md"} onClick={secondaryAction.onClick} href={secondaryAction.href}>{secondaryAction.label}</Button>}
        </div>
      )}
    </div>
  );
}

export function ErrorState({ title = "Não foi possível carregar", description, onRetry, retrying, compact }: { title?: React.ReactNode; description?: React.ReactNode; onRetry?: () => void; retrying?: boolean; compact?: boolean }) {
  return (
    <div className="ak-empty" data-compact={compact || undefined} data-bordered role="alert">
      <span className="ak-empty__icon" style={{ background: "var(--t-red-bg)", borderColor: "var(--t-red-border)", color: "var(--t-red)" }}>
        <AlertTriangle size={compact ? 18 : 24} />
      </span>
      <div className="ak-empty__title">{title}</div>
      {description && <div className="ak-empty__desc">{description}</div>}
      {onRetry && (
        <div className="ak-empty__actions">
          <Button variant="secondary" icon={RefreshCw} onClick={onRetry} loading={retrying}>Tentar de novo</Button>
        </div>
      )}
    </div>
  );
}
