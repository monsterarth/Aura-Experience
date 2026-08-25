"use client";

// Blocos operacionais compartilhados entre a ficha rápida (StayDetailsModal) e a
// Ficha Completa: origem da reserva e os pedidos em aberto.
//
// Chave, objetos emprestados e esquecidos NÃO moram aqui: eles são três dos
// quatro sinais da Conta (`folio/StayAccountPanel`), onde além de aparecerem têm
// desfecho — repetir aqui só criaria duas verdades para o mesmo fato.
import React, { useEffect, useState } from "react";
import { Bot, ConciergeBell, ExternalLink, Gift, Sparkles } from "lucide-react";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { Card, Pill, Spinner } from "@/components/aura";
import type { Stay } from "@/types/aura";

// ── Origem da reserva ────────────────────────────────────────────────────────

/** Slug de `Stay.source` → rótulo e tom. Sem source = reserva de balcão. */
export function sourceMeta(source?: string | null, internalUse?: boolean): { label: string; tone: Tone } {
  if (internalUse) return { label: "Uso da casa", tone: "amber" };
  switch ((source ?? "").toLowerCase()) {
    case "": return { label: "Balcão", tone: "neutral" };
    case "site": return { label: "Site (HBook)", tone: "brand" };
    case "booking": return { label: "Booking.com", tone: "blue" };
    case "airbnb": return { label: "Airbnb", tone: "rose" };
    case "expedia": return { label: "Expedia", tone: "amber" };
    case "decolar": return { label: "Decolar", tone: "orange" };
    default: return { label: (source as string).charAt(0).toUpperCase() + (source as string).slice(1), tone: "violet" };
  }
}

/** Pills de origem: canal (+código HUNIT no title) e aviso de automações desligadas. */
export function StayOriginPills({ stay }: { stay: Partial<Stay> }) {
  const meta = sourceMeta(stay.source, stay.internalUse);
  const isImported = !!stay.externalId;
  return (
    <>
      <Pill
        tone={meta.tone}
        dot={isImported}
        label={meta.label}
        title={isImported ? `Importada do HUNIT — reserva ${stay.externalId}` : undefined}
      />
      {!stay.internalUse && stay.automationFlags?.enabled === false && (
        <Pill tone="amber" icon={Bot} label="Sem automações" title="Comunicação automática de WhatsApp desligada para esta estadia" />
      )}
    </>
  );
}

// ── Pedidos em aberto ────────────────────────────────────────────────────────

interface ConciergeRow {
  id: string;
  itemName: string;
  quantity: number;
  status: string;
  urgent?: boolean;
  createdAt: string;
}

function Row({ icon, tone, title, sub, aside }: { icon: React.ReactNode; tone: Tone; title: React.ReactNode; sub?: React.ReactNode; aside?: React.ReactNode }) {
  const t = toneOf(tone);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, minWidth: 0 }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: t.bg, border: `1px solid ${t.border}`, color: t.color }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{sub}</div>}
      </div>
      {aside}
    </div>
  );
}

/**
 * Pedidos que a operação ainda deve ao hóspede: concierge em aberto (do portal
 * ou da camareira) e os pedidos de governança da reserva.
 */
export function StayRequestsCard({ propertyId, stay, active = true }: { propertyId: string; stay: Partial<Stay>; active?: boolean }) {
  const [concierge, setConcierge] = useState<ConciergeRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!active || !stay.id) { setConcierge(null); return; }
    setConcierge(null);
    fetch(`/api/admin/concierge/by-stay?${new URLSearchParams({ propertyId, stayId: stay.id })}`)
      .then(r => (r.ok ? r.json() : { requests: [] }))
      .then(d => { if (!cancelled) setConcierge(d?.requests ?? []); })
      .catch(() => { if (!cancelled) setConcierge([]); });
    return () => { cancelled = true; };
  }, [active, propertyId, stay.id]);

  const all = concierge ?? [];
  const open = all.filter(r => r.status === "pending" || r.status === "in_progress");
  const hk = (stay.housekeepingItems ?? []).filter(i => i.label?.trim());
  const rows: React.ReactNode[] = [];

  for (const r of open) {
    rows.push(<Row key={`c-${r.id}`} icon={<Gift size={13} />} tone={r.urgent ? "red" : "blue"}
      title={<>{r.itemName}{r.quantity > 1 ? ` ×${r.quantity}` : ""}</>}
      sub={r.status === "in_progress" ? "em atendimento" : "aguardando atendimento"}
      aside={<Pill tone={r.urgent ? "red" : "blue"} dot label={r.urgent ? "urgente" : "aberto"} />} />);
  }

  if (hk.length > 0) {
    rows.push(<Row key="hk" icon={<Sparkles size={13} />} tone="violet" title="Pedidos de governança" sub={hk.map(i => i.label).join(" · ")} />);
  }

  const delivered = all.length - open.length;

  return (
    <Card
      header={{
        icon: ConciergeBell,
        tone: rows.length > 0 ? "amber" : "green",
        title: "Pedidos em aberto",
        sub: "concierge e governança",
        aside: concierge === null && active && stay.id
          ? <Spinner size={13} color={T.muted} />
          : all.length > 0
            ? <a href="/admin/concierge" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: T.brandText, textDecoration: "none" }}>Concierge <ExternalLink size={10} /></a>
            : undefined,
      }}
    >
      {rows.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: T.greenBg, border: `1px solid ${T.greenBorder}`, color: T.green, fontSize: 12, fontWeight: 700 }}>
          Nada pendente{delivered > 0 ? ` — ${delivered} pedido${delivered > 1 ? "s" : ""} já entregue${delivered > 1 ? "s" : ""}` : ""}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows}
          {delivered > 0 && (
            <span style={{ fontSize: 11, color: T.muted2, paddingLeft: 2 }}>
              + {delivered} pedido{delivered > 1 ? "s" : ""} já entregue{delivered > 1 ? "s" : ""}.
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
