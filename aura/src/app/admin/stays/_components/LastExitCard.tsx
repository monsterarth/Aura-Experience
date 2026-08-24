"use client";

import React from "react";
import { DoorClosed, Star, Wallet } from "lucide-react";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import { Pill } from "@/components/aura/Pill";
import { folioBalance } from "@/lib/stay-account";
import { relativeDays } from "./stay-filters";
import { fmtDay, npsInfo, titleCase, type StayRow } from "./stay-utils";
import type { LastExit } from "./useLastExits";

export interface LastExitCardProps {
  exit: LastExit;
  onOpen: (s: StayRow) => void;
  onAccount: (s: StayRow) => void;
  onSurvey: (s: StayRow) => void;
}

/** "Ana Silva de Souza" → "Ana S." — o card é pequeno e a cabana é o que identifica. */
function shortLabel(full?: string | null): string {
  const name = titleCase(full);
  if (!name) return "Hóspede";
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

/**
 * Última saída de uma cabana. O card inteiro abre a ficha; a nota abre a
 * avaliação e a carteira abre a conta — os dois assuntos que a recepção
 * costuma querer conferir logo depois de um check-out.
 */
export function LastExitCard({ exit, onOpen, onAccount, onSurvey }: LastExitCardProps) {
  const s = exit.stay;

  if (!s) {
    return (
      <article className="ak-card" data-pad="14" style={{ display: "flex", flexDirection: "column", gap: 8, opacity: .55 }}>
        <Pill tone="neutral" size="md" label={exit.cabinName} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.muted2, fontSize: 12, fontWeight: 700 }}>
          <DoorClosed size={13} /> Sem saídas registradas
        </div>
      </article>
    );
  }

  const nps = npsInfo(s);
  const balance = folioBalance(s.folioItems ?? []);
  const exitDate = s.checkOutActual ?? s.checkOut;
  const npsTone = nps ? toneOf(nps.tone) : null;

  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Abrir ficha de ${shortLabel(s.guestName)} — ${exit.cabinName}`}
      onClick={() => onOpen(s)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(s); } }}
      className="ak-card ak-press ak-focus"
      data-pad="14"
      style={{ display: "flex", flexDirection: "column", gap: 10, cursor: "pointer" }}
    >
      <Pill tone="brand" size="md" label={exit.cabinName} style={{ maxWidth: "100%" }} />

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: T.text, letterSpacing: "-.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {shortLabel(s.guestName)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginTop: 2 }}>
          Saiu {relativeDays(exitDate)} · {fmtDay(exitDate, "dd MMM")}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={stop(() => onSurvey(s))}
          disabled={!nps}
          title={nps ? "Ver avaliação" : "Sem avaliação"}
          className={nps ? "ak-press ak-focus" : undefined}
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "7px 9px", borderRadius: 10,
            background: npsTone ? npsTone.bg : T.glass,
            border: `1px solid ${npsTone ? npsTone.border : T.border}`,
            color: npsTone ? npsTone.color : T.muted2,
            fontFamily: "inherit", fontSize: 12, fontWeight: 800, cursor: nps ? "pointer" : "default", minWidth: 0,
          }}
        >
          <Star size={13} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nps ? nps.value : "—"}</span>
        </button>

        <button
          type="button"
          onClick={stop(() => onAccount(s))}
          title="Abrir a conta"
          className="ak-press ak-focus"
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "7px 9px", borderRadius: 10,
            background: balance > 0.005 ? T.orangeBg : T.greenBg,
            border: `1px solid ${balance > 0.005 ? T.orangeBorder : T.greenBorder}`,
            color: balance > 0.005 ? T.orange : T.green,
            fontFamily: "inherit", fontSize: 12, fontWeight: 800, cursor: "pointer", minWidth: 0,
          }}
        >
          <Wallet size={13} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {balance > 0.005 ? `R$ ${balance.toFixed(0)}` : "quitada"}
          </span>
        </button>
      </div>
    </article>
  );
}
