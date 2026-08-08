// Fila de follow-ups: o "o que fazer hoje" do comercial — leads ativos dos
// dois funis com contato atrasado/para hoje ou prazo estourado.
"use client";

import { CalendarClock, CalendarDays, Check, Heart, Loader2, Phone } from "lucide-react";
import { CrmLead } from "@/types/aura";
import { fmtBR, leadAlert, money, todayIso } from "./shared";

export function FollowUpQueue({ leads, busyId, onOpen, onQuickContact }: {
  leads: CrmLead[];
  busyId: string | null;
  onOpen: (l: CrmLead) => void;
  onQuickContact: (l: CrmLead) => void;
}) {
  const t = todayIso();
  const due = leads
    .filter((l) => leadAlert(l) !== null)
    .sort((a, b) => (a.followUpAt ?? a.expiresAt ?? "").localeCompare(b.followUpAt ?? b.expiresAt ?? ""));

  if (due.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-14 text-center text-muted-foreground">
        <Check size={32} className="mx-auto mb-3 text-emerald-500" />
        <p>Nenhum follow-up pendente — fila em dia. 🎉</p>
      </div>
    );
  }

  const daysLate = (l: CrmLead) => {
    const ref = l.followUpAt ?? l.expiresAt;
    if (!ref) return 0;
    return Math.round((new Date(t + "T12:00").getTime() - new Date(ref + "T12:00").getTime()) / 86400000);
  };

  return (
    <div className="space-y-2 max-w-3xl">
      {due.map((l) => {
        const alert = leadAlert(l);
        const late = daysLate(l);
        return (
          <div key={`${l.entityType}-${l.id}`}
            className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              alert === "expired" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
            }`}>
              {l.entityType === "wedding" ? <Heart size={15} /> : <CalendarDays size={15} />}
            </div>
            <button className="flex-1 min-w-0 text-left" onClick={() => onOpen(l)}>
              <p className="font-semibold text-sm text-foreground truncate">{l.title}</p>
              <p className="text-xs text-muted-foreground">
                {alert === "expired"
                  ? <>Prazo venceu em {fmtBR(l.expiresAt)}</>
                  : late > 0
                    ? <>Follow-up atrasado {late} dia{late > 1 ? "s" : ""} (era {fmtBR(l.followUpAt)})</>
                    : <>Follow-up hoje</>}
                {" · "}{l.entityType === "wedding" ? "casamento" : "check-in"} {fmtBR(l.dateRef)}
                {l.value > 0 && <> · R$ {money(l.value)}</>}
              </p>
            </button>
            {l.phone && (
              <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                title="Abrir WhatsApp"
                className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors shrink-0">
                <Phone size={14} />
              </a>
            )}
            <button disabled={busyId === l.id} onClick={() => onQuickContact(l)}
              title="Registrar contato feito (renova os prazos)"
              className="px-3 py-2 rounded-lg text-xs font-bold bg-secondary text-foreground hover:bg-accent transition-colors shrink-0 inline-flex items-center gap-1.5 disabled:opacity-50">
              {busyId === l.id ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
              Contato feito
            </button>
          </div>
        );
      })}
    </div>
  );
}
