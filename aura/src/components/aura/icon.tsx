import React from "react";
import type { LucideIcon } from "lucide-react";

/** Ícone aceito pelo kit: componente lucide OU elemento pronto. */
export type IconLike = LucideIcon | React.ReactElement;

export function renderIcon(icon: IconLike | undefined | null, size = 16, extra?: Record<string, unknown>): React.ReactNode {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  const Cmp = icon as LucideIcon;
  return <Cmp size={size} {...(extra as object)} />;
}
