import React from "react";
import { tone as toneOf, type Tone } from "@/lib/admin-tokens";

export function ProgressBar({ value = 0, max = 100, tone = "brand", size = "md", indeterminate, label, gradient, style }: {
  value?: number; max?: number; tone?: Tone; size?: "sm" | "md" | "lg"; indeterminate?: boolean; label?: string; gradient?: boolean; style?: React.CSSProperties;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const t = toneOf(tone);
  return (
    <div className="ak-progress" data-size={size} data-indeterminate={indeterminate || undefined} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={indeterminate ? undefined : value} aria-label={label} style={style}>
      <div className="ak-progress__bar" style={{ transform: indeterminate ? undefined : `scaleX(${pct})`, background: gradient || tone === "brand" ? "linear-gradient(90deg,#9b6dff,#4ec9d4)" : t.color }} />
    </div>
  );
}

export function ProgressRing({ value = 0, max = 100, size = 52, stroke = 4, tone = "brand", children }: {
  value?: number; max?: number; size?: number; stroke?: number; tone?: Tone; children?: React.ReactNode;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const t = toneOf(tone);
  const id = `ak-ring-grad-${size}-${stroke}`;
  return (
    <span className="ak-ring-wrap" style={{ width: size, height: size }} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <svg className="ak-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#9b6dff" /><stop offset="100%" stopColor="#4ec9d4" /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--t-glass-3)" strokeWidth={stroke} />
        <circle className="ak-ring__fg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone === "brand" ? `url(#${id})` : t.color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      {children && <span className="ak-ring-wrap__label" style={{ fontSize: Math.max(10, size * 0.24) }}>{children}</span>}
    </span>
  );
}
