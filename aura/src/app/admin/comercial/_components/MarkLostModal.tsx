// Modal unificado de perda: motivos curados POR TIPO de lead (orçamento e
// casamento têm listas próprias — misturar inviabiliza KPI de motivo).
// Visual: kit Aura (Dialog), no mesmo molde de casamentos/_components/LostReasonModal.tsx.
"use client";

import { useEffect, useState } from "react";
import { T } from "@/lib/admin-tokens";
import { CRM_LOST_REASONS_QUOTE, CrmLead, WEDDING_LOST_REASONS } from "@/types/aura";
import { Button, Dialog, Input } from "@/components/aura";
import { fmtBR } from "./shared";

export function MarkLostModal({ lead, open = true, busy, onCancel, onConfirm }: {
  lead: CrmLead;
  open?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const reasons = lead.entityType === "quote" ? CRM_LOST_REASONS_QUOTE : WEDDING_LOST_REASONS;
  const final = reason === "__outro__" ? custom.trim() : reason;
  useEffect(() => { if (open) { setReason(""); setCustom(""); } }, [open, lead.id]);

  return (
    <Dialog
      open={open}
      onClose={() => { if (!busy) onCancel(); }}
      presentation="auto"
      size="sm"
      title={lead.entityType === "quote" ? "Arquivar orçamento perdido" : "Arquivar negociação perdida"}
      subtitle={`${lead.title} · ${fmtBR(lead.dateRef)}`}
      footerRow
      footer={(
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button variant="danger" onClick={() => onConfirm(final)} disabled={!final} loading={busy} loadingText="Arquivando…">Arquivar como perdido</Button>
        </>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[...reasons, "__outro__"].map((r) => (
          <label key={r} className="ak-press" style={{
            display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "9px 12px",
            borderRadius: 10, cursor: "pointer", fontSize: 13, color: T.text,
            border: `1px solid ${reason === r ? T.redBorder : T.border}`,
            background: reason === r ? T.redBg : T.glass,
          }}>
            <input type="radio" name="hub-lost" checked={reason === r} onChange={() => setReason(r)} style={{ accentColor: T.red }} />
            {r === "__outro__" ? "Outro motivo…" : r}
          </label>
        ))}
        {reason === "__outro__" && (
          <Input autoFocus placeholder="Descreva o motivo" value={custom} onChange={(e) => setCustom(e.target.value)} />
        )}
      </div>
    </Dialog>
  );
}
