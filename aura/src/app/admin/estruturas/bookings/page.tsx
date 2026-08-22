"use client";

import React from "react";
import { format, addDays, subDays, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, Plus, Info, Wrench, Lock, Unlock, User, X, Building2 } from "lucide-react";
import { StructureService } from "@/services/structure-service";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import { PageShell, PageHeader, Card, Button, IconButton, Pill, Loadable, SkeletonList, EmptyState, ErrorState } from "@/components/aura";
import { useBookings } from "./_components/useBookings";
import { CreateBookingDialog, CancelBookingDialog, SlotActionsDialog } from "./_components/BookingDialogs";
import { STATUS_LABEL, STATUS_TONE, bookingDisplayName } from "./_components/bookings-utils";

export default function StructureBookingsPage() {
  const bk = useBookings();
  const dateStr = format(bk.currentDate, "yyyy-MM-dd");

  if (!bk.currentProperty) return <PageShell><EmptyState icon={Building2} title="Selecione uma propriedade" /></PageShell>;

  return (
    <PageShell>
      <PageHeader
        icon={CalendarDays}
        title="Agenda de Estruturas"
        subtitle="Spas, quadras e demais utilidades — horários do dia"
        actions={(
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconButton icon={ChevronLeft} label="Dia anterior" variant="secondary" onClick={() => bk.setCurrentDate(subDays(bk.currentDate, 1))} />
            <div style={{ minWidth: 150, textAlign: "center", fontSize: 13, fontWeight: 800, color: T.text }}>
              {(() => { const s = format(bk.currentDate, "EEE, dd 'de' MMM", { locale: ptBR }); return s.charAt(0).toUpperCase() + s.slice(1); })()}
            </div>
            <IconButton icon={ChevronRight} label="Próximo dia" variant="secondary" onClick={() => bk.setCurrentDate(addDays(bk.currentDate, 1))} />
            {!isToday(bk.currentDate) && <Button variant="ghost" size="sm" onClick={() => bk.setCurrentDate(new Date())}>Hoje</Button>}
          </div>
        )}
      />

      <Loadable loading={bk.loading} skeleton={<SkeletonList rows={4} avatar={false} />} error={bk.error} onRetry={() => void bk.reload()}>
        {bk.structures.length === 0 ? (
          <EmptyState icon={MapPin} title="Nenhuma estrutura cadastrada" description="Cadastre spas, quadras e salas em Estruturas para agendar horários." action={{ label: "Ir para Estruturas", href: "/admin/estruturas" }} />
        ) : bk.structures.map(structure => {
          const hasUnits = !!(structure.units && structure.units.length > 0);
          const items = hasUnits
            ? structure.units!.map(u => ({ unitId: u.id as string | undefined, unitName: u.name, imageUrl: u.imageUrl }))
            : [{ unitId: undefined as string | undefined, unitName: structure.name, imageUrl: structure.imageUrl }];
          const releasedToday = structure.releasedForDate === dateStr;
          const structBookings = bk.bookings.filter(b => b.structureId === structure.id);

          return (
            <Card key={structure.id} pad={0} style={{ overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: T.glass }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 11, background: toneOf("brand").bg, border: `1px solid ${toneOf("brand").border}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.brandText, flexShrink: 0 }}><MapPin size={16} /></span>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: T.text }}>{structure.name}</h2>
                    <p style={{ margin: 0, fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 800 }}>
                      {structure.bookingType === "free_time" ? "Horário livre" : `${structure.operatingHours.slotDurationMinutes} min / uso`}
                    </p>
                  </div>
                </div>
                {structure.requiresDailyRelease && (
                  releasedToday
                    ? <Button variant="soft" tone="green" size="sm" icon={Unlock} onClick={() => bk.handleToggleRelease(structure, false)} title="Clique para bloquear novamente">Liberada para uso</Button>
                    : <Button variant="soft" tone="orange" size="sm" icon={Lock} onClick={() => bk.handleToggleRelease(structure, true)} title="Bloqueada até a recepção liberar">Liberar para uso</Button>
                )}
              </div>

              <div>
                {items.map((item, idx) => {
                  const itemBookings = structBookings.filter(b => (item.unitId ? b.unitId === item.unitId : !b.unitId));
                  const slots = structure.bookingType === "fixed_slots" ? StructureService.generateTimeSlots(structure, structBookings, item.unitId) : [];
                  return (
                    <div key={item.unitId || idx} style={{ padding: 16, borderTop: idx > 0 ? `1px solid ${T.border}` : undefined, display: "flex", flexDirection: "column", gap: 14 }}>
                      {hasUnits && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, alignSelf: "flex-start", padding: "6px 12px 6px 6px", borderRadius: 14, background: T.glass, border: `1px solid ${T.border}` }}>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
                          ) : (
                            <span style={{ width: 36, height: 36, borderRadius: 10, background: T.card, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted }}><MapPin size={14} /></span>
                          )}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{item.unitName}</div>
                            <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: ".1em" }}>Unidade</div>
                          </div>
                        </div>
                      )}

                      {structure.bookingType === "free_time" ? (
                        <Button variant="outline" icon={Plus} onClick={() => bk.openCreate(structure.id, item.unitId, true)} style={{ alignSelf: "flex-start" }}>Nova reserva manual</Button>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-2">
                          {slots.map((slot, sIdx) => {
                            const booking = slot.bookingId ? itemBookings.find(b => b.id === slot.bookingId) : null;
                            if (slot.available) {
                              return (
                                <button key={sIdx} type="button" className="ak-press ak-focus" onClick={() => bk.openCreate(structure.id, item.unitId, false, slot)}
                                  style={{ minHeight: 56, padding: 8, borderRadius: 12, border: `1px dashed ${T.border2}`, background: T.glass, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" }}>{slot.startTime}</span>
                                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>Livre</span>
                                </button>
                              );
                            }
                            if (!booking) return null;
                            const isBlock = booking.type === "maintenance_block";
                            const tn = toneOf(isBlock ? "red" : STATUS_TONE[booking.status] ?? "neutral");
                            return (
                              <button key={sIdx} type="button" className="ak-press ak-focus" onClick={() => bk.setSlotTarget({ booking, structure })} aria-label={`${booking.startTime} ${bookingDisplayName(booking, bk.activeStays, true)}`}
                                style={{ minHeight: 56, padding: 8, borderRadius: 12, border: `1px solid ${tn.border}`, background: tn.bg, color: tn.color, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, minWidth: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{booking.startTime}</span>
                                <span style={{ fontSize: 10, fontWeight: 800, width: "100%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                  {isBlock && <Wrench size={10} />}{bookingDisplayName(booking, bk.activeStays, true)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {itemBookings.length > 0 && (
                        <div style={{ paddingTop: 14, borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
                          <h3 style={{ margin: 0, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted }}>Agenda do dia ({itemBookings.length})</h3>
                          {itemBookings.map(b => {
                            const isBlock = b.type === "maintenance_block";
                            const canCancel = structure.bookingType === "free_time" && (b.status === "approved" || isBlock);
                            return (
                              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderRadius: 12, border: `1px solid ${isBlock ? T.redBorder : T.border}`, background: isBlock ? T.redBg : T.glass }}>
                                <Pill tone={isBlock ? "red" : STATUS_TONE[b.status] ?? "neutral"} label={isBlock ? "Manutenção" : STATUS_LABEL[b.status] ?? b.status} />
                                <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" }}>{b.startTime} – {b.endTime}</span>
                                <span style={{ fontSize: 13, color: T.text, display: "inline-flex", alignItems: "center", gap: 6 }}>
                                  {isBlock ? <Wrench size={13} color={T.red} /> : <User size={13} color={T.muted} />}{bookingDisplayName(b, bk.activeStays)}
                                </span>
                                {b.notes && <span style={{ fontSize: 12, color: T.muted, display: "inline-flex", alignItems: "center", gap: 4 }}><Info size={12} /> {b.notes}</span>}
                                {b.source === "guest" && <Pill tone="brand" label="App hóspede" />}
                                {canCancel && <IconButton icon={X} label="Cancelar" variant="ghost" tone="red" size="sm" onClick={() => bk.openCancel(b, structure.id, structure.requiresTurnover)} style={{ marginLeft: "auto" }} />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </Loadable>

      <CreateBookingDialog bk={bk} />
      <CancelBookingDialog bk={bk} />
      <SlotActionsDialog bk={bk} />
    </PageShell>
  );
}
