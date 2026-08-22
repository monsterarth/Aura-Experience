"use client";

import React from "react";
import { Cake, Palmtree } from "lucide-react";
import { Card, Pill, EmptyState } from "@/components/aura";
import { PersonRow } from "./PersonRow";
import type { BirthdayItem, PersonItem } from "./hr-utils";

/** Aniversariantes do mês. */
export function BirthdaysCard({ items }: { items: BirthdayItem[] }) {
  return (
    <Card header={{ icon: Cake, tone: "rose", title: "Aniversários", aside: <Pill tone="rose" label="Este mês" /> }}>
      {items.length === 0 ? (
        <EmptyState compact icon={Cake} title="Nenhum aniversário este mês" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(b => (
            <PersonRow
              key={b.id}
              person={b}
              tile
              sub={`${b.role} · ${b.dateLabel}`}
              trailing={b.daysLeft < 0
                ? <Pill tone="neutral" label="já passou" />
                : b.daysLeft === 0
                ? <Pill tone="rose" label="Hoje!" />
                : b.daysLeft <= 7
                  ? <Pill tone="rose" label={`em ${b.daysLeft}d`} />
                  : <Pill tone="neutral" label={`${b.daysLeft}d`} />}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

/** Quem está de folga hoje. */
export function DaysOffCard({ items }: { items: PersonItem[] }) {
  return (
    <Card header={{ icon: Palmtree, tone: "amber", title: "Folgas hoje", aside: items.length > 0 ? <Pill tone="amber" label={`${items.length} ${items.length === 1 ? "folga" : "folgas"}`} /> : undefined }}>
      {items.length === 0 ? (
        <EmptyState compact icon={Palmtree} title="Nenhuma folga hoje" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(p => <PersonRow key={p.id} person={p} tile trailing={<Pill tone="amber" label="Folga" />} />)}
        </div>
      )}
    </Card>
  );
}
