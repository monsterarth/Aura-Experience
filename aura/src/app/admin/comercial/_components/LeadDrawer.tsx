// Painel de detalhe do lead no hub: contato, prazos, ações comerciais e a
// timeline do histórico. As ações reusam os endpoints existentes de cada funil.
"use client";

import { useState } from "react";
import {
  CalendarClock, CalendarDays, ExternalLink, Heart, Loader2, Mail,
  MessageSquare, Phone, Send, Tag, X, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CrmChannel, CrmLead } from "@/types/aura";
import { InteractionTimeline } from "./InteractionTimeline";
import { QUOTE_STAGES, WEDDING_STAGES, ACTIVE_STAGES, fmtBR, money } from "./shared";

export function LeadDrawer({
  propertyId, lead, channels, busy,
  onClose, onFollowUp, onAddNote, onMoveStage, onMarkLost, onWin, onOpenOrigin,
}: {
  propertyId: string;
  lead: CrmLead;
  channels: CrmChannel[];
  busy: boolean;
  onClose: () => void;
  onFollowUp: (note: string) => Promise<void>;
  onAddNote: (note: string) => Promise<void>;
  onMoveStage: (stage: string) => Promise<void>;
  onMarkLost: () => void;
  onWin: () => void;
  onOpenOrigin: () => void;
}) {
  const [note, setNote] = useState("");
  const [noteMode, setNoteMode] = useState<"follow_up" | "note">("follow_up");
  const [sending, setSending] = useState(false);
  // Timeline recarrega quando uma ação nossa muda o histórico
  const [timelineKey, setTimelineKey] = useState(0);

  const isQuote = lead.entityType === "quote";
  const stages = isQuote ? QUOTE_STAGES : WEDDING_STAGES;
  const active = ACTIVE_STAGES.has(lead.stage);
  const stageDef = stages.find((s) => s.id === lead.stage);
  const channelLabel = lead.source
    ? channels.find((c) => c.id === lead.source)?.label ?? lead.source : null;

  const submitNote = async () => {
    if (!note.trim() && noteMode === "note") return;
    setSending(true);
    try {
      if (noteMode === "follow_up") await onFollowUp(note.trim());
      else await onAddNote(note.trim());
      setNote("");
      setTimelineKey((k) => k + 1);
    } finally {
      setSending(false);
    }
  };

  // Etapas intermediárias (won/lost têm fluxos próprios: onWin / onMarkLost)
  const moveTargets = stages.filter((s) =>
    s.id !== lead.stage && !["won", "lost", "completed", "cancelled"].includes(s.id)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background w-full max-w-lg h-full flex flex-col border-l border-border">
        {/* Header */}
        <div className="p-5 border-b border-border space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                {isQuote ? <><CalendarDays size={11} /> Orçamento de reserva</> : <><Heart size={11} /> Casamento</>}
              </p>
              <h2 className="text-xl font-black text-foreground truncate">{lead.title}</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground shrink-0">
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {stageDef && (
              <span className="inline-flex items-center gap-1.5 font-bold text-foreground bg-secondary rounded-full px-2.5 py-1">
                <span className={`w-2 h-2 rounded-full ${stageDef.dot}`} /> {stageDef.label}
              </span>
            )}
            {lead.value > 0 && (
              <span className="font-black text-foreground">
                {lead.valueApproximate ? "a partir de " : ""}R$ {money(lead.value)}
              </span>
            )}
            {channelLabel && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Tag size={11} /> {channelLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span><CalendarDays size={11} className="inline mr-1" />{isQuote ? "Check-in" : "Casamento"}: <b className="text-foreground">{fmtBR(lead.dateRef)}</b></span>
            {active && lead.followUpAt && <span><CalendarClock size={11} className="inline mr-1" />Follow-up: {fmtBR(lead.followUpAt)}</span>}
            {active && lead.expiresAt && <span>Validade: {fmtBR(lead.expiresAt)}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {lead.phone && (
              <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-lg px-2.5 py-1.5 hover:bg-emerald-200 transition-colors">
                <Phone size={12} /> WhatsApp
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold bg-secondary text-foreground rounded-lg px-2.5 py-1.5 hover:bg-accent transition-colors">
                <Mail size={12} /> {lead.email}
              </a>
            )}
            <button onClick={onOpenOrigin}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-secondary text-foreground rounded-lg px-2.5 py-1.5 hover:bg-accent transition-colors">
              <ExternalLink size={12} /> {isQuote ? "Abrir no Tarifário" : "Abrir em Casamentos"}
            </button>
          </div>
        </div>

        {/* Ações */}
        {active && (
          <div className="p-5 border-b border-border space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              {moveTargets.map((s) => (
                <button key={s.id} disabled={busy} onClick={() => onMoveStage(s.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-card text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                  → {s.label}
                </button>
              ))}
              <button disabled={busy} onClick={onWin}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 transition-colors disabled:opacity-50">
                ✓ {isQuote ? "Ganhou" : "Confirmou"}
              </button>
              <button disabled={busy} onClick={onMarkLost}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50 inline-flex items-center gap-1">
                <XCircle size={12} /> Perdeu
              </button>
            </div>

            {/* Registrar contato / nota */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1 p-1 bg-secondary rounded-xl">
                <button onClick={() => setNoteMode("follow_up")}
                  className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    noteMode === "follow_up" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}>
                  Contato (renova prazos)
                </button>
                <button onClick={() => setNoteMode("note")}
                  className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    noteMode === "note" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}>
                  Só nota
                </button>
              </div>
              <div className="flex gap-2">
                <input className="field-input flex-1"
                  placeholder={noteMode === "follow_up" ? "O que ficou combinado? (opcional)" : "Anotação interna"}
                  value={note} onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitNote()} />
                <Button size="sm" onClick={submitNote}
                  disabled={sending || (noteMode === "note" && !note.trim())}>
                  {sending ? <Loader2 size={13} className="animate-spin" /> :
                    noteMode === "follow_up" ? <Send size={13} /> : <MessageSquare size={13} />}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Histórico</p>
          <InteractionTimeline key={timelineKey} propertyId={propertyId} lead={lead} />
        </div>
      </div>
    </div>
  );
}
