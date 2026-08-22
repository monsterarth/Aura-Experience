"use client";

import React from "react";
import { Loader2 } from "lucide-react";

/** O único spinner do kit — para botões, células e cargas pontuais. Áreas inteiras usam Skeleton. */
export function Spinner({ size = 16, color, className, style }: { size?: number; color?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`ak-spinner${className ? ` ${className}` : ""}`} style={{ color, ...style }} aria-hidden>
      <Loader2 size={size} className="ak-spin" />
    </span>
  );
}
