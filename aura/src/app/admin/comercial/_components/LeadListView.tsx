// Visão em LISTA do pipeline (toggle Kanban | Lista): DataList do kit —
// tabela densa no desktop, cards no celular — ordenada pela ordem dos
// estágios; linha clicável abre o drawer.
"use client";

import { Phone } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CrmChannel, CrmLead } from "@/types/aura";
import { DataList, Pill, type Column } from "@/components/aura";
import { StageDef, fmtBR, leadAlert, money } from "./shared";

export function LeadListView({ stages, leads, channels, onOpen }: {
  stages: StageDef[];
  leads: CrmLead[];
  channels: CrmChannel[];
  onOpen: (l: CrmLead) => void;
}) {
  const order = Object.fromEntries(stages.map((s, i) => [s.id, i]));
  const rows = leads.slice().sort((a, b) => (order[a.stage] ?? 99) - (order[b.stage] ?? 99));
  const channelLabel = (slug?: string | null) =>
    slug ? channels.find((c) => c.id === slug)?.label ?? slug : null;

  const columns: Column<CrmLead>[] = [
    { id: "lead", header: "Lead", mobile: "title", priority: 1, cell: (l) => <span style={{ fontWeight: 700, color: T.text }}>{l.title}</span> },
    { id: "date", header: "Datas", mobile: "subtitle", priority: 2, nowrap: true, cell: (l) => <span style={{ color: T.muted }}>{fmtBR(l.dateRef)}</span> },
    { id: "value", header: "Valor", mobile: "trailing", priority: 1, align: "right", nowrap: true, cell: (l) => <span style={{ fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" }}>{l.value > 0 ? `${l.valueApproximate ? "±" : ""}R$ ${money(l.value)}` : "—"}</span> },
    { id: "channel", header: "Canal", mobile: "meta", priority: 3, cell: (l) => <span style={{ color: T.muted }}>{channelLabel(l.source) ?? "—"}</span> },
    {
      id: "stage", header: "Etapa", mobile: "meta", priority: 2, nowrap: true,
      cell: (l) => {
        const stage = stages.find((s) => s.id === l.stage);
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.text, fontWeight: 600 }}>
            {stage && <span style={{ width: 7, height: 7, borderRadius: 999, background: stage.dot, flexShrink: 0 }} />}
            {stage?.label ?? l.stage}
          </span>
        );
      },
    },
    {
      id: "alert", header: "Alerta", mobile: "meta", priority: 2,
      cell: (l) => {
        const alert = leadAlert(l);
        return alert ? <Pill tone={alert === "expired" ? "red" : "amber"} label={alert === "expired" ? "prazo vencido" : "follow-up"} /> : null;
      },
    },
    {
      id: "wa", header: "", mobile: "trailing", priority: 3, width: 44, align: "center",
      cell: (l) => l.phone ? (
        <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
          onClick={(e) => e.stopPropagation()} title="Abrir WhatsApp" aria-label="Abrir WhatsApp"
          style={{ padding: 8, borderRadius: 8, background: T.emeraldBg, color: T.emerald, display: "inline-flex" }}>
          <Phone size={12} />
        </a>
      ) : null,
    },
  ];

  return (
    <DataList<CrmLead>
      rows={rows}
      columns={columns}
      rowKey={(l) => l.id}
      onRowClick={onOpen}
      density="compact"
      empty={<p style={{ textAlign: "center", fontSize: 12, color: T.muted, padding: "32px 0", margin: 0 }}>Nenhum lead no filtro atual.</p>}
    />
  );
}
