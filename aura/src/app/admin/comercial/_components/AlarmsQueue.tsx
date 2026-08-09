// Fila de alarmes de um funil: Vencidos / Hoje / Próximos, concluir em 1
// clique. Alarmes valem também para negociações FECHADAS (cobrança é
// pós-fechamento) — por isso a linha usa o entityLabel (snapshot) e clicar
// nela pode cair fora do pipeline de 60 dias.
"use client";

import {
  BellOff, BellRing, CalendarClock, Check, CircleDollarSign, Loader2,
  StickyNote, Trash2,
} from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CrmAlarm, CrmAlarmKind } from "@/types/aura";
import { S, fmtBR, todayIso } from "./shared";

export const ALARM_KIND_CFG: Record<CrmAlarmKind, { icon: React.ElementType; label: string }> = {
  follow_up: { icon: CalendarClock,    label: "Follow-up" },
  payment:   { icon: CircleDollarSign, label: "Cobrança" },
  reminder:  { icon: BellRing,         label: "Lembrete" },
  other:     { icon: StickyNote,       label: "Outro" },
};

function AlarmRow({
  alarm, overdue, busy, onDone, onDelete, onOpen,
}: {
  alarm: CrmAlarm;
  overdue: boolean;
  busy: boolean;
  onDone: (a: CrmAlarm) => void;
  onDelete: (a: CrmAlarm) => void;
  onOpen: (a: CrmAlarm) => void;
}) {
  const cfg = ALARM_KIND_CFG[alarm.kind] ?? ALARM_KIND_CFG.other;
  const Icon = cfg.icon;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      background: T.card, borderRadius: 14,
      border: `1px solid ${overdue ? "rgba(248,113,113,0.3)" : T.border}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 11, flexShrink: 0,
        background: overdue ? "rgba(248,113,113,0.12)" : T.glass2,
        color: overdue ? T.red : T.muted,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} />
      </div>
      <button onClick={() => onOpen(alarm)}
        style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {alarm.title}
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {cfg.label} · {alarm.entityLabel} · {fmtBR(alarm.dueAt)}{alarm.dueTime ? ` ${alarm.dueTime}` : ""}
        </div>
        {alarm.note && (
          <div style={{ fontSize: 11, color: T.muted2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {alarm.note}
          </div>
        )}
      </button>
      <button disabled={busy} onClick={() => onDone(alarm)}
        title={alarm.virtual ? "Marcar parcela como paga" : "Concluir"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 12px",
          borderRadius: 10, background: T.emeraldBg, border: `1px solid ${T.emeraldBorder}`,
          color: T.emerald, fontSize: 11, fontWeight: 800, cursor: "pointer",
          fontFamily: "inherit", flexShrink: 0, opacity: busy ? 0.5 : 1,
        }}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        {alarm.virtual ? "Recebida" : "Concluir"}
      </button>
      {/* Parcela vencida (virtual) não se exclui pela fila — só na gestão do evento */}
      {!alarm.virtual && (
        <button disabled={busy} onClick={() => onDelete(alarm)}
          title="Excluir"
          style={{
            padding: 6, borderRadius: 8, background: "none", border: "none",
            color: T.muted, cursor: "pointer", flexShrink: 0, opacity: busy ? 0.5 : 1,
          }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

export function AlarmsQueue({
  alarms, busyId, onDone, onDelete, onOpen,
}: {
  alarms: CrmAlarm[];
  busyId: string | null;
  onDone: (a: CrmAlarm) => void;
  onDelete: (a: CrmAlarm) => void;
  /** Abre o lead do alarme (drawer se estiver no pipeline; senão a origem). */
  onOpen: (a: CrmAlarm) => void;
}) {
  const t = todayIso();
  const groups = [
    { id: "overdue", label: "Vencidos", accent: T.red,   rows: alarms.filter((a) => a.dueAt < t) },
    { id: "today",   label: "Hoje",     accent: T.amber, rows: alarms.filter((a) => a.dueAt === t) },
    { id: "next",    label: "Próximos", accent: T.muted, rows: alarms.filter((a) => a.dueAt > t) },
  ].filter((g) => g.rows.length > 0);

  if (groups.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "64px 0", gap: 8, color: T.muted,
      }}>
        <BellOff size={28} style={{ opacity: 0.4 }} />
        <p style={{ fontSize: 13, margin: 0 }}>Nenhum alarme aberto — crie no drawer do lead.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {groups.map((g) => (
        <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ ...S.label, color: g.accent, margin: 0 }}>
            {g.label} ({g.rows.length})
          </p>
          {g.rows.map((a) => (
            <AlarmRow key={a.id} alarm={a} overdue={a.dueAt < t} busy={busyId === a.id}
              onDone={onDone} onDelete={onDelete} onOpen={onOpen} />
          ))}
        </div>
      ))}
    </div>
  );
}
