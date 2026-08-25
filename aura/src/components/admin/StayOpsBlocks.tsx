"use client";

// Blocos operacionais compartilhados entre o StayDetailsModal (acesso rápido) e a
// Ficha Completa (/admin/stays/[stayId]) — origem da reserva e pendências. Um só
// componente nos dois lugares é o que mantém as telas coerentes.
import React, { useEffect, useState } from "react";
import {
  Bot, ConciergeBell, ExternalLink, Gift, KeyRound, Package, PawPrint, Sparkles,
} from "lucide-react";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { Card, Pill, SectionLabel, Spinner } from "@/components/aura";
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

// ── Pendências & operação ────────────────────────────────────────────────────

const KEY_META: Record<string, { label: string; tone: Tone }> = {
  reception: { label: "Chave na recepção", tone: "green" },
  awaiting_conference: { label: "Chave aguardando conferência", tone: "amber" },
  found: { label: "Chave localizada", tone: "green" },
  missing: { label: "Chave extraviada", tone: "red" },
  returned: { label: "Chave devolvida", tone: "green" },
  charged: { label: "Chave cobrada", tone: "blue" },
};

const LOANED_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "A devolver", tone: "amber" },
  returned: { label: "Devolvidos", tone: "green" },
  missing: { label: "Não devolvidos", tone: "red" },
  charged: { label: "Cobrados", tone: "blue" },
};

const LOST_RESOLUTION: Record<string, string> = {
  returned: "devolvido ao hóspede",
  discarded: "descartado",
  stored: "guardado na recepção",
};

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
 * Card de pendências operacionais da estadia: chave, objetos emprestados, objetos
 * esquecidos, pedidos de governança e concierge em aberto. Linhas só existem
 * quando há o que mostrar — sem pendência, o card confirma isso numa linha só.
 */
export function StayPendingCard({ propertyId, stay, active = true }: { propertyId: string; stay: Partial<Stay>; active?: boolean }) {
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

  const openConcierge = (concierge ?? []).filter(r => r.status === "pending" || r.status === "in_progress");
  const rows: React.ReactNode[] = [];

  const key = stay.keyStatus ? KEY_META[stay.keyStatus] : null;
  if (key) {
    rows.push(<Row key="key" icon={<KeyRound size={13} />} tone={key.tone} title={key.label}
      sub={stay.keyStatusAt ? new Date(stay.keyStatusAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : undefined}
      aside={<Pill tone={key.tone} dot label={key.tone === "green" || key.tone === "blue" ? "ok" : "pendente"} />} />);
  } else if (stay.keyLocation === "cabin" && stay.status === "finished") {
    rows.push(<Row key="key" icon={<KeyRound size={13} />} tone="amber" title="Chave ficou na acomodação" sub="camareira confere no checkout" aside={<Pill tone="amber" dot label="pendente" />} />);
  }

  if (stay.loanedItems) {
    const lm = LOANED_META[stay.loanedItemsStatus ?? (stay.loanedItemsChecked ? "returned" : "pending")] ?? LOANED_META.pending;
    rows.push(<Row key="loaned" icon={<Package size={13} />} tone={lm.tone} title="Objetos emprestados" sub={stay.loanedItems} aside={<Pill tone={lm.tone} dot label={lm.label} />} />);
  }

  if (stay.lostItemsDescription) {
    const resolved = stay.lostItemsResolution ? LOST_RESOLUTION[stay.lostItemsResolution] : null;
    rows.push(<Row key="lost" icon={<Package size={13} />} tone={resolved ? "green" : "amber"} title="Objeto esquecido" sub={`${stay.lostItemsDescription}${resolved ? ` — ${resolved}` : ""}`} aside={<Pill tone={resolved ? "green" : "amber"} dot label={resolved ? "resolvido" : "em aberto"} />} />);
  }

  const hk = (stay.housekeepingItems ?? []).filter(i => i.label?.trim());
  if (hk.length > 0) {
    rows.push(<Row key="hk" icon={<Sparkles size={13} />} tone="violet" title="Pedidos de governança" sub={hk.map(i => i.label).join(" · ")} />);
  }

  for (const r of openConcierge) {
    rows.push(<Row key={`c-${r.id}`} icon={<Gift size={13} />} tone={r.urgent ? "red" : "blue"}
      title={<>{r.itemName}{r.quantity > 1 ? ` ×${r.quantity}` : ""}</>}
      sub={r.status === "in_progress" ? "em atendimento" : "aguardando atendimento"}
      aside={r.urgent ? <Pill tone="red" dot label="urgente" /> : <Pill tone="blue" dot label="aberto" />} />);
  }

  return (
    <Card
      header={{
        icon: ConciergeBell,
        tone: rows.length > 0 ? "amber" : "green",
        title: "Pendências & operação",
        sub: "chave · empréstimos · esquecidos · governança · concierge",
        aside: concierge === null && active && stay.id
          ? <Spinner size={13} color={T.muted} />
          : (concierge ?? []).length > 0
            ? <a href="/admin/concierge" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: T.brandText, textDecoration: "none" }}>Concierge <ExternalLink size={10} /></a>
            : undefined,
      }}
    >
      {rows.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: T.greenBg, border: `1px solid ${T.greenBorder}`, color: T.green, fontSize: 12, fontWeight: 700 }}>
          <PawPrint size={13} style={{ display: "none" }} />
          Sem pendências operacionais.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows}</div>
      )}
    </Card>
  );
}
