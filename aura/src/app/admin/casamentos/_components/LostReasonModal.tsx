// Modal de negociação perdida (motivo obrigatório) — extraído do page.tsx.
"use client";

import React, { useState } from "react";
import { Wedding, WEDDING_LOST_REASONS } from "@/types/aura";
import { Loader2 } from "lucide-react";
import { T, fmt } from "./lib";

// Modal de perda: motivo é obrigatório — é ele que transforma o arquivo morto
// em informação comercial ("por que não fechamos?").
export function LostReasonModal({ wedding, onCancel, onConfirm }: {
  wedding: Wedding;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<string>('');
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const final = reason === '__outro__' ? custom.trim() : reason;

  const submit = async () => {
    if (!final) return;
    setSaving(true);
    try { await onConfirm(final); } finally { setSaving(false); }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget && !saving) onCancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440, background: T.card, borderRadius: 18, border: `1px solid ${T.border2}`, boxShadow: '0 32px 80px rgba(0,0,0,.7)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: T.text }}>Arquivar negociação</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
            {wedding.bride} & {wedding.groom} · {fmt(wedding.weddingDate)}
          </div>
        </div>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: T.muted, marginBottom: 2 }}>
            Por que não fechou?
          </div>
          {[...WEDDING_LOST_REASONS, '__outro__'].map(r => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 10, border: `1px solid ${reason === r ? T.violetBorder : T.border}`, background: reason === r ? T.violetBg : T.glass, cursor: 'pointer', fontSize: 13, color: T.text }}>
              <input type="radio" name="lost-reason" checked={reason === r} onChange={() => setReason(r)} />
              {r === '__outro__' ? 'Outro motivo…' : r}
            </label>
          ))}
          {reason === '__outro__' && (
            <input autoFocus value={custom} onChange={e => setCustom(e.target.value)} placeholder="Descreva o motivo"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.glass, color: T.text, fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
          )}
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
            O casamento sai da lista ativa e o valor deixa de contar na receita — mas o
            histórico e o motivo ficam guardados.
          </div>
        </div>

        <div style={{ padding: '14px 22px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={saving}
            style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: T.muted }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={!final || saving}
            style={{ padding: '9px 18px', borderRadius: 10, border: `1px solid ${T.border2}`, background: final && !saving ? T.glass2 : T.glass, cursor: final && !saving ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: final ? T.text : T.muted, display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? .6 : 1 }}>
            {saving && <Loader2 size={12} className="animate-spin" />} Arquivar como perdida
          </button>
        </div>
      </div>
    </div>
  );
}
