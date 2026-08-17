// Modal unificado de perda: motivos curados POR TIPO de lead (orçamento e
// casamento têm listas próprias — misturar inviabiliza KPI de motivo).
// Visual: identidade do admin (dark glass — ver src/app/admin/CLAUDE.md), no
// mesmo molde de casamentos/_components/LostReasonModal.tsx.
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { CRM_LOST_REASONS_QUOTE, CrmLead, WEDDING_LOST_REASONS } from "@/types/aura";
import { fmtBR } from "./shared";

export function MarkLostModal({ lead, busy, onCancel, onConfirm }: {
  lead: CrmLead;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const reasons = lead.entityType === "quote" ? CRM_LOST_REASONS_QUOTE : WEDDING_LOST_REASONS;
  const final = reason === "__outro__" ? custom.trim() : reason;

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 16,
      }}>
      <div style={{
        width: "100%", maxWidth: 440, background: T.card, borderRadius: 18,
        border: `1px solid ${T.border2}`, boxShadow: "0 32px 80px rgba(0,0,0,.7)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: T.text }}>
            {lead.entityType === "quote" ? "Arquivar orçamento perdido" : "Arquivar negociação perdida"}
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
            {lead.title} · {fmtBR(lead.dateRef)}
          </div>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 6 }}>
          {[...reasons, "__outro__"].map((r) => (
            <label key={r} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "9px 12px",
              borderRadius: 10, cursor: "pointer", fontSize: 13, color: T.text,
              border: `1px solid ${reason === r ? T.redBorder : T.border}`,
              background: reason === r ? T.redBg : T.glass,
            }}>
              <input type="radio" name="hub-lost" checked={reason === r} onChange={() => setReason(r)} />
              {r === "__outro__" ? "Outro motivo…" : r}
            </label>
          ))}
          {reason === "__outro__" && (
            <input autoFocus placeholder="Descreva o motivo" value={custom}
              onChange={(e) => setCustom(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10,
                border: `1px solid ${T.border2}`, background: T.glass, color: T.text,
                fontFamily: "inherit", fontSize: 13, outline: "none",
              }} />
          )}
        </div>

        <div style={{
          padding: "14px 22px", borderTop: `1px solid ${T.border}`,
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          <button onClick={onCancel} disabled={busy} style={{
            padding: "9px 14px", borderRadius: 10, border: "none", background: "transparent",
            cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: T.muted,
          }}>
            Cancelar
          </button>
          <button onClick={() => onConfirm(final)} disabled={!final || busy} style={{
            padding: "9px 18px", borderRadius: 10, border: `1px solid ${T.redBorder}`,
            background: final && !busy ? T.redBg : T.glass,
            cursor: final && !busy ? "pointer" : "default",
            fontFamily: "inherit", fontSize: 12, fontWeight: 800,
            color: final ? T.red : T.muted, display: "flex", alignItems: "center", gap: 6,
            opacity: busy ? 0.6 : 1,
          }}>
            {busy && <Loader2 size={13} className="animate-spin" />} Arquivar como perdido
          </button>
        </div>
      </div>
    </div>
  );
}
