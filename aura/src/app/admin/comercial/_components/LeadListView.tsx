// Visão em LISTA do pipeline (toggle Kanban | Lista do projeto de design):
// tabela densa ordenada pela ordem dos estágios, linha clicável abre o drawer.
"use client";

import { Phone } from "lucide-react";
import { CrmChannel, CrmLead } from "@/types/aura";
import { StageDef, fmtBR, leadAlert, money } from "./shared";

const GRID = "grid grid-cols-[2fr_1.5fr_1fr_1fr_1.2fr_1.1fr_44px] gap-2";

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
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className={`${GRID} px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 border-b border-border`}>
        <span>Lead</span><span>Datas</span><span>Valor</span><span>Canal</span><span>Etapa</span><span>Alerta</span><span />
      </div>
      {rows.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-8">Nenhum lead no filtro atual.</p>
      )}
      {rows.map((l) => {
        const stage = stages.find((s) => s.id === l.stage);
        const alert = leadAlert(l);
        return (
          <div key={l.id} role="button" tabIndex={0} onClick={() => onOpen(l)}
            onKeyDown={(e) => e.key === "Enter" && onOpen(l)}
            className={`${GRID} items-center px-4 py-2.5 border-b border-border/50 cursor-pointer text-[12.5px] hover:bg-secondary/60 transition-colors`}>
            <span className="font-semibold text-foreground truncate">{l.title}</span>
            <span className="text-muted-foreground">{fmtBR(l.dateRef)}</span>
            <span className="font-bold text-foreground">
              {l.value > 0 ? `${l.valueApproximate ? "±" : ""}R$ ${money(l.value)}` : "—"}
            </span>
            <span className="text-muted-foreground truncate">{channelLabel(l.source) ?? "—"}</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
              {stage && <span className={`w-[7px] h-[7px] rounded-full ${stage.dot}`} />}
              {stage?.label ?? l.stage}
            </span>
            <span>
              {alert && (
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                  alert === "expired" ? "bg-red-500/10 border border-red-500/30 text-red-500"
                    : "bg-amber-500/10 border border-amber-500/30 text-amber-600"
                }`}>
                  {alert === "expired" ? "prazo vencido" : "follow-up"}
                </span>
              )}
            </span>
            <span>
              {l.phone && (
                <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()} title="Abrir WhatsApp"
                  className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors inline-flex">
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
