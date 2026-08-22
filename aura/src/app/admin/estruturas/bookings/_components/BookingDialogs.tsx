"use client";

import React from "react";
import { format } from "date-fns";
import { Check, X, Wrench, User, CheckCircle2, Ban } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { Dialog, SegmentedTabs, Field, FieldRow, Input, Select, Textarea, Button, Pill } from "@/components/aura";
import type { useBookings } from "./useBookings";
import { STATUS_LABEL, STATUS_TONE, bookingDisplayName, sortStaysByCabin } from "./bookings-utils";

type Bk = ReturnType<typeof useBookings>;

export function CreateBookingDialog({ bk }: { bk: Bk }) {
  const cfg = bk.selectedConfig;
  const isBlock = bk.bookingType === "maintenance_block";
  return (
    <Dialog
      open={bk.createOpen && !!cfg}
      onClose={() => bk.setCreateOpen(false)}
      presentation="auto"
      size="sm"
      title="Criar agendamento"
      subtitle={cfg ? `${format(bk.currentDate, "dd/MM/yyyy")}${cfg.slot ? ` · ${cfg.slot.startTime} às ${cfg.slot.endTime}` : ""}` : undefined}
      footerRow
      footer={(
        <>
          <Button variant="ghost" onClick={() => bk.setCreateOpen(false)}>Cancelar</Button>
          <Button variant={isBlock ? "danger-solid" : "primary"} icon={isBlock ? Wrench : Check} loading={bk.creating} loadingText="Salvando…" onClick={bk.handleCreateBooking}>
            Confirmar {isBlock ? "bloqueio" : "agendamento"}
          </Button>
        </>
      )}
    >
      <form onSubmit={e => { e.preventDefault(); void bk.handleCreateBooking(); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SegmentedTabs<"booking" | "maintenance_block"> items={[{ id: "booking", label: "Hóspede", icon: User }, { id: "maintenance_block", label: "Bloqueio", icon: Wrench, tone: "red" }]} value={bk.bookingType} onChange={bk.setBookingType} fullWidth ariaLabel="Tipo de agendamento" />

        {cfg?.isFreeTime && (
          <FieldRow cols={2}>
            <Field label="Início" required><Input type="time" required value={bk.freeTimeStart} onChange={e => bk.setFreeTimeStart(e.target.value)} /></Field>
            <Field label="Término" required><Input type="time" required value={bk.freeTimeEnd} onChange={e => bk.setFreeTimeEnd(e.target.value)} /></Field>
          </FieldRow>
        )}

        {isBlock ? (
          <Field label="Nota de bloqueio" required>
            <Input required value={bk.maintenanceNotes} onChange={e => bk.setMaintenanceNotes(e.target.value)} placeholder="Motivo do bloqueio..." />
          </Field>
        ) : (
          <Field label="Hóspede titular da reserva" required hint={bk.activeStays.length === 0 ? <span style={{ color: T.orange }}>Nenhuma estadia ativa encontrada para o decorrer do dia.</span> : undefined}>
            <Select value={bk.guestStayId} onChange={e => bk.setGuestStayId(e.target.value)} required>
              <option value="" disabled>Selecione a estadia hospedada…</option>
              {sortStaysByCabin(bk.activeStays).map(stay => (
                <option key={stay.id} value={stay.id}>{stay.guestName} - {stay.cabinName} (Res: {stay.id.slice(0, 6).toUpperCase()})</option>
              ))}
            </Select>
          </Field>
        )}
        <button type="submit" hidden aria-hidden />
      </form>
    </Dialog>
  );
}

export function CancelBookingDialog({ bk }: { bk: Bk }) {
  const t = bk.cancelTarget;
  return (
    <Dialog
      open={!!t}
      onClose={() => { if (!bk.cancelling) bk.setCancelTarget(null); }}
      presentation="auto"
      size="sm"
      title="Cancelar agendamento"
      subtitle={t ? `${t.booking.guestName} · ${t.booking.startTime} - ${t.booking.endTime}` : undefined}
      footerRow
      footer={(
        <>
          <Button variant="ghost" onClick={() => bk.setCancelTarget(null)} disabled={bk.cancelling}>Voltar</Button>
          <Button variant="danger-solid" icon={X} disabled={!bk.cancelReason.trim()} loading={bk.cancelling} loadingText="Cancelando…" onClick={bk.confirmCancel}>Confirmar cancelamento</Button>
        </>
      )}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>Informe o motivo do cancelamento. Se configurado, o hóspede receberá uma mensagem no WhatsApp.</p>
        <Field label="Motivo do cancelamento" required>
          <Textarea value={bk.cancelReason} onChange={e => bk.setCancelReason(e.target.value)} rows={3} autoGrow autoFocus placeholder="Ex: Condições climáticas adversas, manutenção emergencial..." />
        </Field>
      </div>
    </Dialog>
  );
}

/** Ações de um horário ocupado — substitui o hover (que não existe no toque). */
export function SlotActionsDialog({ bk }: { bk: Bk }) {
  const t = bk.slotTarget;
  const b = t?.booking;
  const busy = !!b && bk.busyBookingId === b.id;
  const isBlock = b?.type === "maintenance_block";
  return (
    <Dialog
      open={!!t}
      onClose={() => bk.setSlotTarget(null)}
      presentation="auto"
      size="sm"
      title={b ? bookingDisplayName(b, bk.activeStays) : ""}
      subtitle={b ? `${t!.structure.name} · ${b.startTime} - ${b.endTime}` : undefined}
    >
      {b && t && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Pill tone={isBlock ? "red" : STATUS_TONE[b.status] ?? "neutral"} label={isBlock ? "Manutenção" : STATUS_LABEL[b.status] ?? b.status} />
            {b.source === "guest" && <Pill tone="brand" label="App hóspede" />}
          </div>
          {b.notes && <p style={{ margin: 0, fontSize: 13, color: T.muted }}>{b.notes}</p>}
          {b.status === "pending" && (
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="primary" icon={Check} fullWidth loading={busy} onClick={() => bk.handleStatusChange(b, "approved", t.structure.requiresTurnover)}>Aprovar</Button>
              <Button variant="danger" icon={X} fullWidth disabled={busy} onClick={() => bk.handleStatusChange(b, "rejected", t.structure.requiresTurnover)}>Rejeitar</Button>
            </div>
          )}
          {(b.status === "approved" || isBlock) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!isBlock && <Button variant="soft" tone="green" icon={CheckCircle2} fullWidth loading={busy} onClick={() => bk.handleStatusChange(b, "completed", t.structure.requiresTurnover)}>Concluir uso</Button>}
              <Button variant="danger" icon={Ban} fullWidth disabled={busy} onClick={() => bk.openCancel(b, t.structure.id, t.structure.requiresTurnover)}>{isBlock ? "Remover bloqueio" : "Cancelar reserva"}</Button>
            </div>
          )}
          {b.status !== "pending" && b.status !== "approved" && !isBlock && (
            <p style={{ margin: 0, fontSize: 12, color: T.muted }}>Sem ações disponíveis para este status.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
