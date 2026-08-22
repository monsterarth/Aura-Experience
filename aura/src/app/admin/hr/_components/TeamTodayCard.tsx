"use client";

import React, { useMemo, useState } from "react";
import { ArrowRight, Clock, Users } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { Card, FilterChips, Pill, Button, EmptyState, useIsMobile } from "@/components/aura";
import { PersonRow } from "./PersonRow";
import { TURNO_TONE, type ShiftEntry, type TurnoFilter } from "./hr-utils";

const FILTERS: { id: TurnoFilter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "manhã", label: "Manhã" },
  { id: "tarde", label: "Tarde" },
  { id: "noite", label: "Noite" },
  { id: "plantão", label: "Plantão" },
];

/** Quem está em turno hoje, com filtro por turno. */
export function TeamTodayCard({ shifts, workingCount, today }: { shifts: ShiftEntry[]; workingCount: number; today: Date }) {
  const [filter, setFilter] = useState<TurnoFilter>("todos");
  const isMobile = useIsMobile();
  const list = useMemo(() => (filter === "todos" ? shifts : shifts.filter(s => s.turno === filter)), [shifts, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of shifts) c[s.turno] = (c[s.turno] ?? 0) + 1;
    return c;
  }, [shifts]);

  return (
    <Card
      pad={0}
      style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
      header={{
        icon: Users, tone: "green", title: "Equipe hoje",
        sub: `${today.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${workingCount} em turno agora`,
      }}
      footer={(
        <>
          <span style={{ fontSize: 11, color: T.muted }}>Mostrando {list.length} de {shifts.length} escalas</span>
          <Button variant="link" size="sm" href="/admin/escalas" iconRight={ArrowRight}>Ver todas as escalas</Button>
        </>
      )}
    >
      <div className="ak-card__pad" style={{ padding: "0 16px 12px" }}>
        <FilterChips<TurnoFilter>
          ariaLabel="Filtrar por turno"
          items={FILTERS.map(f => ({ id: f.id, label: f.label, count: f.id === "todos" ? undefined : counts[f.id] || undefined }))}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <div style={{ padding: "0 16px", overflowY: isMobile ? "visible" : "auto", maxHeight: isMobile ? undefined : 360, scrollbarWidth: "thin" }}>
        {list.length === 0 ? (
          <EmptyState compact icon={Clock} title="Ninguém escalado neste turno" description={filter === "todos" ? "Nenhum funcionário em turno hoje." : "Tente outro turno ou veja todas as escalas."} />
        ) : list.map((s, i) => (
          <PersonRow
            key={s.id}
            person={s}
            online
            last={i === list.length - 1}
            trailing={(
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                  <Clock size={12} color={T.muted} /> {s.start} – {s.end}
                </span>
                <Pill tone={TURNO_TONE[s.turno]} label={s.turno} />
              </div>
            )}
          />
        ))}
      </div>
    </Card>
  );
}
