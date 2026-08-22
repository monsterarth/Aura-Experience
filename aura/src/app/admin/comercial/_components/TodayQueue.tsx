// "Fila de hoje — quem contactar": follow-ups atrasados/de hoje + alarmes e
// cobranças vencidos, mesclados num card fixo no TOPO do pipeline (UI do
// projeto de design "Aura CRM Comercial Interface"). Substituiu a antiga aba
// Follow-ups; a aba Alarmes continua existindo para gerenciar os Próximos.
"use client";

import {
  CalendarClock, CalendarDays, Check, CheckCircle2, Heart, Loader2, Phone,
} from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CrmAlarm, CrmLead } from "@/types/aura";
import { ALARM_KIND_CFG } from "./AlarmsQueue";
import { S, fmtBR, leadAlert, money, todayIso } from "./shared";

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

const TILE: Record<Row["tile"], { bg: string; fg: string }> = {
  red:    { bg: T.redBg, fg: T.red },
  amber:  { bg: T.amberBg,  fg: T.amber },
  orange: { bg: T.orangeBg,  fg: T.orange },
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
    <div style={{ ...S.card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={S.label}>Fila de hoje — quem contactar</span>
        {rows.length > 0 && (
          <span style={{
            minWidth: 18, height: 18, borderRadius: 999, padding: "0 6px",
            background: T.redBg, border: `1px solid ${T.redBorder}`,
            color: T.red, fontSize: 10, fontWeight: 900,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            {rows.length}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.muted2 }}>
          follow-ups e cobranças pendentes
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{
          border: `1px dashed ${T.border2}`, borderRadius: 12, padding: 24,
          textAlign: "center", color: T.muted, fontSize: 13,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <CheckCircle2 size={26} color={T.emerald} />
          Nenhum follow-up pendente — fila em dia.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => {
            const Icon = r.icon;
            const ActionIcon = r.actionIcon;
            const tile = TILE[r.tile];
            return (
              <div key={r.key} style={{ ...S.row, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 11, background: tile.bg, color: tile.fg,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Icon size={15} />
                </div>
                <button onClick={r.onOpen}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.sub}
                  </div>
                </button>
                {r.phone && (
                  <a href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                    title="Abrir WhatsApp"
                    style={{
                      padding: 8, borderRadius: 10, background: T.emeraldBg,
                      border: `1px solid ${T.emeraldBorder}`, color: T.emerald,
                      display: "flex", flexShrink: 0,
                    }}>
                    <Phone size={14} />
                  </a>
                )}
                <button disabled={r.busy} onClick={r.onAction}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
                    borderRadius: 10, background: T.glass2, border: `1px solid ${T.border2}`,
                    fontSize: 11, fontWeight: 800, color: T.text, cursor: "pointer",
                    fontFamily: "inherit", flexShrink: 0, opacity: r.busy ? 0.5 : 1,
                  }}>
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
