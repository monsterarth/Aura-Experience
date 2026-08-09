// "Fila de hoje — quem contactar": follow-ups atrasados/de hoje + alarmes e
// cobranças vencidos, mesclados num card fixo no TOPO do pipeline (UI do
// projeto de design "Aura CRM Comercial Interface"). Substituiu a antiga aba
// Follow-ups; a aba Alarmes continua existindo para gerenciar os Próximos.
"use client";

import {
  CalendarClock, CalendarDays, Check, CheckCircle2, Heart, Loader2, Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CrmAlarm, CrmLead } from "@/types/aura";
import { ALARM_KIND_CFG } from "./AlarmsQueue";
import { fmtBR, leadAlert, money, todayIso } from "./shared";

type Row = {
  key: string;
  /** Data de referência para ordenar (mais urgente primeiro). */
  ord: string;
  icon: React.ElementType;
  tile: "red" | "amber" | "orange";
  title: string;
  sub: string;
  phone?: string | null;
  actionLabel: string;
  actionIcon: React.ElementType;
  busy: boolean;
  onAction: () => void;
  onOpen: () => void;
};

const TILE_CLS: Record<Row["tile"], string> = {
  red:    "bg-red-500/10 text-red-500",
  amber:  "bg-amber-500/10 text-amber-500",
  orange: "bg-orange-500/10 text-orange-500",
};

export function TodayQueue({
  leads, alarms, busyId, alarmBusyId, onOpenLead, onOpenAlarm, onContact, onAlarmDone,
}: {
  leads: CrmLead[];
  alarms: CrmAlarm[];
  busyId: string | null;
  alarmBusyId: string | null;
  onOpenLead: (l: CrmLead) => void;
  onOpenAlarm: (a: CrmAlarm) => void;
  /** "Contato feito" — renova os prazos do lead. */
  onContact: (l: CrmLead) => void;
  /** Concluir alarme (virtual de parcela = marcar recebida). */
  onAlarmDone: (a: CrmAlarm) => void;
}) {
  const t = todayIso();

  const daysLate = (ref: string) =>
    Math.round((new Date(`${t}T12:00`).getTime() - new Date(`${ref}T12:00`).getTime()) / 86400000);

  const rows: Row[] = [];

  for (const l of leads) {
    const alert = leadAlert(l);
    if (!alert) continue;
    const ref = (alert === "expired" ? l.expiresAt : l.followUpAt) ?? t;
    const late = daysLate(ref);
    const context = `${l.entityType === "wedding" ? "casamento" : "check-in"} ${fmtBR(l.dateRef)}${l.value > 0 ? ` · R$ ${money(l.value)}` : ""}`;
    rows.push({
      key: `lead-${l.id}`,
      ord: ref,
      icon: l.entityType === "wedding" ? Heart : CalendarDays,
      tile: alert === "expired" ? "red" : "amber",
      title: l.title,
      sub: `${alert === "expired"
        ? `Prazo venceu em ${fmtBR(l.expiresAt)}`
        : late > 0
          ? `Follow-up atrasado ${late} dia${late > 1 ? "s" : ""} (era ${fmtBR(l.followUpAt)})`
          : "Follow-up hoje"} · ${context}`,
      phone: l.phone,
      actionLabel: "Contato feito",
      actionIcon: CalendarClock,
      busy: busyId === l.id,
      onAction: () => onContact(l),
      onOpen: () => onOpenLead(l),
    });
  }

  for (const a of alarms) {
    if (a.dueAt > t) continue;   // Próximos ficam na aba Alarmes
    const cfg = ALARM_KIND_CFG[a.kind] ?? ALARM_KIND_CFG.other;
    const overdue = a.dueAt < t;
    rows.push({
      key: `alarm-${a.id}`,
      ord: a.dueAt,
      icon: cfg.icon,
      tile: overdue ? "red" : a.kind === "payment" ? "orange" : "amber",
      title: a.title,
      sub: `${cfg.label} · ${a.entityLabel} · ${overdue ? "venceu" : "vence"} ${fmtBR(a.dueAt)}${a.dueTime ? ` ${a.dueTime}` : ""}`,
      // Telefone vem do lead correspondente quando ele ainda está no pipeline
      phone: leads.find((l) => l.id === a.entityId)?.phone,
      actionLabel: a.virtual ? "Recebida" : "Concluir",
      actionIcon: Check,
      busy: alarmBusyId === a.id,
      onAction: () => onAlarmDone(a),
      onOpen: () => onOpenAlarm(a),
    });
  }

  rows.sort((a, b) => a.ord.localeCompare(b.ord));

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Fila de hoje — quem contactar
        </span>
        {rows.length > 0 && (
          <span className="min-w-[18px] h-[18px] rounded-full bg-red-500/15 border border-red-500/30 text-red-500 text-[10px] font-black inline-flex items-center justify-center px-1.5">
            {rows.length}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground/60">follow-ups e cobranças pendentes</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
          <CheckCircle2 size={24} className="text-emerald-500" />
          Nenhum follow-up pendente — fila em dia.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const Icon = r.icon;
            const ActionIcon = r.actionIcon;
            return (
              <div key={r.key}
                className="flex items-center gap-3 bg-secondary/60 border border-border rounded-xl px-3.5 py-2.5">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", TILE_CLS[r.tile])}>
                  <Icon size={15} />
                </div>
                <button className="flex-1 min-w-0 text-left" onClick={r.onOpen}>
                  <p className="font-semibold text-sm text-foreground truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.sub}</p>
                </button>
                {r.phone && (
                  <a href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                    title="Abrir WhatsApp"
                    className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 hover:bg-emerald-500/20 transition-colors shrink-0">
                    <Phone size={14} />
                  </a>
                )}
                <button disabled={r.busy} onClick={r.onAction}
                  className="px-3 py-2 rounded-lg text-[11px] font-bold bg-secondary border border-border text-foreground hover:bg-accent transition-colors shrink-0 inline-flex items-center gap-1.5 disabled:opacity-50">
                  {r.busy ? <Loader2 size={13} className="animate-spin" /> : <ActionIcon size={13} />}
                  {r.actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
