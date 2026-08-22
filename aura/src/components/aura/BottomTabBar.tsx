"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { renderIcon, type IconLike } from "./icon";
import { useKeyboardOpen } from "./hooks";

export interface TabBarItem {
  id: string;
  label: string;
  icon: IconLike;
  href?: string;
  onClick?: () => void;
  badge?: number;
  /** Regra de "ativo" customizada (padrão: pathname começa com href). */
  match?: (pathname: string) => boolean;
}

/**
 * Tab bar inferior do celular (< 1024px): 4 destinos + "Mais". In-flow no fim
 * do <main> (o scroll encolhe; nada de padding mágico). Some com teclado aberto.
 */
export function BottomTabBar({ items, hideWhenKeyboard = true, className }: { items: TabBarItem[]; hideWhenKeyboard?: boolean; className?: string }) {
  const pathname = usePathname() ?? "";
  const keyboard = useKeyboardOpen();
  return (
    <nav className={`ak-tabbar${className ? ` ${className}` : ""}`} aria-label="Navegação principal" data-hidden={hideWhenKeyboard && keyboard ? "true" : undefined}>
      {items.map(it => {
        const active = it.match ? it.match(pathname) : !!it.href && (pathname === it.href || pathname.startsWith(it.href + "/"));
        const inner = (
          <>
            <span className="ak-tabbar__icon">{renderIcon(it.icon, 20, { strokeWidth: active ? 2.3 : 1.8 })}</span>
            <span className="ak-tabbar__label">{it.label}</span>
            {it.badge ? <span className="ak-tabbar__badge">{it.badge > 99 ? "99+" : it.badge}</span> : null}
          </>
        );
        if (it.href) {
          return (
            <Link key={it.id} href={it.href} className="ak-tabbar__item ak-press" data-active={active || undefined} aria-current={active ? "page" : undefined}>
              {inner}
            </Link>
          );
        }
        return (
          <button key={it.id} type="button" className="ak-tabbar__item ak-press" onClick={it.onClick} data-active={active || undefined}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
