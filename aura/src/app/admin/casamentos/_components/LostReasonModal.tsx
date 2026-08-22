// Modal de negociação perdida (motivo obrigatório) — extraído do page.tsx.
"use client";

import React, { useEffect, useState } from "react";
import { Wedding, WEDDING_LOST_REASONS } from "@/types/aura";
import { T, fmt } from "./lib";
import { Button, Dialog, Input } from "@/components/aura";

// Modal de perda: motivo é obrigatório — é ele que transforma o arquivo morto
// em informação comercial ("por que não fechamos?").
export function LostReasonModal({ wedding, open = true, onCancel, onConfirm }: {
  wedding: Wedding;
  open?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const final = reason === "__outro__" ? custom.trim() : reason;

  useEffect(() => { if (open) { setReason(""); setCustom(""); } }, [open]);

  const submit = async () => {
    if (!final) return;
    setSaving(true);
    try { await onConfirm(final); } finally { setSaving(false); }
  };

  return (
    <Dialog
      open={open}
      onClose={() => { if (!saving) onCancel(); }}
      presentation="auto"
      size="sm"
      title="Arquivar negociação"
      subtitle={`${wedding.bride} & ${wedding.groom} · ${fmt(wedding.weddingDate)}`}
      footerRow
      footer={(
        <>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button variant="secondary" onClick={submit} disabled={!final} loading={saving} loadingText="Arquivando…">Arquivar como perdida</Button>
        </>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="ak-field__label">Por que não fechou?</div>
        {[...WEDDING_LOST_REASONS, "__outro__"].map(r => (
          <label key={r} className="ak-press" style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "9px 12px", borderRadius: 10, border: `1px solid ${reason === r ? T.violetBorder : T.border}`, background: reason === r ? T.violetBg : T.glass, cursor: "pointer", fontSize: 13, color: T.text }}>
            <input type="radio" name="lost-reason" checked={reason === r} onChange={() => setReason(r)} style={{ accentColor: T.violet }} />
            {r === "__outro__" ? "Outro motivo…" : r}
          </label>
        ))}
        {reason === "__outro__" && (
          <Input autoFocus value={custom} onChange={e => setCustom(e.target.value)} placeholder="Descreva o motivo" />
        )}
        <div style={{ fontSize: 11, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>
          O casamento sai da lista ativa e o valor deixa de contar na receita — mas o
          histórico e o motivo ficam guardados.
        </div>
      </div>
    </Dialog>
  );
}
