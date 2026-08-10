// Painel do titular do lead (só orçamentos): recorrente vs novo, sugestão de
// vínculo por telefone, "Promover a hóspede" (modal — ficha existente ou nova,
// sem mexer no estágio) e, depois da promoção, o histórico do cliente:
// hospedagens e outros orçamentos, sem sair do drawer.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Home, Link2, Loader2, UserPlus } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CrmLead, Guest, RateQuoteRecord } from "@/types/aura";
import { resolveQuoteValue } from "@/lib/rate-engine";
import { PromoteGuestModal, PromotePayload } from "./PromoteGuestModal";
import { S, QUOTE_STAGES, fmtBR, money, pillS } from "./shared";

type ClientStayRow = {
  id: string; checkIn: string; checkOut: string;
  status: string; cabinName: string | null;
};

type ClientContext = {
  guest: Guest | null;
  staysCount: number;
  stays: ClientStayRow[];
  phoneMatches: Guest[];
  quotes: RateQuoteRecord[];
};

const STAY_LABEL: Record<string, string> = {
  reserved: "reservada", confirmed: "confirmada", checked_in: "hospedado",
  checked_out: "finalizada", cancelled: "cancelada", no_show: "no-show",
};

const drawerLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase",
  color: T.muted, margin: 0,
};

/** Campo do lead com commit no blur (só quando muda) — nada de patch por tecla. */
function LeadField({ label, value, placeholder, busy, digitsOnly, onCommit }: {
  label: string;
  value: string;
  placeholder?: string;
  busy: boolean;
  digitsOnly?: boolean;
  onCommit: (v: string | null) => void;
}) {
  const [draft, setDraft] = useState(value);
  const syncedTo = useRef(value);
  useEffect(() => {
    if (syncedTo.current !== value) { syncedTo.current = value; setDraft(value); }
  }, [value]);

  const commit = () => {
    const clean = digitsOnly ? draft.replace(/\D/g, "") : draft.trim();
    if (clean !== (value ?? "")) onCommit(clean || null);
  };

  return (
    <div>
      <label style={{
        fontSize: 9, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
        color: T.muted, marginBottom: 4, display: "block",
      }}>{label}</label>
      <input style={{ ...S.input, padding: "7px 10px", fontSize: 12 }}
        value={draft} placeholder={placeholder} disabled={busy}
        onChange={(e) => setDraft(digitsOnly ? e.target.value.replace(/\D/g, "") : e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}

export function ClientPanel({
  propertyId, lead, busy, editable, onPromote, onPatch,
}: {
  propertyId: string;
  lead: CrmLead;
  busy: boolean;
  /** Lead ativo — dados do cliente ficam editáveis. */
  editable?: boolean;
  /** Vincula a ficha escolhida na modal (existente) ou cria uma nova. */
  onPromote: (payload: PromotePayload) => Promise<void>;
  /** Grava nome/telefone/e-mail/CPF direto no orçamento. */
  onPatch?: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [ctx, setCtx] = useState<ClientContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    if (!lead.guestId && !lead.phone) { setCtx(null); return; }
    let alive = true;
    setLoading(true);
    const qs = new URLSearchParams({ propertyId });
    if (lead.guestId) qs.set("guestId", lead.guestId);
    if (lead.phone) qs.set("phone", lead.phone);
    fetch(`/api/admin/comercial/client?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setCtx(d); })
      .catch(() => { if (alive) setCtx(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [propertyId, lead.id, lead.guestId, lead.phone]);

  const guest = ctx?.guest ?? null;
  const otherQuotes = (ctx?.quotes || []).filter((q) => q.id !== lead.id).slice(0, 5);
  const stays = ctx?.stays ?? [];

  /** Só fecha quando promoveu — o erro já virou toast lá em cima. */
  const confirmPromotion = async (payload: PromotePayload) => {
    try {
      await onPromote(payload);
      setPromoting(false);
    } catch { /* formulário continua na tela para corrigir */ }
  };

  return (
    <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={drawerLabel}>Cliente</p>

      {promoting && (
        <PromoteGuestModal propertyId={propertyId} lead={lead} busy={busy}
          onClose={() => setPromoting(false)} onConfirm={confirmPromotion} />
      )}

      {loading && !ctx ? (
        <p style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
          <Loader2 size={12} className="animate-spin" /> Cruzando com a base de hóspedes…
        </p>
      ) : guest ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800, color: T.text }}>
            <BadgeCheck size={14} color={T.emerald} /> {guest.fullName}
          </span>
          {(ctx?.staysCount ?? 0) > 0 ? (
            <span style={pillS(T.emeraldBg, T.emerald, T.emeraldBorder)}>
              Recorrente · {ctx!.staysCount} estadia{ctx!.staysCount !== 1 ? "s" : ""}
            </span>
          ) : (
            <span style={pillS("rgba(96,165,250,0.12)", T.blue, "rgba(96,165,250,0.3)")}>
              Hóspede sem estadias ainda
            </span>
          )}
          <Link href={`/admin/guests?id=${guest.id}`}
            style={{ fontSize: 10, color: T.muted, textDecoration: "underline", textUnderlineOffset: 2 }}>
            abrir ficha
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={pillS(T.glass2, T.muted, T.border2)}>Novo cliente (lead)</span>
            <button disabled={busy} onClick={() => setPromoting(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px",
                borderRadius: 10, border: `1px solid ${T.g1Border}`, background: T.gradSoft,
                color: T.g1, fontSize: 11.5, fontWeight: 800, cursor: "pointer",
                fontFamily: "inherit", opacity: busy ? 0.5 : 1,
              }}>
              <UserPlus size={12} /> Promover a hóspede
            </button>
          </div>
          {(ctx?.phoneMatches || []).map((g) => (
            <div key={g.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 12, padding: "8px 12px",
            }}>
              <p style={{ fontSize: 12, color: T.text, minWidth: 0, margin: 0 }}>
                Telefone bate com <b>{g.fullName}</b>
              </p>
              <button disabled={busy} onClick={() => confirmPromotion({ guestId: g.id })}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 9px",
                  borderRadius: 9, border: "none", background: "rgba(245,158,11,0.18)",
                  color: T.amber, fontSize: 11, fontWeight: 800, cursor: "pointer",
                  fontFamily: "inherit", flexShrink: 0, opacity: busy ? 0.5 : 1,
                }}>
                <Link2 size={11} /> Vincular
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dados do lead — editáveis enquanto não há ficha vinculada (depois a
          fonte da verdade é a ficha do hóspede). */}
      {!guest && editable && onPatch && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <LeadField label="Nome" value={lead.title === "Sem nome" ? "" : lead.title} busy={busy}
              placeholder="Nome do cliente"
              onCommit={(v) => onPatch({ clientName: v })} />
          </div>
          <LeadField label="Telefone" value={lead.phone ?? ""} busy={busy} digitsOnly
            placeholder="Só dígitos" onCommit={(v) => onPatch({ clientPhone: v })} />
          <LeadField label="E-mail" value={lead.email ?? ""} busy={busy}
            placeholder="cliente@email.com" onCommit={(v) => onPatch({ clientEmail: v })} />
          <div style={{ gridColumn: "1 / -1" }}>
            <LeadField label="CPF (habilita criar a ficha)" value={lead.document ?? ""}
              busy={busy} placeholder="Só números"
              onCommit={(v) => onPatch({ clientDocument: v })} />
          </div>
        </div>
      )}

      {/* Histórico de hospedagens — só existe depois da promoção (é o que a
          ficha do hóspede amarra). Vale para o vendedor reconhecer recorrente
          e para o "quando ele esteve aqui?" sem trocar de tela. */}
      {stays.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <p style={{ fontSize: 10, color: T.muted, fontWeight: 800, margin: 0 }}>
            Hospedagens deste cliente ({stays.length})
          </p>
          {stays.slice(0, 5).map((s) => (
            <Link key={s.id} href={`/admin/stays/${s.id}`}
              style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                background: T.glass, border: `1px solid ${T.border}`, borderRadius: 10,
                padding: "7px 11px", color: T.text, textDecoration: "none",
              }}>
              <Home size={12} style={{ color: T.muted, flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{fmtBR(s.checkIn)} → {fmtBR(s.checkOut)}</span>
              {s.cabinName && (
                <span style={{
                  fontSize: 11, color: T.muted, minWidth: 0,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {s.cabinName}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 10, color: T.muted, flexShrink: 0 }}>
                {STAY_LABEL[s.status] ?? s.status}
              </span>
            </Link>
          ))}
          {stays.length > 5 && (
            <Link href={`/admin/guests?id=${guest?.id ?? ""}`}
              style={{ fontSize: 10.5, color: T.muted, textDecoration: "underline", textUnderlineOffset: 2 }}>
              ver todas na ficha
            </Link>
          )}
        </div>
      )}

      {otherQuotes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <p style={{ fontSize: 10, color: T.muted, fontWeight: 800, margin: 0 }}>
            Outros orçamentos deste cliente ({(ctx?.quotes.length ?? 1) - 1})
          </p>
          {otherQuotes.map((q) => {
            const stage = QUOTE_STAGES.find((s) => s.id === q.status);
            const v = resolveQuoteValue(q);
            return (
              <Link key={q.id} href={`/admin/tarifario?quoteId=${q.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                  background: T.glass, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "7px 11px", color: T.text, textDecoration: "none",
                }}>
                <span style={{ fontWeight: 600 }}>{fmtBR(q.checkIn)} → {fmtBR(q.checkOut)}</span>
                {stage && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: stage.dot }} /> {stage.label}
                  </span>
                )}
                {v.value > 0 && (
                  <span style={{ marginLeft: "auto", fontWeight: 800, flexShrink: 0 }}>
                    {v.approximate ? "a partir de " : ""}R$ {money(v.value)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
