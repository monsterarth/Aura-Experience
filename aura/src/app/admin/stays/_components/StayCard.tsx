"use client";

import React from "react";
import { Ban, Clock, Copy, Dog, LogIn, MessageCircle, ShieldAlert, Users } from "lucide-react";
import { T, tone as toneOf, type Tone } from "@/lib/admin-tokens";
import { Button, IconButton } from "@/components/aura/Button";
import { Pill } from "@/components/aura/Pill";
import { activeStatusInfo, futureStatusInfo, fmtDay, isUnknownGuest, shortName, type StayRow } from "./stay-utils";

export interface StayCardProps {
  stay: StayRow;
  mode: "ativas" | "futuras";
  onOpen: (s: StayRow) => void;
  onWhatsapp: (s: StayRow) => void;
  onCheckIn?: (s: StayRow) => void;
  onCancel?: (s: StayRow) => void;
  onCopyLink?: (code: string) => void;
  opening?: boolean;
  checkingIn?: boolean;
}

function Flag({ title, tone, children }: { title: string; tone: Tone; children: React.ReactNode }) {
  const t = toneOf(tone);
  return (
    <span title={title} aria-label={title} style={{ width: 28, height: 28, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", background: t.bg, border: `1px solid ${t.border}`, color: t.color, flexShrink: 0 }}>
      {children}
    </span>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted };

/** Cartão de estadia ativa/futura: cabana, hóspede (toque = WhatsApp), datas, status e ações. */
export function StayCard({ stay: s, mode, onOpen, onWhatsapp, onCheckIn, onCancel, onCopyLink, opening, checkingIn }: StayCardProps) {
  const unknown = isUnknownGuest(s);
  const status = mode === "ativas" ? activeStatusInfo(s.checkOut) : futureStatusInfo(s.checkIn, s.expectedArrivalTime);
  const st = toneOf(status.tone);
  const preDone = s.status === "pre_checkin_done";

  return (
    <article className="ak-card" data-pad="16" style={{ display: "flex", flexDirection: "column", gap: 12, borderColor: status.tone === "red" ? T.redBorder : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <Pill tone={s.cabinId ? "brand" : "amber"} size="md" label={s.cabinName || "Sem cabana"} style={{ maxWidth: "70%" }} />
        <div style={{ display: "flex", gap: 4 }}>
          {unknown && <Flag title="Documento pendente" tone="red"><ShieldAlert size={14} /></Flag>}
          {s.hasPet && <Flag title="Pet" tone="orange"><Dog size={14} /></Flag>}
          {s.groupId && <Flag title="Grupo" tone="blue"><Users size={14} /></Flag>}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <button
          type="button"
          onClick={() => onWhatsapp(s)}
          title="Enviar WhatsApp"
          className="ak-press ak-focus"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: T.text, fontSize: 17, fontWeight: 900, letterSpacing: "-.3px", lineHeight: 1.2, display: "flex", alignItems: "center", gap: 6, textAlign: "left", maxWidth: "100%" }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(s.guestName)}</span>
          <MessageCircle size={14} color={T.muted} style={{ flexShrink: 0 }} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: ".02em" }}>
            <Clock size={11} /> {fmtDay(s.checkIn)} — {fmtDay(s.checkOut)}
          </span>
          {s.internalUse && <Pill tone="amber" label="Uso da casa" />}
        </div>
      </div>

      {mode === "ativas" ? (
        <div style={{ background: st.bg, border: `1px solid ${st.border}`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>Status atual</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: st.color, marginTop: 2 }}>{status.label}</div>
          </div>
          {unknown && <Pill tone="red" label="Doc pendente" />}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: st.bg, border: `1px solid ${st.border}`, borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
            <div style={labelStyle}>Previsão</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: st.color, marginTop: 2, lineHeight: 1.3 }}>{status.label}</div>
          </div>
          <div style={{ background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
              <div style={labelStyle}>Pré-check-in</div>
              {s.status === "pending" && onCopyLink && (
                <IconButton icon={Copy} label="Copiar link do check-in" size="sm" onClick={() => onCopyLink(s.accessCode)} style={{ margin: "-6px -6px -6px 0" }} />
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: preDone ? T.green : T.amber, marginTop: 2 }}>{preDone ? "Pronto" : "Pendente"}</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, paddingTop: 2 }}>
        <Button variant="secondary" onClick={() => onOpen(s)} loading={opening} style={{ flex: 1 }}>Ver ficha</Button>
        {mode === "futuras" && onCheckIn && (
          <Button variant="primary" icon={LogIn} onClick={() => onCheckIn(s)} loading={checkingIn} style={{ flex: 1 }}>Check-in</Button>
        )}
        {mode === "futuras" && onCancel && (
          <Button variant="danger" icon={Ban} onClick={() => onCancel(s)} aria-label="Cancelar reserva" title="Cancelar reserva" />
        )}
      </div>
    </article>
  );
}
