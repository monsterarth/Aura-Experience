// Visão em LISTA do pipeline (toggle Kanban | Lista do projeto de design):
// tabela densa ordenada pela ordem dos estágios, linha clicável abre o drawer.
"use client";

import { Phone } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CrmChannel, CrmLead } from "@/types/aura";
import { StageDef, fmtBR, leadAlert, money, pillS } from "./shared";

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1.2fr 1.1fr 44px",
  gap: 8,
};

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

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
      <div style={{
        ...GRID, padding: "10px 18px", borderBottom: `1px solid ${T.border}`,
        fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase",
        color: "rgba(238,240,248,0.35)",
      }}>
        <span>Lead</span><span>Datas</span><span>Valor</span><span>Canal</span><span>Etapa</span><span>Alerta</span><span />
      </div>
      {rows.length === 0 && (
        <p style={{ textAlign: "center", fontSize: 12, color: T.muted, padding: "32px 0", margin: 0 }}>
          Nenhum lead no filtro atual.
        </p>
      )}
      {rows.map((l) => {
        const stage = stages.find((s) => s.id === l.stage);
        const alert = leadAlert(l);
        return (
          <div key={l.id} role="button" tabIndex={0} onClick={() => onOpen(l)}
            onKeyDown={(e) => e.key === "Enter" && onOpen(l)}
            style={{
              ...GRID, alignItems: "center", padding: "11px 18px",
              borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer",
              fontSize: 12.5, transition: "background .15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = T.glass; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
            <span style={{ fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {l.title}
            </span>
            <span style={{ color: "rgba(238,240,248,0.5)" }}>{fmtBR(l.dateRef)}</span>
            <span style={{ fontWeight: 800, color: T.text }}>
              {l.value > 0 ? `${l.valueApproximate ? "±" : ""}R$ ${money(l.value)}` : "—"}
            </span>
            <span style={{ color: "rgba(238,240,248,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {channelLabel(l.source) ?? "—"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(238,240,248,0.75)", fontWeight: 600 }}>
              {stage && <span style={{ width: 7, height: 7, borderRadius: 999, background: stage.dot, flexShrink: 0 }} />}
              {stage?.label ?? l.stage}
            </span>
            <span>
              {alert && (
                <span style={pillS(
                  alert === "expired" ? "rgba(248,113,113,0.12)" : "rgba(245,158,11,0.12)",
                  alert === "expired" ? T.red : T.amber,
                  alert === "expired" ? "rgba(248,113,113,0.3)" : "rgba(245,158,11,0.3)"
                )}>
                  {alert === "expired" ? "prazo vencido" : "follow-up"}
                </span>
              )}
            </span>
            <span>
              {l.phone && (
                <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()} title="Abrir WhatsApp"
                  style={{ padding: 6, borderRadius: 8, background: T.emeraldBg, color: T.emerald, display: "inline-flex" }}>
                  <Phone size={12} />
                </a>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
