// Prazos padrão das negociações — extraído do page.tsx.
"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { T } from "./lib";
import { Button, Dialog, Field, Input, Skeleton } from "@/components/aura";

function LeadDaysRow({ label, hint, value, disabled, onChange }: {
  label: string; hint: string; value: string; disabled: boolean; onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Input type="number" min={1} max={3650} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} style={{ width: 110 }} />
        <span style={{ fontSize: 12, color: T.muted }}>dias</span>
      </div>
    </Field>
  );
}

export function LeadSettingsModal({ propertyId, open = true, onClose }: { propertyId: string; open?: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ followUpDays: "", expiryDays: "", renewDays: "" });
  const [canEdit, setCanEdit] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/weddings/lead-settings?propertyId=${propertyId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive) return;
        if (d) {
          setForm({ followUpDays: String(d.followUpDays), expiryDays: String(d.expiryDays), renewDays: String(d.renewDays) });
          setCanEdit(!!d.canEdit);
        }
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [propertyId, open]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/weddings/lead-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, ...form }),
      });
      if (!res.ok) throw new Error();
      toast.success("Prazos atualizados. Valem para negociações novas.");
      onClose();
    } catch { toast.error("Erro ao salvar os prazos."); }
    finally { setSaving(false); }
  };

  return (
    <Dialog
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      presentation="auto"
      size="sm"
      title="Prazos das negociações"
      subtitle="Padrão da propriedade — cada negociação pode ter prazo próprio."
      footerRow
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Fechar</Button>
          {canEdit && <Button variant="primary" onClick={save} loading={saving} loadingText="Salvando…" disabled={loading}>Salvar</Button>}
        </>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {loading ? (
          <>
            <Skeleton h={60} /><Skeleton h={60} /><Skeleton h={60} />
          </>
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
    </Dialog>
  );
}
