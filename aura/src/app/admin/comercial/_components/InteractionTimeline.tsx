// Timeline do lead: o histórico de crm_interactions legível — cada contato,
// troca de etapa, envio, conversão e perda em ordem cronológica inversa.
"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight, BadgeCheck, BellRing, CalendarClock, CircleDollarSign, FilePlus2,
  Loader2, MessageSquare, Pencil, Send, UserCheck, XCircle, Link2,
} from "lucide-react";
import { CrmInteraction, CrmLead } from "@/types/aura";
import { fmtBR, money } from "./shared";

const KIND_CFG: Record<string, { icon: React.ElementType; label: (i: CrmInteraction) => string }> = {
  created:      { icon: FilePlus2,     label: () => "Lead criado" },
  note:         { icon: MessageSquare, label: () => "Nota" },
  stage_change: { icon: ArrowRight,    label: (i) => `Etapa: ${String(i.payload?.from ?? "?")} → ${String(i.payload?.to ?? "?")}` },
  follow_up:    { icon: CalendarClock, label: () => "Contato registrado" },
  sent:         { icon: Send,          label: () => "Cotação enviada" },
  converted:    { icon: BadgeCheck,    label: () => "Convertido — hóspede garantido" },
  stay_linked:  { icon: Link2,         label: () => "Estadia vinculada" },
  lost:         { icon: XCircle,       label: (i) => `Perdido${i.payload?.reason ? ` — ${i.payload.reason}` : ""}` },
  reopened:     { icon: Pencil,        label: () => "Reaberto na calculadora" },
  value_change: { icon: CircleDollarSign, label: (i) => `Valor: R$ ${money(Number(i.payload?.from ?? 0))} → R$ ${money(Number(i.payload?.to ?? 0))}` },
  guest_linked: { icon: UserCheck,     label: () => "Vinculado à ficha de hóspede" },
  alarm_done:   { icon: BellRing,      label: (i) => `Alarme concluído${i.payload?.title ? ` — ${i.payload.title}` : ""}` },
};

export function InteractionTimeline({ propertyId, lead }: { propertyId: string; lead: CrmLead }) {
  const [items, setItems] = useState<CrmInteraction[] | null>(null);

  useEffect(() => {
    setItems(null);
    fetch(`/api/admin/comercial/interactions?propertyId=${propertyId}&entityType=${lead.entityType}&entityId=${lead.id}`)
      .then((r) => (r.ok ? r.json() : { interactions: [] }))
      .then((d) => setItems(d.interactions || []))
      .catch(() => setItems([]));
  }, [propertyId, lead.entityType, lead.id]);

  if (items === null) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
        <Loader2 size={14} className="animate-spin mr-2" /> Carregando histórico…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Sem histórico ainda — interações passam a ser registradas a partir da fundação do CRM.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((i) => {
        const cfg = KIND_CFG[i.kind] ?? { icon: MessageSquare, label: () => i.kind };
        const Icon = cfg.icon;
        return (
          <div key={i.id} className="flex gap-2.5 text-sm">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
              <Icon size={13} className="text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground text-[13px]">{cfg.label(i)}</p>
              {i.note && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{i.note}</p>}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {fmtBR((i.createdAt || "").slice(0, 10))}
                {i.createdAt ? ` ${String(i.createdAt).slice(11, 16)}` : ""}
                {i.actorName ? ` · ${i.actorName}` : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
