// Painel do titular do lead (só orçamentos): recorrente vs novo, sugestão de
// vínculo por telefone, "Promover a hóspede" (sem mexer no estágio) e o
// mini-histórico de cotações do cliente.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Link2, Loader2, UserPlus } from "lucide-react";
import { CrmLead, Guest, RateQuoteRecord } from "@/types/aura";
import { resolveQuoteValue } from "@/lib/rate-engine";
import { QUOTE_STAGES, fmtBR, money } from "./shared";

type ClientContext = {
  guest: Guest | null;
  staysCount: number;
  phoneMatches: Guest[];
  quotes: RateQuoteRecord[];
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
    <div className="p-5 border-b border-border space-y-2.5">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cliente</p>

      {loading && !ctx ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Cruzando com a base de hóspedes…
        </p>
      ) : guest ? (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
            <BadgeCheck size={14} className="text-emerald-500" /> {guest.fullName}
          </span>
          {(ctx?.staysCount ?? 0) > 0 ? (
            <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 rounded-full px-2 py-0.5">
              Recorrente · {ctx!.staysCount} estadia{ctx!.staysCount !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-[9px] font-black uppercase tracking-wider bg-sky-500/15 text-sky-600 rounded-full px-2 py-0.5">
              Hóspede sem estadias ainda
            </span>
          )}
          <Link href={`/admin/guests?id=${guest.id}`}
            className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
            abrir ficha
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-[9px] font-black uppercase tracking-wider bg-secondary text-muted-foreground rounded-full px-2 py-0.5">
              Novo cliente (lead)
            </span>
            <button disabled={busy} onClick={() => onPromote()}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-primary/10 text-primary rounded-lg px-2.5 py-1.5 hover:bg-primary/20 transition-colors disabled:opacity-50">
              <UserPlus size={12} /> Promover a hóspede
            </button>
          </div>
          {(ctx?.phoneMatches || []).map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
              <p className="text-xs text-foreground min-w-0">
                Telefone bate com <b>{g.fullName}</b>
              </p>
              <button disabled={busy} onClick={() => onPromote(g.id)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-500/20 rounded-lg px-2 py-1 hover:bg-amber-500/30 transition-colors shrink-0 disabled:opacity-50">
                <Link2 size={11} /> Vincular
              </button>
            </div>
          ))}
        </div>
      )}

      {otherQuotes.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground font-bold">Outras cotações deste cliente</p>
          {otherQuotes.map((q) => {
            const stage = QUOTE_STAGES.find((s) => s.id === q.status);
            const v = resolveQuoteValue(q);
            return (
              <Link key={q.id} href={`/admin/tarifario?quoteId=${q.id}`}
                className="flex items-center gap-2 text-xs bg-secondary/60 rounded-lg px-2.5 py-1.5 hover:bg-secondary transition-colors">
                <span className="text-foreground font-medium">{fmtBR(q.checkIn)} → {fmtBR(q.checkOut)}</span>
                {stage && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} /> {stage.label}
                  </span>
                )}
                {v.value > 0 && (
                  <span className="ml-auto font-bold text-foreground shrink-0">
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
