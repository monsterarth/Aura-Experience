// Painel do titular do lead (só orçamentos): recorrente vs novo, sugestão de
// vínculo por telefone, "Promover a hóspede" (sem mexer no estágio) e o
// mini-histórico de cotações do cliente.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Link2, Loader2, UserPlus } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CrmLead, Guest, RateQuoteRecord } from "@/types/aura";
import { resolveQuoteValue } from "@/lib/rate-engine";
import { QUOTE_STAGES, fmtBR, money, pillS } from "./shared";

type ClientContext = {
  guest: Guest | null;
  staysCount: number;
  phoneMatches: Guest[];
  quotes: RateQuoteRecord[];
};

const drawerLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase",
  color: T.muted, margin: 0,
};

export function ClientPanel({
  propertyId, lead, busy, onPromote,
}: {
  propertyId: string;
  lead: CrmLead;
  busy: boolean;
  /** Vincula/cria a ficha do hóspede — com guestId usa a ficha sugerida. */
  onPromote: (guestId?: string) => Promise<void>;
}) {
  const [ctx, setCtx] = useState<ClientContext | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{ padding: 20, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={drawerLabel}>Cliente</p>

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
            <button disabled={busy} onClick={() => onPromote()}
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
              <button disabled={busy} onClick={() => onPromote(g.id)}
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

      {otherQuotes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <p style={{ fontSize: 10, color: T.muted, fontWeight: 800, margin: 0 }}>Outras cotações deste cliente</p>
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
