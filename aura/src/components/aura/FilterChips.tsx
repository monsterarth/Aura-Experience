"use client";

import React from "react";
import { tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { renderIcon, type IconLike } from "./icon";

export interface ChipItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  count?: number;
  icon?: IconLike;
  tone?: Tone;
}

interface Single<T extends string> { multiple?: false; value: T | null; onChange: (id: T) => void; values?: never }
interface Multi<T extends string> { multiple: true; values: T[]; onChange: (ids: T[]) => void; value?: never }

export type FilterChipsProps<T extends string = string> = (Single<T> | Multi<T>) & {
  items: ChipItem<T>[];
  /** Rola horizontalmente no celular em vez de quebrar linha (padrão true). */
  scroll?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
};

/** Filtros rápidos em chips. Sem animação de troca (ação frequente). */
export function FilterChips<T extends string = string>(props: FilterChipsProps<T>) {
  const { items, scroll = true, ariaLabel, className, style } = props;
  const isActive = (id: T) => (props.multiple ? props.values.includes(id) : props.value === id);
  const toggle = (id: T) => {
    if (props.multiple) {
      const has = props.values.includes(id);
      props.onChange(has ? props.values.filter(v => v !== id) : [...props.values, id]);
    } else {
      props.onChange(id);
    }
  };
  return (
    <div className={`ak-chips${className ? ` ${className}` : ""}`} data-scroll={scroll || undefined} role="group" aria-label={ariaLabel} style={style}>
      {items.map(it => {
        const active = isActive(it.id);
        const t = it.tone ? toneOf(it.tone) : null;
        const vars = t ? ({ "--ak-tone": t.color, "--ak-tone-text": t.color } as React.CSSProperties) : undefined;
        return (
          <button key={it.id} type="button" className="ak-chip ak-press ak-focus" data-active={active || undefined} aria-pressed={active} onClick={() => toggle(it.id)} style={vars}>
            {it.icon && renderIcon(it.icon, 13)}
            <span>{it.label}</span>
            {typeof it.count === "number" && <span className="ak-chip__count">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
