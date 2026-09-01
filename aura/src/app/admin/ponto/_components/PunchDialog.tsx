"use client";

// src/app/admin/ponto/_components/PunchDialog.tsx
//
// Lançar uma batida que faltou, ou corrigir uma existente.
//
// O campo é `datetime-local` de propósito: o valor digitado é lido no fuso de
// quem digita e só então convertido para instante absoluto. Um campo de "hora"
// solto obrigaria a inventar a que dia ela pertence — e é exatamente aí que uma
// batida de 23h vira o dia seguinte.
import React, { useEffect, useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import { Button, Dialog, Field, Input, Select, Textarea, T } from "@/components/aura";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { useConfirm } from "@/components/aura/ConfirmDialog";
import { localHM } from "@/lib/timeclock";
import type { TimeClockEvent } from "@/types/aura";

/** Date → "YYYY-MM-DDTHH:MM" no fuso local (o formato que o input espera). */
function toLocalInput(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface PunchDialogState {
  mode: "create" | "edit";
  event?: TimeClockEvent;
  kind: "in" | "out";
  ts: Date;
}

export function PunchDialog({
  state, onClose, onCreate, onAdjust, onDelete,
}: {
  state: PunchDialogState | null;
  onClose: () => void;
  onCreate: (payload: { ts: string; kind: "in" | "out"; note?: string }) => Promise<boolean>;
  onAdjust: (payload: { eventId: string; ts: string; note?: string }) => Promise<boolean>;
  onDelete: (payload: { eventId: string; reason?: string }) => Promise<boolean>;
}) {
  const open = !!state;
  const [kind, setKind] = useState<"in" | "out">("in");
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const { requestClose, guardProps, markDirty } = useCloseGuard(onClose, { open, escape: false });

  useEffect(() => {
    if (!state) return;
    setKind(state.kind);
    setWhen(toLocalInput(state.ts));
    setNote(state.event?.note ?? "");
  }, [state]);

  if (!state) return null;

  const isEdit = state.mode === "edit";
  const event = state.event;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!when) return;
    const ts = new Date(when).toISOString();
    setSaving(true);
    const ok = isEdit && event
      ? await onAdjust({ eventId: event.id, ts, note: note.trim() || undefined })
      : await onCreate({ ts, kind, note: note.trim() || undefined });
    setSaving(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!event) return;
    const confirmed = await confirm({
      title: "Excluir esta batida?",
      description: "Ela sai do cálculo das horas, mas continua no histórico com o motivo e quem excluiu.",
      confirmLabel: "Excluir",
      tone: "danger",
    });
    if (!confirmed) return;
    setSaving(true);
    const ok = await onDelete({ eventId: event.id, reason: note.trim() || undefined });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      presentation="auto"
      size="sm"
      icon={Clock}
      iconTone={isEdit ? "blue" : "brand"}
      title={isEdit ? "Corrigir batida" : "Lançar batida"}
      subtitle={isEdit
        ? "O horário original fica guardado no histórico."
        : "Use quando a batida não foi registrada na hora."}
      panelProps={guardProps}
      footer={
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          {isEdit && (
            <Button type="button" variant="danger" icon={Trash2} onClick={remove} disabled={saving}>
              Excluir
            </Button>
          )}
          <Button type="submit" form="punch-form" variant="primary" fullWidth loading={saving}>
            {isEdit ? "Salvar correção" : "Lançar"}
          </Button>
        </div>
      }
    >
      <form id="punch-form" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!isEdit && (
          <Field label="Tipo">
            <Select value={kind} onChange={e => { markDirty(); setKind(e.target.value as "in" | "out"); }}>
              <option value="in">Entrada</option>
              <option value="out">Saída</option>
            </Select>
          </Field>
        )}

        <Field
          label="Data e hora"
          hint={event?.originalTs ? `Registrada originalmente às ${localHM(event.originalTs)}.` : undefined}
        >
          <Input
            type="datetime-local"
            value={when}
            onChange={e => { markDirty(); setWhen(e.target.value); }}
            required
          />
        </Field>

        <Field label="Motivo" hint="Opcional — ajuda a lembrar por que a hora não bate.">
          <Textarea
            value={note}
            onChange={e => { markDirty(); setNote(e.target.value); }}
            placeholder="Ex.: esqueci de bater na saída"
            rows={2}
            autoGrow
          />
        </Field>

        {isEdit && event && (
          <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
            {event.source === "manual" ? "Lançada à mão" : event.source === "rep" ? "Importada do relógio" : "Registrada no Aura"}
            {event.createdByName ? ` por ${event.createdByName}` : ""}
            {event.editedByName ? ` · corrigida por ${event.editedByName}` : ""}.
          </p>
        )}
      </form>
    </Dialog>
  );
}
