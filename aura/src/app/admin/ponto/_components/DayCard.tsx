"use client";

// src/app/admin/ponto/_components/DayCard.tsx
//
// Um dia de trabalho. Cada horário é clicável e abre a correção daquela batida —
// é o gesto que a pessoa procura quando olha para um número errado.
//
// As marcas importam mais do que parecem: uma hora DIGITADA (`manual`) e uma
// hora CORRIGIDA não valem o mesmo que uma hora registrada na hora, e é
// justamente essa distinção que dá credibilidade às outras.
import React from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { Card, Pill, T, alpha } from "@/components/aura";
import { elapsedMinutes, formatDayLabel, formatMinutes, localHM } from "@/lib/timeclock";
import type { TimeClockDay, TimeClockEvent, WorkSession } from "@/types/aura";

function PunchChip({ event, onEdit }: { event: TimeClockEvent; onEdit: (e: TimeClockEvent) => void }) {
  const edited = !!event.originalTs;
  const manual = event.source === "manual";
  const tone = manual ? T.amber : edited ? T.blue : T.text;

  return (
    <button
      onClick={() => onEdit(event)}
      className="ak-press"
      title={[
        manual ? "Lançada à mão" : event.source === "rep" ? "Importada do relógio" : "Registrada no Aura",
        edited ? `Original: ${localHM(event.originalTs!)}` : null,
        event.note || null,
      ].filter(Boolean).join(" · ")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, minHeight: 32, padding: "4px 8px",
        borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
        fontSize: 14, fontWeight: 800, fontVariantNumeric: "tabular-nums",
        background: manual || edited ? alpha(tone, 10) : "transparent",
        border: `1px solid ${manual || edited ? alpha(tone, 25) : "transparent"}`,
        color: tone,
      }}
    >
      {localHM(event.ts)}
      {(manual || edited) && <Pencil size={11} style={{ opacity: 0.7 }} />}
    </button>
  );
}

function SessionRow({
  session, onEdit, onFix,
}: {
  session: WorkSession;
  onEdit: (e: TimeClockEvent) => void;
  onFix: (session: WorkSession) => void;
}) {
  const open = session.status === "open";
  const dangling = session.status === "dangling";
  const orphan = session.status === "orphanOut";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 40 }}>
      {orphan ? (
        <>
          <span style={{ fontSize: 13, color: T.muted, fontWeight: 700 }}>sem entrada</span>
          <span style={{ color: T.muted2 }}>→</span>
          <PunchChip event={session.start} onEdit={onEdit} />
        </>
      ) : (
        <>
          <PunchChip event={session.start} onEdit={onEdit} />
          <span style={{ color: T.muted2 }}>→</span>
          {session.end
            ? <PunchChip event={session.end} onEdit={onEdit} />
            : <span style={{ fontSize: 13, color: dangling ? T.amber : T.muted, fontWeight: 700 }}>
                {dangling ? "sem saída" : "em andamento"}
              </span>}
        </>
      )}

      <span style={{ flex: 1 }} />

      {session.status === "closed" && (
        <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" }}>
          {formatMinutes(session.minutes)}
        </span>
      )}
      {open && <Pill tone="green" dot label={`${formatMinutes(elapsedMinutes(session))} em curso`} />}
      {(dangling || orphan) && (
        <button
          onClick={() => onFix(session)}
          className="ak-press"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, minHeight: 32, padding: "0 10px",
            borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800,
            background: T.amberBg, border: `1px solid ${T.amberBorder}`, color: T.amber,
          }}
        >
          <AlertTriangle size={12} />
          {dangling ? "Lançar saída" : "Lançar entrada"}
        </button>
      )}
    </div>
  );
}

export function DayCard({
  day, onEdit, onFix,
}: {
  day: TimeClockDay;
  onEdit: (e: TimeClockEvent) => void;
  onFix: (session: WorkSession) => void;
}) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.text, textTransform: "capitalize" }}>
          {formatDayLabel(day.date)}
        </span>
        {day.hasPending && <Pill tone="amber" label="pendente" />}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 15, fontWeight: 900, color: day.minutes > 0 ? T.text : T.muted2, fontVariantNumeric: "tabular-nums" }}>
          {formatMinutes(day.minutes)}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
        {day.sessions.map((session, i) => (
          <SessionRow key={session.start.id + i} session={session} onEdit={onEdit} onFix={onFix} />
        ))}
      </div>
    </Card>
  );
}
