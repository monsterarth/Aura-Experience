"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";

export interface GroupSectionProps {
  label: string;
  count: number;
  tone?: Tone;
  /** Recolhimento é estado da visita — não vira preferência salva. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Cabeçalho de grupo (Próximas 72h, Na casa…) com contagem e recolher. */
export function GroupSection({ label, count, tone = "neutral", defaultOpen = true, children }: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const t = toneOf(tone);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="ak-press ak-focus"
        style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "2px 0", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
      >
        <ChevronDown size={14} color={T.muted} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .18s ease", flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase", color: tone === "neutral" ? T.muted : t.color }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.muted2, background: T.glass, border: `1px solid ${T.border}`, borderRadius: 999, padding: "1px 8px" }}>
          {count}
        </span>
        <span style={{ flex: 1, height: 1, background: T.border, marginLeft: 4 }} />
      </button>
      {open && children}
    </section>
  );
}
