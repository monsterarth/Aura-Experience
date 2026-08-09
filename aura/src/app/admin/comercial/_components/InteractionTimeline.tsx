// Timeline do lead: o histórico de crm_interactions legível — cada contato,
// troca de etapa, envio, conversão e perda em ordem cronológica inversa.
"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight, BadgeCheck, BellRing, CalendarClock, CircleDollarSign, FilePlus2,
  Loader2, MessageSquare, Pencil, Send, UserCheck, XCircle, Link2,
} from "lucide-react";
import { T } from "@/lib/admin-tokens";
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 0", color: T.muted, fontSize: 12 }}>
        <Loader2 size={14} className="animate-spin" style={{ marginRight: 8 }} /> Carregando histórico…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p style={{ fontSize: 12, color: T.muted, padding: "16px 0", textAlign: "center", margin: 0 }}>
        Sem histórico ainda — interações passam a ser registradas a partir da fundação do CRM.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((i) => {
        const cfg = KIND_CFG[i.kind] ?? { icon: MessageSquare, label: () => i.kind };
        const Icon = cfg.icon;
        return (
          <div key={i.id} style={{ display: "flex", gap: 12 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 10, background: T.glass2,
              border: `1px solid ${T.border}`, display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0, color: "rgba(238,240,248,0.6)", marginTop: 2,
            }}>
              <Icon size={13} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: T.text, margin: 0 }}>{cfg.label(i)}</p>
              {i.note && (
                <p style={{ fontSize: 11.5, color: "rgba(238,240,248,0.5)", whiteSpace: "pre-wrap", margin: "1px 0 0" }}>
                  {i.note}
                </p>
              )}
              <p style={{ fontSize: 10, color: T.muted2, margin: "2px 0 0" }}>
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
