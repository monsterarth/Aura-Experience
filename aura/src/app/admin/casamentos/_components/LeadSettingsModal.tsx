// Prazos padrão das negociações — extraído do page.tsx.
"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { T, FLabel } from "./lib";

function LeadDaysRow({ label, hint, value, disabled, onChange }: {
  label: string; hint: string; value: string; disabled: boolean; onChange: (v: string) => void;
}) {
  return (
    <div>
      <FLabel>{label}</FLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="number" min={1} max={3650} value={value} disabled={disabled}
          onChange={e => onChange(e.target.value)}
          style={{ width: 90, boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: `1px solid ${T.border2}`, background: T.glass, color: T.text, fontFamily: 'inherit', fontSize: 13, outline: 'none' }} />
        <span style={{ fontSize: 12, color: T.muted }}>dias</span>
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{hint}</div>
    </div>
  );
}

export function LeadSettingsModal({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const [form, setForm] = useState({ followUpDays: '', expiryDays: '', renewDays: '' });
  const [canEdit, setCanEdit] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/weddings/lead-settings?propertyId=${propertyId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setForm({ followUpDays: String(d.followUpDays), expiryDays: String(d.expiryDays), renewDays: String(d.renewDays) });
          setCanEdit(!!d.canEdit);
        }
      })
      .finally(() => setLoading(false));
  }, [propertyId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/weddings/lead-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, ...form }),
      });
      if (!res.ok) throw new Error();
      toast.success('Prazos atualizados. Valem para negociações novas.');
      onClose();
    } catch { toast.error('Erro ao salvar os prazos.'); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: T.card, borderRadius: 18, border: `1px solid ${T.border2}`, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: T.text }}>Prazos das negociações</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
            Padrão da propriedade — cada negociação pode ter prazo próprio.
          </div>
        </div>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Loader2 size={18} className="animate-spin" color={T.muted} /></div>
          ) : (
            <>
              <LeadDaysRow label="Follow-up a cada" hint="Quando cobrar retorno do casal. Só sinaliza na lista."
                value={form.followUpDays} disabled={!canEdit}
                onChange={v => setForm(f => ({ ...f, followUpDays: v }))} />
              <LeadDaysRow label="Validade da negociação" hint="Sem retorno nesse prazo, vira negociação perdida automaticamente."
                value={form.expiryDays} disabled={!canEdit}
                onChange={v => setForm(f => ({ ...f, expiryDays: v }))} />
              <LeadDaysRow label="Renovação por contato" hint="Quanto o botão “Registrar follow-up” estica a validade."
                value={form.renewDays} disabled={!canEdit}
                onChange={v => setForm(f => ({ ...f, renewDays: v }))} />
              {!canEdit && <div style={{ fontSize: 11, color: T.amber }}>Só gerência pode alterar estes prazos.</div>}
            </>
          )}
        </div>
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: T.muted }}>Fechar</button>
          {canEdit && (
            <button onClick={save} disabled={saving || loading}
              style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: T.grad, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? .6 : 1 }}>
              {saving && <Loader2 size={12} className="animate-spin" />} Salvar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
