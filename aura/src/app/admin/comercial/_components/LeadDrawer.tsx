// Painel de detalhe do lead no hub: contato, prazos, ações comerciais e a
// timeline do histórico. As ações reusam os endpoints existentes de cada funil.
"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarClock, CalendarDays, ExternalLink, Heart, Loader2, Mail,
  MessageSquare, Pencil, Phone, Send, Tag, X, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseMoneyBR, moneyToInput } from "@/lib/parse-money";
import { CrmChannel, CrmLead } from "@/types/aura";
import { ClientPanel } from "./ClientPanel";
import { InteractionTimeline } from "./InteractionTimeline";
import { LeadAlarms } from "./LeadAlarms";
import { QUOTE_STAGES, WEDDING_STAGES, ACTIVE_STAGES, fmtBR, money } from "./shared";

/**
 * Input de data que só grava no blur/Enter: patch a cada change disparava no
 * meio da digitação do ano (Chrome emite change assim que a data fica
 * "completa" — ex.: ano 0002), desabilitava o campo (busy) e persistia data
 * lixo. Datas antes de 2000 são descartadas como digitação incompleta.
 */
function DatePatchField({ value, busy, onCommit }: {
  value: string | null | undefined;
  busy: boolean;
  onCommit: (v: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const syncedTo = useRef(value ?? "");
  useEffect(() => {
    if (syncedTo.current !== (value ?? "")) {
      syncedTo.current = value ?? "";
      setDraft(value ?? "");
    }
  }, [value]);

  const commit = () => {
    if (draft && draft < "2000-01-01") { setDraft(value ?? ""); return; }
    if ((draft || null) !== (value || null)) onCommit(draft || null);
  };

  return (
    <input type="date" className="field-input" value={draft} disabled={busy}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()} />
  );
}

/**
 * Seção "Negociação" (só orçamentos): valor negociado editável inline —
 * recepção pode mexer SEM aval de gerente, o registro fica na timeline
 * (value_change) e na auditoria — mais canal e prazos.
 * Componente no topo do módulo de propósito: definido dentro do render
 * perderia o foco a cada tecla (pegadinha já vivida no form de casamentos).
 */
function NegotiationSection({
  lead, channels, busy, onPatch,
}: {
  lead: CrmLead;
  channels: CrmChannel[];
  busy: boolean;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [editingValue, setEditingValue] = useState(false);
  const [valueStr, setValueStr] = useState("");

  const startEdit = () => {
    // Prefill em formato BR (vírgula) — prefill com ponto + parser BR era o
    // bug de 10x/100x pego na revisão.
    setValueStr(lead.negotiatedValue ? moneyToInput(lead.negotiatedValue)
      : lead.value > 0 ? moneyToInput(lead.value) : "");
    setEditingValue(true);
  };

  const commitValue = async () => {
    if (busy) return;
    const v = parseMoneyBR(valueStr);
    await onPatch({ negotiatedValue: Number.isFinite(v) && v > 0 ? v : null });
    setEditingValue(false);
  };

  return (
    <div className="p-5 border-b border-border space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Negociação</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Valor</label>
          {editingValue ? (
            <div className="flex gap-1.5">
              <input autoFocus className="field-input flex-1" inputMode="decimal"
                placeholder="Ex.: 3450,00"
                value={valueStr} onChange={(e) => setValueStr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitValue();
                  if (e.key === "Escape") setEditingValue(false);
                }} />
              <Button size="sm" onClick={commitValue} disabled={busy}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : "OK"}
              </Button>
            </div>
          ) : (
            <button onClick={startEdit} disabled={busy}
              className="field-input w-full text-left flex items-center gap-2 hover:border-primary/50 transition-colors">
              <span className="font-bold truncate">
                {lead.value > 0
                  ? `${lead.valueApproximate ? "a partir de " : ""}R$ ${money(lead.value)}`
                  : "Definir valor"}
              </span>
              {lead.negotiatedValue != null && (
                <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 rounded-full px-1.5 py-0.5 shrink-0">
                  negociado
                </span>
              )}
              <Pencil size={11} className="ml-auto shrink-0 text-muted-foreground" />
            </button>
          )}
          {lead.negotiatedValue != null && !editingValue && (
            <button onClick={() => onPatch({ negotiatedValue: null })} disabled={busy}
              className="text-[10px] text-muted-foreground underline underline-offset-2 mt-1 hover:text-foreground">
              voltar ao valor de tabela
            </button>
          )}
        </div>
        <div>
          <label className="field-label">Canal de origem</label>
          <select className="field-input" value={lead.source ?? ""} disabled={busy}
            onChange={(e) => onPatch({ source: e.target.value || null })}>
            <option value="">—</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Próximo follow-up</label>
          <DatePatchField value={lead.followUpAt} busy={busy}
            onCommit={(v) => onPatch({ followUpAt: v })} />
        </div>
        <div>
          <label className="field-label">Validade do lead</label>
          <DatePatchField value={lead.expiresAt} busy={busy}
            onCommit={(v) => onPatch({ expiresAt: v })} />
        </div>
      </div>
    </div>
  );
}

export function LeadDrawer({
  propertyId, lead, channels, busy,
  onClose, onFollowUp, onAddNote, onMoveStage, onMarkLost, onWin, onOpenOrigin, onPatch,
  onPromoteGuest, onAlarmsChanged,
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
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onPromoteGuest: (guestId?: string) => Promise<void>;
  onAlarmsChanged?: () => void;
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

  // Patch (valor/canal/prazos) muda o histórico → timeline recarrega junto.
  const patchAndRefresh = async (patch: Record<string, unknown>) => {
    await onPatch(patch);
    setTimelineKey((k) => k + 1);
  };

  const promoteAndRefresh = async (guestId?: string) => {
    await onPromoteGuest(guestId);
    setTimelineKey((k) => k + 1);
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

        {/* Titular — só orçamentos; recorrente/novo, vínculo e histórico do cliente */}
        {isQuote && (
          <ClientPanel propertyId={propertyId} lead={lead} busy={busy} onPromote={promoteAndRefresh} />
        )}

        {/* Negociação — só orçamentos; casamentos têm o financeiro na gestão do evento */}
        {isQuote && active && (
          <NegotiationSection lead={lead} channels={channels} busy={busy} onPatch={patchAndRefresh} />
        )}

        {/* Alarmes — também em lead FECHADO (cobrança é pós-fechamento) */}
        <LeadAlarms propertyId={propertyId} lead={lead}
          onChanged={() => { onAlarmsChanged?.(); setTimelineKey((k) => k + 1); }} />


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
