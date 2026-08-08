// Fila de alarmes de um funil: Vencidos / Hoje / Próximos, concluir em 1
// clique. Alarmes valem também para negociações FECHADAS (cobrança é
// pós-fechamento) — por isso a linha usa o entityLabel (snapshot) e clicar
// nela pode cair fora do pipeline de 60 dias.
"use client";

import {
  BellOff, BellRing, CalendarClock, Check, CircleDollarSign, Loader2,
  StickyNote, Trash2,
} from "lucide-react";
import { CrmAlarm, CrmAlarmKind } from "@/types/aura";
import { cn } from "@/lib/utils";
import { fmtBR, todayIso } from "./shared";

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
    <div className={cn(
      "flex items-center gap-3 bg-card border rounded-2xl px-4 py-3",
      overdue ? "border-red-500/40" : "border-border"
    )}>
      <div className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
        overdue ? "bg-red-500/10 text-red-500" : "bg-secondary text-muted-foreground"
      )}>
        <Icon size={16} />
      </div>
      <button className="flex-1 min-w-0 text-left" onClick={() => onOpen(alarm)}>
        <p className="font-semibold text-sm text-foreground truncate">{alarm.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {cfg.label} · {alarm.entityLabel} · {fmtBR(alarm.dueAt)}{alarm.dueTime ? ` ${alarm.dueTime}` : ""}
        </p>
        {alarm.note && <p className="text-xs text-muted-foreground truncate">{alarm.note}</p>}
      </button>
      <button disabled={busy} onClick={() => onDone(alarm)}
        title={alarm.virtual ? "Marcar parcela como paga" : "Concluir"}
        className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-500/15 text-emerald-600 rounded-lg px-2.5 py-1.5 hover:bg-emerald-500/25 transition-colors shrink-0 disabled:opacity-50">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        <span className="hidden sm:inline">{alarm.virtual ? "Recebida" : "Concluir"}</span>
      </button>
      {/* Parcela vencida (virtual) não se exclui pela fila — só na gestão do evento */}
      {!alarm.virtual && (
        <button disabled={busy} onClick={() => onDelete(alarm)}
          title="Excluir"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0 disabled:opacity-50">
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
    { id: "overdue", label: "Vencidos", accent: "text-red-500",   rows: alarms.filter((a) => a.dueAt < t) },
    { id: "today",   label: "Hoje",     accent: "text-amber-500", rows: alarms.filter((a) => a.dueAt === t) },
    { id: "next",    label: "Próximos", accent: "text-muted-foreground", rows: alarms.filter((a) => a.dueAt > t) },
  ].filter((g) => g.rows.length > 0);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <BellOff size={28} className="opacity-40" />
        <p className="text-sm">Nenhum alarme aberto — crie no drawer do lead.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.id} className="space-y-2">
          <p className={cn("text-[10px] font-black uppercase tracking-widest", g.accent)}>
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
