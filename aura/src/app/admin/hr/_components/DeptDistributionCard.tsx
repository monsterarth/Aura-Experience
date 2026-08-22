"use client";

import React from "react";
import { Layers } from "lucide-react";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import { Card, ProgressBar, EmptyState } from "@/components/aura";
import type { DeptItem } from "./hr-utils";

/** Distribuição da equipe ativa por cargo. */
export function DeptDistributionCard({ items, total, activeCount }: { items: DeptItem[]; total: number; activeCount: number }) {
  return (
    <Card pad={20} header={{ icon: Layers, tone: "brand", title: "Distribuição da equipe", sub: `${activeCount} funcionários ativos` }}>
      {items.length === 0 ? (
        <EmptyState compact icon={Layers} title="Nenhum funcionário cadastrado" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map(d => {
            const t = toneOf(d.tone);
            return (
              <div key={d.label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: T.text, minWidth: 0 }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: t.color, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: t.color, fontVariantNumeric: "tabular-nums" }}>{d.count}</span>
                </div>
                <ProgressBar value={d.count} max={total} tone={d.tone} size="sm" label={`${d.label}: ${d.count} de ${total}`} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
