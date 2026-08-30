"use client";

// Histórico da estadia — o extrato do que aconteceu, de quem fez e por onde.
//
// Recolhido por padrão: a ficha já é longa, e o histórico é a coisa que se
// procura, não a que se lê de passagem. Só busca quando abre (a rota junta dez
// tabelas — não vale pagar isso em toda visita à ficha).
import React from "react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BedDouble, Bike, Car, ChevronDown, ChevronUp, Coffee, ConciergeBell, DoorOpen, FileSignature,
  FilePlus2, History, KeyRound, LogIn, LogOut, PackageSearch, Receipt, RotateCcw, Smartphone,
  Sparkles, Star, Tag, Undo2, User, UtensilsCrossed, Wrench,
} from "lucide-react";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { Button, Card, Spinner } from "@/components/aura";
import type { StayTimelineChannel, StayTimelineEvent, StayTimelineKind } from "@/services/stay-timeline-service";

const KIND: Record<StayTimelineKind, { icon: React.ElementType; tone: Tone }> = {
  created:       { icon: FilePlus2,        tone: "neutral" },
  precheckin:    { icon: FileSignature,    tone: "violet" },
  checkin:       { icon: LogIn,            tone: "green" },
  checkout:      { icon: LogOut,           tone: "orange" },
  folio:         { icon: Receipt,          tone: "brand" },
  folio_out:     { icon: Undo2,            tone: "red" },
  bill_closed:   { icon: Receipt,          tone: "green" },
  bill_reopened: { icon: RotateCcw,        tone: "amber" },
  lodging:       { icon: BedDouble,        tone: "brand" },
  housekeeping:  { icon: Sparkles,         tone: "blue" },
  structure:     { icon: Bike,             tone: "emerald" },
  concierge:     { icon: ConciergeBell,    tone: "amber" },
  survey:        { icon: Star,             tone: "rose" },
  breakfast:     { icon: Coffee,           tone: "amber" },
  maintenance:   { icon: Wrench,           tone: "orange" },
  parking:       { icon: Car,              tone: "neutral" },
  fb:            { icon: UtensilsCrossed,  tone: "rose" },
  key:           { icon: KeyRound,         tone: "amber" },
  loan:          { icon: PackageSearch,    tone: "amber" },
  lost:          { icon: PackageSearch,    tone: "red" },
  guest:         { icon: User,             tone: "violet" },
  quote:         { icon: Tag,              tone: "brand" },
  update:        { icon: DoorOpen,         tone: "neutral" },
};

const CHANNEL: Record<StayTimelineChannel, { label: string; icon: React.ElementType }> = {
  portal: { label: "portal", icon: Smartphone },
  app:    { label: "app",    icon: Smartphone },
  admin:  { label: "balcão", icon: User },
  system: { label: "sistema", icon: History },
};

/** Quantos aparecem antes do "ver tudo". */
const PREVIEW = 10;

export function StayTimeline({ propertyId, stayId }: { propertyId?: string; stayId?: string }) {
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState<StayTimelineEvent[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [all, setAll] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!propertyId || !stayId) return;
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/stays/timeline?${new URLSearchParams({ propertyId, stayId })}`);
      if (!res.ok) throw new Error("falhou");
      const data = await res.json();
      setEvents((data?.events ?? []) as StayTimelineEvent[]);
    } catch {
      setEvents([]);
      setFailed(true);
    }
  }, [propertyId, stayId]);

  React.useEffect(() => {
    if (open && events === null) void load();
  }, [open, events, load]);

  const shown = events ? (all ? events : events.slice(0, PREVIEW)) : [];
  const rest = events ? events.length - shown.length : 0;

  return (
    <Card
      header={{
        icon: History,
        tone: "neutral",
        title: "Histórico",
        sub: events ? `${events.length} registro${events.length === 1 ? "" : "s"}` : "tudo que aconteceu nesta estadia",
        aside: (
          <Button
            size="sm"
            variant="ghost"
            iconRight={open ? ChevronUp : ChevronDown}
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
          >
            {open ? "Recolher" : "Abrir"}
          </Button>
        ),
      }}
    >
      {!open ? null : events === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner /></div>
      ) : failed ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: T.muted }}>Não consegui carregar o histórico.</span>
          <Button size="sm" variant="secondary" onClick={() => { setEvents(null); }}>Tentar de novo</Button>
        </div>
      ) : events.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: T.muted2, fontStyle: "italic" }}>
          Nada registrado ainda nesta estadia.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {shown.map((e, i) => (
            <Row key={e.id} event={e} first={i === 0} last={i === shown.length - 1} prev={shown[i - 1]} />
          ))}
          {rest > 0 && (
            <div style={{ paddingTop: 10 }}>
              <Button size="sm" variant="secondary" fullWidth onClick={() => setAll(true)}>
                Ver tudo (+{rest})
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Row({ event, first, last, prev }: { event: StayTimelineEvent; first: boolean; last: boolean; prev?: StayTimelineEvent }) {
  const cfg = KIND[event.kind] ?? KIND.update;
  const t = toneOf(cfg.tone);
  const Icon = cfg.icon;
  const at = new Date(event.at);
  const ch = event.channel ? CHANNEL[event.channel] : null;
  // Data só quando muda: uma estadia rende dezenas de linhas no mesmo dia.
  const newDay = !prev || !isSameDay(new Date(prev.at), at);

  return (
    <>
      {newDay && (
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: T.muted2, padding: first ? "0 0 8px" : "14px 0 8px" }}>
          {format(at, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
        {/* Trilho: ícone + linha até o próximo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 9, display: "inline-flex", alignItems: "center",
            justifyContent: "center", background: t.bg, border: `1px solid ${t.border}`, color: t.color,
          }}>
            <Icon size={12} />
          </span>
          {!last && <span style={{ flex: 1, width: 1, background: T.border, marginTop: 2, minHeight: 8 }} />}
        </div>
        <div style={{ minWidth: 0, flex: 1, paddingBottom: last ? 0 : 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>{event.title}</div>
          {event.detail && event.detail !== event.title && (
            <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.45, marginTop: 1, overflowWrap: "anywhere" }}>{event.detail}</div>
          )}
          <div style={{ fontSize: 10.5, color: T.muted2, marginTop: 2, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{format(at, "HH:mm")}</span>
            {event.actor && <>· <span style={{ color: T.muted }}>{event.actor}</span></>}
            {ch && <>· <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><ch.icon size={9} />{ch.label}</span></>}
          </div>
        </div>
      </div>
    </>
  );
}
