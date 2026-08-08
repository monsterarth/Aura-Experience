// Um board do pipeline (Reservas OU Casamentos): colunas por estágio com
// contagem e soma — visual irmão do FunnelTab do tarifário.
"use client";

import { CalendarDays, Heart, Phone, Tag, CalendarClock, StickyNote } from "lucide-react";
import { CrmChannel, CrmLead } from "@/types/aura";
import { StageDef, fmtBR, leadAlert, money } from "./shared";

export function PipelineBoard({ title, icon, stages, leads, channels, onOpen }: {
  title: string;
  icon: React.ReactNode;
  stages: StageDef[];
  leads: CrmLead[];
  channels: CrmChannel[];
  onOpen: (l: CrmLead) => void;
}) {
  const channelLabel = (slug?: string | null) =>
    slug ? channels.find((c) => c.id === slug)?.label ?? slug : null;

  return (
    <div>
      <h3 className="flex items-center gap-2 font-bold text-foreground mb-2">
        {icon} {title}
        <span className="text-xs font-normal text-muted-foreground">({leads.length})</span>
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((stage) => {
          const rows = leads.filter((l) => l.stage === stage.id);
          const total = rows.reduce((s, l) => s + l.value, 0);
          return (
            <div key={stage.id} className="w-[240px] shrink-0">
              <div className="flex items-center gap-2 px-1 mb-2">
                <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                <span className="text-sm font-bold text-foreground">{stage.label}</span>
                <span className="text-xs text-muted-foreground">({rows.length})</span>
                {total > 0 && (
                  <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
                    R$ {money(total)}
                  </span>
                )}
              </div>
              <div className="space-y-2 min-h-[90px] bg-secondary/30 rounded-xl p-2">
                {rows.map((l) => {
                  const alert = leadAlert(l);
                  const src = channelLabel(l.source);
                  return (
                    <button key={l.id} onClick={() => onOpen(l)}
                      className="w-full text-left bg-card border border-border rounded-xl p-3 space-y-1 hover:border-foreground/30 transition-colors">
                      <p className="font-semibold text-sm text-foreground truncate">{l.title}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {l.entityType === "wedding" ? <Heart size={11} /> : <CalendarDays size={11} />}
                        {fmtBR(l.dateRef)}
                        {l.phone && <><span>·</span><Phone size={10} /></>}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {l.value > 0 && (
                          <span className="text-xs font-bold text-foreground">
                            {l.valueApproximate ? "a partir de " : ""}R$ {money(l.value)}
                          </span>
                        )}
                        {src && (
                          <span className="text-[10px] bg-secondary rounded-full px-2 py-0.5 inline-flex items-center gap-0.5">
                            <Tag size={9} /> {src}
                          </span>
                        )}
                        {alert && (
                          <span className={`text-[10px] rounded-full px-2 py-0.5 inline-flex items-center gap-0.5 ${
                            alert === "expired" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            <CalendarClock size={9} /> {alert === "expired" ? "prazo vencido" : "follow-up"}
                          </span>
                        )}
                        {l.lostReason && l.stage === "lost" && (
                          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5 truncate max-w-full">
                            <StickyNote size={9} className="shrink-0" /> {l.lostReason}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {rows.length === 0 && (
                  <p className="text-center text-[11px] text-muted-foreground py-4">vazio</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
