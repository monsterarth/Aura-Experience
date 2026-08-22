"use client";

import React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { renderIcon, type IconLike } from "./icon";
import { useKeyboardOpen } from "./hooks";

/**
 * Ação primária de páginas de LISTA no celular (1 por página). Fica no canto
 * inferior direito, acima da tab bar; some no desktop e com o teclado aberto.
 */
export function FAB({ icon = Plus, label, onClick, href, extended = false, hidden, disabled }: {
  icon?: IconLike; label: string; onClick?: () => void; href?: string; extended?: boolean; hidden?: boolean; disabled?: boolean;
}) {
  const keyboard = useKeyboardOpen();
  const data = { "data-icon-only": extended ? undefined : "true", "data-hidden": hidden || keyboard ? "true" : undefined, "data-disabled": disabled ? "true" : undefined, "aria-disabled": disabled || undefined } as const;
  const inner = <>{renderIcon(icon, 22, { strokeWidth: 2.4 })}{extended && <span>{label}</span>}</>;
  if (href && !disabled) return <Link href={href} className="ak-fab ak-press" aria-label={label} title={label} {...data}>{inner}</Link>;
  return <button type="button" className="ak-fab ak-press" aria-label={label} title={label} onClick={disabled ? undefined : onClick} disabled={disabled} {...data}>{inner}</button>;
}

/**
 * Ação primária de páginas de DETALHE/FORM: barra docada embaixo no celular
 * (safe-area), linha à direita no desktop. Nunca junto de um FAB na mesma tela.
 */
export function BottomActionBar({ primary, secondary, note, children, className, style }: {
  primary?: React.ReactNode; secondary?: React.ReactNode; note?: React.ReactNode; children?: React.ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <>
      <div className="ak-actionbar__spacer" aria-hidden />
      <div className={`ak-actionbar${className ? ` ${className}` : ""}`} style={style}>
        {note && <span className="ak-actionbar__note">{note}</span>}
        {secondary}
        {primary}
        {children}
      </div>
    </>
  );
}
