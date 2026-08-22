"use client";

import React, { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { T, alpha } from "@/lib/admin-tokens";
import { Card, Pill } from "@/components/aura";
import type { WeekBar } from "./hr-utils";

/** Turnos por dia da semana corrente (barras simples). */
export function WeekBarsCard({ bars, maxShifts, totalShifts, rangeLabel, weekLabel }: {
  bars: WeekBar[]; maxShifts: number; totalShifts: number; rangeLabel: string; weekLabel: string;
}) {
  // Barras crescem uma vez ao montar (260ms); depois ficam estáticas.
  const [filled, setFilled] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setFilled(true)); return () => cancelAnimationFrame(id); }, []);

  return (
    <Card pad={20} header={{ icon: Calendar, tone: "blue", title: "Escalas da semana", sub: `${rangeLabel} · ${totalShifts} turnos`, aside: <Pill tone="blue" label={weekLabel} /> }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 104 }} role="img" aria-label={`Turnos por dia: ${bars.map(b => `${b.day} ${b.shifts}`).join(", ")}`}>
        {bars.map((d, i) => {
          const h = Math.round((d.shifts / maxShifts) * 64);
          return (
            <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: d.isToday ? T.brandText : T.muted, fontVariantNumeric: "tabular-nums" }}>{d.shifts}</div>
              <div style={{ width: "100%", height: 64, borderRadius: 6, overflow: "hidden", background: T.glass2, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{
                  width: "100%",
                  height: filled ? h : 0,
                  minHeight: d.shifts > 0 ? 3 : 0,
                  borderRadius: 6,
                  background: d.isToday ? T.grad : d.shifts > maxShifts * 0.6 ? alpha(T.blue, 45) : T.blueBorder,
                  boxShadow: d.isToday ? `0 0 12px ${alpha(T.g1, 30)}` : "none",
                  transition: "height var(--dur-3) var(--ease-std)",
                }} />
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: d.isToday ? T.brandText : T.muted2 }}>{d.day}</div>
              <div style={{ fontSize: 9, color: T.muted2, fontWeight: 600, height: 11 }}>{d.folgas > 0 ? `${d.folgas}f` : ""}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
