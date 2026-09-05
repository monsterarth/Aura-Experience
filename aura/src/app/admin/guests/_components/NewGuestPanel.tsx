"use client";

import React, { useState } from "react";
import { ChevronLeft, Save, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Guest } from "@/types/aura";
import { GuestService } from "@/services/guest-service";
import { T } from "@/lib/admin-tokens";
import { Button, IconButton } from "@/components/aura";
import { GuestFormFields, useFnrhDomains } from "./GuestFormFields";
import { EMPTY_GUEST } from "./guest-utils";

export interface NewGuestPanelProps {
  propertyId: string;
  onBack: () => void;
  onCreated: (g: Guest) => void;
  onDirtyChange?: (dirty: boolean) => void;
  actorId: string;
  actorName: string;
  embedded?: boolean;
}

/** Cadastro de novo hóspede (painel inline no desktop, tela cheia no celular). */
export function NewGuestPanel({ propertyId, onBack, onCreated, onDirtyChange, actorId, actorName, embedded }: NewGuestPanelProps) {
  const domains = useFnrhDomains();
  const [formData, setFormData] = useState<Omit<Guest, "updatedAt">>({ ...EMPTY_GUEST, propertyId });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof Guest, value: any) => { onDirtyChange?.(true); setFormData(prev => ({ ...prev, [field]: value })); };
  const setAddress = (field: string, value: string) => { onDirtyChange?.(true); setFormData(prev => ({ ...prev, address: { ...prev.address, [field]: value } })); };
  const setDoc = (field: string, value: string) => { onDirtyChange?.(true); setFormData(prev => ({ ...prev, document: { ...prev.document, [field]: value } })); };

  const handleSave = async () => {
    if (!formData.fullName.trim()) { toast.error("Nome é obrigatório."); return; }
    if (!formData.document.number.trim()) { toast.error("Número do documento é obrigatório."); return; }
    setSaving(true);
    try {
      const payload = { ...formData, id: GuestService.normalizeDocument(formData.document.number) };
      const id = await GuestService.upsertGuest(propertyId, payload as any, actorId, actorName);
      const created = { ...formData, id, updatedAt: new Date().toISOString() } as Guest;
      toast.success("Hóspede criado com sucesso.");
      onDirtyChange?.(false);
      onCreated(created);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar hóspede.");
    } finally {
      setSaving(false);
    }
  };

  const actions = (
    <>
      <Button variant="ghost" onClick={onBack} disabled={saving}>Cancelar</Button>
      <Button variant="primary" icon={Save} onClick={handleSave} loading={saving} loadingText="Criando…">Criar hóspede</Button>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: embedded ? "100%" : undefined, minHeight: 0 }}>
      <div style={{ padding: 16, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {embedded && <IconButton icon={ChevronLeft} label="Voltar" size="lg" onClick={onBack} style={{ marginLeft: -6 }} />}
        <span style={{ width: 48, height: 48, borderRadius: 14, background: T.glass2, border: `1px solid ${T.border2}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.brandText, flexShrink: 0 }}>
          <UserPlus size={20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: T.text, letterSpacing: "-.3px" }}>Novo hóspede</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: T.muted }}>Preencha os dados do cadastro</p>
        </div>
        {!embedded && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: embedded ? "auto" : "visible", padding: 16, WebkitOverflowScrolling: "touch" }}>
        <GuestFormFields data={formData} onField={set} onDoc={setDoc} onAddress={setAddress} domains={domains} requiredMarks />
      </div>

      {embedded && (
        <div style={{ display: "flex", gap: 8, padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${T.border}`, background: T.card, flexShrink: 0 }}>
          <div style={{ flex: 1 }} />
          {actions}
        </div>
      )}
    </div>
  );
}
