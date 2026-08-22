"use client";

import React, { forwardRef } from "react";
import Link from "next/link";
import { AnimatePresence, m } from "motion/react";
import { tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { renderIcon, type IconLike } from "./icon";
import { Spinner } from "./Spinner";
import { v } from "./motion";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "soft" | "danger" | "danger-solid" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mostra spinner, trava largura, desabilita e marca aria-busy. */
  loading?: boolean;
  /** Texto enquanto carrega (opcional — o padrão mantém o rótulo invisível). */
  loadingText?: string;
  icon?: IconLike;
  iconRight?: IconLike;
  /** true = sempre largura total; "mobile" = só < 768px. */
  fullWidth?: boolean | "mobile";
  /** Vira <Link>. */
  href?: string;
  /** Tom semântico (usado por variant="soft"). */
  tone?: Tone;
  children?: React.ReactNode;
}

function toneVars(t?: Tone): React.CSSProperties | undefined {
  if (!t) return undefined;
  const c = toneOf(t);
  return { "--ak-tone": c.color, "--ak-tone-bg": c.bg, "--ak-tone-border": c.border } as React.CSSProperties;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, loadingText, icon, iconRight, fullWidth, href, tone, children, className, style, disabled, type, ...rest },
  ref,
) {
  const iconPx = size === "sm" ? 14 : size === "lg" ? 17 : 15;
  const cls = `ak-btn ak-press ak-focus${className ? ` ${className}` : ""}`;
  const data = {
    "data-variant": variant,
    "data-size": size,
    "data-loading": loading || undefined,
    "data-full": fullWidth === true ? "true" : fullWidth === "mobile" ? "mobile" : undefined,
  } as const;
  const mergedStyle = { ...toneVars(tone), ...style };

  const content = (
    <>
      <span className="ak-btn__content">
        {icon && <span className="ak-btn__icon">{renderIcon(icon, iconPx)}</span>}
        {children != null && <span className="ak-btn__label">{children}</span>}
        {iconRight && <span className="ak-btn__icon">{renderIcon(iconRight, iconPx)}</span>}
      </span>
      <AnimatePresence initial={false}>
        {loading && (
          <m.span className="ak-btn__spinner" key="spinner" {...v.iconSwap}>
            <Spinner size={iconPx} color="currentColor" />
            {loadingText && <span className="ak-btn__label">{loadingText}</span>}
          </m.span>
        )}
      </AnimatePresence>
    </>
  );

  if (href && !disabled && !loading) {
    return (
      <Link href={href} className={cls} style={mergedStyle} {...data} {...(rest as object)}>
        {content}
      </Link>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cls}
      style={mergedStyle}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...data}
      {...rest}
    >
      {content}
    </button>
  );
});

export type IconButtonVariant = "ghost" | "secondary" | "outline" | "soft" | "primary" | "danger";

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Obrigatório: vira aria-label e title (botão só com ícone precisa de nome). */
  label: string;
  icon: IconLike;
  size?: ButtonSize;
  variant?: IconButtonVariant;
  tone?: Tone;
  loading?: boolean;
  active?: boolean;
  href?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = "md", variant = "ghost", tone, loading, active, href, className, style, disabled, type, ...rest },
  ref,
) {
  const iconPx = size === "sm" ? 14 : size === "lg" ? 20 : 16;
  const cls = `ak-iconbtn ak-press ak-focus${className ? ` ${className}` : ""}`;
  const data = { "data-size": size, "data-variant": variant, "data-active": active || undefined } as const;
  const mergedStyle = { ...toneVars(tone), ...style };
  const inner = loading ? <Spinner size={iconPx} color="currentColor" /> : renderIcon(icon, iconPx);
  if (href && !disabled) {
    return (
      <Link href={href} className={cls} style={mergedStyle} aria-label={label} title={label} {...data} {...(rest as object)}>
        {inner}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type ?? "button"} className={cls} style={mergedStyle} aria-label={label} title={label} disabled={disabled || loading} aria-busy={loading || undefined} {...data} {...rest}>
      {inner}
    </button>
  );
});
