// Painel de detalhe do lead no hub: contato, prazos, ações comerciais e a
// timeline do histórico. As ações reusam os endpoints existentes de cada
// funil. Visual: identidade do admin (dark glass — ver src/app/admin/CLAUDE.md).
"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarClock, CalendarDays, ExternalLink, Heart, Loader2, Mail,
  MessageSquare, Pencil, Phone, Send, Tag, X, XCircle,
} from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { parseMoneyBR, moneyToInput } from "@/lib/parse-money";
import { CrmChannel, CrmLead, WeddingInstallment } from "@/types/aura";
import { ClientPanel } from "./ClientPanel";
import { InteractionTimeline } from "./InteractionTimeline";
import { LeadAlarms } from "./LeadAlarms";
import { S, QUOTE_STAGES, WEDDING_STAGES, ACTIVE_STAGES, fmtBR, money, pillS, todayIso } from "./shared";

const drawerLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase",
  color: T.muted, margin: 0,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
  color: T.muted, marginBottom: 5, display: "block",
};

const contactBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800,
  background: T.glass2, border: `1px solid ${T.border2}`, color: T.text,
  borderRadius: 10, padding: "7px 11px", cursor: "pointer", fontFamily: "inherit",
  textDecoration: "none",
};

/**
 * "Cobranças do contrato" (só casamentos): as parcelas reais, read-only —
 * a gestão (editar/pagar) vive na aba financeiro do painel do casamento.
 * Falha do fetch (ex.: migration pendente) = seção não aparece.
 */
function ContractCharges({ lead }: { lead: CrmLead }) {
  const [items, setItems] = useState<WeddingInstallment[] | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    fetch(`/api/admin/weddings/${lead.id}/installments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setItems(d?.installments ?? null); })
      .catch(() => { if (alive) setItems(null); });
    return () => { alive = false; };
  }, [lead.id]);

  if (!items || items.length === 0) return null;

  const t = todayIso();
  const statusOf = (i: WeddingInstallment) =>
    i.paid ? { label: "paga", bg: "rgba(45,212,191,0.15)", fg: T.green }
      : i.dueDate && i.dueDate < t ? { label: "vencida", bg: "rgba(248,113,113,0.15)", fg: T.red }
      : i.dueDate ? { label: "pendente", bg: "rgba(245,158,11,0.15)", fg: T.amber }
      : { label: "aguarda", bg: T.glass3, fg: "rgba(238,240,248,0.5)" };

  return (
    <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={drawerLabel}>Cobranças do contrato</p>
      {items.map((i) => {
        const st = statusOf(i);
        return (
          <div key={i.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            background: T.glass, border: `1px solid ${T.border}`, borderRadius: 11, padding: "9px 12px",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: T.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {i.label}
              </p>
              <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>
                {i.dueDate ? `Vencimento ${fmtBR(i.dueDate)}` : "Sem vencimento combinado"}
              </p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 900, color: T.text, flexShrink: 0 }}>
              R$ {money(Number(i.value))}
            </span>
            <span style={{
              fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em",
              borderRadius: 999, padding: "3px 9px", background: st.bg, color: st.fg, flexShrink: 0,
            }}>
              {st.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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
    <input type="date" style={S.input} value={draft} disabled={busy}
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
    <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={drawerLabel}>Negociação</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={fieldLabel}>Valor</label>
          {editingValue ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input autoFocus style={{ ...S.input, flex: 1 }} inputMode="decimal"
                placeholder="Ex.: 3450,00"
                value={valueStr} onChange={(e) => setValueStr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitValue();
                  if (e.key === "Escape") setEditingValue(false);
                }} />
              <button onClick={commitValue} disabled={busy}
                style={{ ...S.gradBtn, padding: "8px 12px", opacity: busy ? 0.6 : 1 }}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : "OK"}
              </button>
            </div>
          ) : (
            <button onClick={startEdit} disabled={busy}
              style={{
                ...S.input, display: "flex", alignItems: "center", gap: 8,
                textAlign: "left", cursor: "pointer",
              }}>
              <span style={{ fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {lead.value > 0
                  ? `${lead.valueApproximate ? "a partir de " : ""}R$ ${money(lead.value)}`
                  : "Definir valor"}
              </span>
              {lead.negotiatedValue != null && (
                <span style={{ ...pillS("rgba(245,158,11,0.15)", T.amber, "rgba(245,158,11,0.3)"), flexShrink: 0, fontSize: 9 }}>
                  negociado
                </span>
              )}
              <Pencil size={11} style={{ marginLeft: "auto", flexShrink: 0, color: T.muted }} />
            </button>
          )}
          {lead.negotiatedValue != null && !editingValue && (
            <button onClick={() => onPatch({ negotiatedValue: null })} disabled={busy}
              style={{
                background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 10, color: T.muted, textDecoration: "underline", textUnderlineOffset: 2,
                marginTop: 4, padding: 0,
              }}>
              voltar ao valor de tabela
            </button>
          )}
        </div>
        <div>
          <label style={fieldLabel}>Canal de origem</label>
          <select style={{ ...S.input, background: T.card }} value={lead.source ?? ""} disabled={busy}
            onChange={(e) => onPatch({ source: e.target.value || null })}>
            <option value="">—</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabel}>Próximo follow-up</label>
          <DatePatchField value={lead.followUpAt} busy={busy}
            onCommit={(v) => onPatch({ followUpAt: v })} />
        </div>
        <div>
          <label style={fieldLabel}>Validade do lead</label>
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

  const segBtn = (activeSeg: boolean): React.CSSProperties => ({
    textAlign: "center", padding: "7px 0", borderRadius: 9, border: "none",
    fontSize: 9, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase",
    cursor: "pointer", fontFamily: "inherit",
    background: activeSeg ? T.bg : "transparent",
    color: activeSeg ? "#fff" : T.muted,
  });

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", display: "flex", justifyContent: "flex-end",
      }}>
      <div style={{
        background: T.drawer, width: "100%", maxWidth: 480, height: "100%",
        display: "flex", flexDirection: "column", borderLeft: `1px solid ${T.border2}`,
      }}>
        {/* Header */}
        <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ ...drawerLabel, display: "flex", alignItems: "center", gap: 5 }}>
                {isQuote ? <><CalendarDays size={11} /> Orçamento de reserva</> : <><Heart size={11} /> Casamento</>}
              </p>
              <h2 style={{
                fontSize: 19, fontWeight: 900, color: T.text, margin: "3px 0 0",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {lead.title}
              </h2>
            </div>
            <button onClick={onClose}
              style={{
                padding: 8, borderRadius: 11, background: "none", border: "none",
                cursor: "pointer", color: T.muted, display: "flex", flexShrink: 0,
              }}>
              <X size={15} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
            {stageDef && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800,
                color: T.text, background: T.glass2, borderRadius: 999, padding: "4px 10px",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: stageDef.dot }} /> {stageDef.label}
              </span>
            )}
            {lead.value > 0 && (
              <span style={{ fontWeight: 900, color: T.text }}>
                {lead.valueApproximate ? "a partir de " : ""}R$ {money(lead.value)}
              </span>
            )}
            {channelLabel && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: T.muted }}>
                <Tag size={11} /> {channelLabel}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 12, color: T.muted }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <CalendarDays size={11} />{isQuote ? "Check-in" : "Casamento"}:{" "}
              <b style={{ color: T.text }}>{fmtBR(lead.dateRef)}</b>
            </span>
            {active && lead.followUpAt && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <CalendarClock size={11} />Follow-up: {fmtBR(lead.followUpAt)}
              </span>
            )}
            {active && lead.expiresAt && <span>Validade: {fmtBR(lead.expiresAt)}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {lead.phone && (
              <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                style={{
                  ...contactBtn, background: T.emeraldBg,
                  border: `1px solid ${T.emeraldBorder}`, color: T.emerald,
                }}>
                <Phone size={12} /> WhatsApp
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} style={contactBtn}>
                <Mail size={12} /> {lead.email}
              </a>
            )}
            <button onClick={onOpenOrigin} style={contactBtn}>
              <ExternalLink size={12} /> {isQuote ? "Abrir no Tarifário" : "Abrir em Casamentos"}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Titular — só orçamentos; recorrente/novo, vínculo e histórico do cliente */}
          {isQuote && (
            <ClientPanel propertyId={propertyId} lead={lead} busy={busy} onPromote={promoteAndRefresh} />
          )}

          {/* Negociação — só orçamentos; casamentos têm o financeiro na gestão do evento */}
          {isQuote && active && (
            <NegotiationSection lead={lead} channels={channels} busy={busy} onPatch={patchAndRefresh} />
          )}

          {/* Cobranças do contrato — só casamentos (parcelas reais, read-only) */}
          {!isQuote && <ContractCharges lead={lead} />}

          {/* Alarmes — também em lead FECHADO (cobrança é pós-fechamento) */}
          <LeadAlarms propertyId={propertyId} lead={lead}
            onChanged={() => { onAlarmsChanged?.(); setTimelineKey((k) => k + 1); }} />

          {/* Ações */}
          {active && (
            <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {moveTargets.map((s) => (
                  <button key={s.id} disabled={busy} onClick={() => onMoveStage(s.id)}
                    style={{
                      padding: "6px 11px", borderRadius: 10, fontSize: 11, fontWeight: 800,
                      border: `1px solid ${T.border2}`, background: T.card,
                      color: "rgba(238,240,248,0.6)", cursor: "pointer", fontFamily: "inherit",
                      opacity: busy ? 0.5 : 1,
                    }}>
                    → {s.label}
                  </button>
                ))}
                <button disabled={busy} onClick={onWin}
                  style={{
                    padding: "6px 11px", borderRadius: 10, fontSize: 11, fontWeight: 800,
                    border: "none", background: "rgba(52,211,153,0.15)", color: T.emerald,
                    cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.5 : 1,
                  }}>
                  ✓ {isQuote ? "Ganhou" : "Confirmou"}
                </button>
                <button disabled={busy} onClick={onMarkLost}
                  style={{
                    padding: "6px 11px", borderRadius: 10, fontSize: 11, fontWeight: 800,
                    border: "none", background: "rgba(248,113,113,0.1)", color: T.red,
                    cursor: "pointer", fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", gap: 4, opacity: busy ? 0.5 : 1,
                  }}>
                  <XCircle size={12} /> Perdeu
                </button>
              </div>

              {/* Registrar contato / nota */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, background: T.glass, borderRadius: 12 }}>
                  <button onClick={() => setNoteMode("follow_up")} style={segBtn(noteMode === "follow_up")}>
                    Contato (renova prazos)
                  </button>
                  <button onClick={() => setNoteMode("note")} style={segBtn(noteMode === "note")}>
                    Só nota
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...S.input, flex: 1 }}
                    placeholder={noteMode === "follow_up" ? "O que ficou combinado? (opcional)" : "Anotação interna"}
                    value={note} onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitNote()} />
                  <button onClick={submitNote}
                    disabled={sending || (noteMode === "note" && !note.trim())}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 38, borderRadius: 11, border: "none", background: T.grad,
                      color: "#fff", cursor: "pointer",
                      opacity: sending || (noteMode === "note" && !note.trim()) ? 0.6 : 1,
                    }}>
                    {sending ? <Loader2 size={13} className="animate-spin" /> :
                      noteMode === "follow_up" ? <Send size={14} /> : <MessageSquare size={14} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={{ padding: 20 }}>
            <p style={{ ...drawerLabel, marginBottom: 14 }}>Histórico</p>
            <InteractionTimeline key={timelineKey} propertyId={propertyId} lead={lead} />
          </div>
        </div>
      </div>
    </div>
  );
}
