"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Layers, Palette, Save } from "lucide-react";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { T, alpha } from "@/lib/admin-tokens";
import { Dialog, Button, Field, FieldRow, Input, useThemeName } from "@/components/aura";
import type { GroupForm } from "./concierge-utils";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

/** Grupo do catálogo: emoji, nome, cor e ordem. */
export function GroupFormModal({ open, form, setForm, editingId, saving, onClose, onSave }: {
  open: boolean; form: GroupForm; setForm: React.Dispatch<React.SetStateAction<GroupForm>>; editingId: string | null; saving: boolean; onClose: () => void; onSave: () => void;
}) {
  const themeName = useThemeName();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  const { requestClose, guardProps } = useCloseGuard(onClose, { open, dirty: dirty && !saving, escape: false });

  useEffect(() => { if (open) { setDirty(false); setEmojiOpen(false); } }, [open]);
  useEffect(() => {
    if (!emojiOpen) return;
    const handler = (e: MouseEvent) => { if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emojiOpen]);

  const patch = (p: Partial<GroupForm>) => { setDirty(true); setForm(prev => ({ ...prev, ...p })); };
  const canSave = form.name.trim().length > 0;

  return (
    <Dialog open={open} onClose={saving ? () => {} : requestClose} presentation="auto" size="sm" icon={Layers} iconTone="brand" title={editingId ? "Editar grupo" : "Novo grupo"} subtitle="Grupos organizam os itens do catálogo" panelProps={guardProps}
      footer={(
        <>
          <Button variant="secondary" onClick={requestClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" icon={Save} onClick={onSave} disabled={!canSave} loading={saving}>{editingId ? "Salvar" : "Criar grupo"}</Button>
        </>
      )}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div ref={emojiRef} style={{ position: "relative", flexShrink: 0 }}>
            <button type="button" onClick={() => setEmojiOpen(p => !p)} className="ak-press ak-focus" aria-label="Escolher emoji" style={{ width: 56, height: 56, borderRadius: 16, background: T.glass2, border: `2px solid ${T.g1Border}`, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {form.icon}
            </button>
            {emojiOpen && (
              <div className="ak-fade-in" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 5 }}>
                <EmojiPicker onEmojiClick={d => { patch({ icon: d.emoji }); setEmojiOpen(false); }} theme={themeName as never} skinTonesDisabled searchPlaceholder="Buscar…" width={300} height={340} previewConfig={{ showPreview: false }} />
              </div>
            )}
          </div>
          <Field label="Nome do grupo" required style={{ flex: 1 }}>
            <Input value={form.name} onChange={e => patch({ name: e.target.value })} placeholder="Ex.: Lavanderia" autoFocus />
          </Field>
        </div>
        <FieldRow cols={2}>
          <Field label="Cor do grupo">
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 10px", borderRadius: 10, background: T.glass, border: `1px solid ${T.border2}` }}>
              <Palette size={13} color={T.muted} />
              <input type="color" value={form.color} onChange={e => patch({ color: e.target.value })} aria-label="Cor" style={{ width: 28, height: 26, border: "none", background: "none", cursor: "pointer", padding: 0 }} />
              <span style={{ fontSize: 12, color: T.muted, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{form.color}</span>
            </div>
          </Field>
          <Field label="Ordem"><Input type="number" min={0} inputMode="numeric" value={form.order} onChange={e => patch({ order: e.target.value })} /></Field>
        </FieldRow>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: form.color ? alpha(form.color, 8) : T.glass, border: `1px solid ${form.color ? alpha(form.color, 25) : T.border}` }}>
          <span style={{ fontSize: 18 }}>{form.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: form.color || T.text }}>{form.name || "Nome do grupo"}</span>
        </div>
      </div>
    </Dialog>
  );
}
