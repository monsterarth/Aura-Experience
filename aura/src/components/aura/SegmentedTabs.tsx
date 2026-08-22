"use client";

import React, { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { m } from "motion/react";
import { tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { renderIcon, type IconLike } from "./icon";
import { tr } from "./motion";

export interface TabItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: IconLike;
  count?: number;
  tone?: Tone;
  href?: string;
  disabled?: boolean;
}

export interface SegmentedTabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange?: (id: T) => void;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Esconde rótulo no celular quando há ícone (fica só o ícone). */
  iconOnlyOnMobile?: boolean;
}

/**
 * Abas segmentadas com indicador deslizante (layoutId). Troca de aba é
 * instantânea no conteúdo — só o indicador anima (portão de Emil).
 */
export function SegmentedTabs<T extends string = string>({ items, value, onChange, size = "md", fullWidth, ariaLabel, className, style, iconOnlyOnMobile }: SegmentedTabsProps<T>) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);

  // Mantém a aba ativa visível no scroll horizontal (celular).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView?.({ inline: "nearest", block: "nearest", behavior: "auto" });
  }, [value]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const enabled = items.filter(i => !i.disabled);
    const idx = enabled.findIndex(i => i.id === value);
    if (idx < 0) return;
    const next = enabled[(idx + (e.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length];
    e.preventDefault();
    onChange?.(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${next.id}"]`)?.focus();
  };

  return (
    <div ref={listRef} role="tablist" aria-label={ariaLabel} className={`ak-tabs${className ? ` ${className}` : ""}`} data-size={size} data-full={fullWidth || undefined} style={style} onKeyDown={onKey}>
      {items.map(it => {
        const active = it.id === value;
        const t = it.tone ? toneOf(it.tone) : null;
        const inner = (
          <>
            {active && <m.span className="ak-tab__indicator" layoutId={`ak-tab-ind-${id}`} transition={tr.layout} aria-hidden />}
            {it.icon && <span style={{ display: "inline-flex", color: active && t ? t.color : undefined }}>{renderIcon(it.icon, size === "sm" ? 13 : 15)}</span>}
            <span className={iconOnlyOnMobile && it.icon ? "ak-tab__label ak-hide-mobile" : "ak-tab__label"}>{it.label}</span>
            {typeof it.count === "number" && <span className="ak-tab__count">{it.count > 99 ? "99+" : it.count}</span>}
          </>
        );
        const common = {
          role: "tab" as const,
          "aria-selected": active,
          tabIndex: active ? 0 : -1,
          className: "ak-tab ak-focus",
          "data-active": active ? "true" : undefined,
          "data-tab-id": it.id,
          "aria-disabled": it.disabled || undefined,
        };
        if (it.href && !it.disabled) {
          return <Link key={it.id} href={it.href} {...common} onClick={() => onChange?.(it.id)}>{inner}</Link>;
        }
        return (
          <button key={it.id} type="button" {...common} disabled={it.disabled} onClick={() => onChange?.(it.id)}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
