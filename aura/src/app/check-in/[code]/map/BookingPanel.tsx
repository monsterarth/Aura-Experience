"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Clock, CheckCircle2, Info, Lock } from "lucide-react";
import { toast } from "sonner";
import { StructureService } from "@/services/structure-service";
import { Stay, Property, TimeSlot, StructureBooking } from "@/types/aura";
import { MapArea, MapLang } from "./types";
import { localizedName } from "./utils/localize";

const T: Record<MapLang, Record<string, string>> = {
    pt: {
        today: "Hoje", schedule: "Agenda do dia", noSlots: "Nenhum horário disponível hoje.",
        unit: "Unidade", book: "Reservar", request: "Solicitar", booking: "Reservando…",
        approval: "Esta área requer aprovação da recepção.",
        confirmedTitle: "Reserva confirmada!", requestedTitle: "Solicitação enviada!",
        confirmedDesc: "Aproveite seu momento!", requestedDesc: "Aguarde a confirmação via WhatsApp.",
        bookAnother: "Reservar outro horário", closed: "Encerrado", error: "Erro ao reservar. Tente outro horário.",
        locked: "Aguardando liberação da recepção",
        lockedDesc: "Esta área é preparada diariamente antes de liberar. Assim que estiver pronta, a recepção libera a reserva.",
    },
    en: {
        today: "Today", schedule: "Today's schedule", noSlots: "No slots available today.",
        unit: "Unit", book: "Book", request: "Request", booking: "Booking…",
        approval: "This area requires front desk approval.",
        confirmedTitle: "Booking confirmed!", requestedTitle: "Request sent!",
        confirmedDesc: "Enjoy your time!", requestedDesc: "Please wait for confirmation via WhatsApp.",
        bookAnother: "Book another time", closed: "Closed", error: "Booking failed. Try another time.",
        locked: "Awaiting front desk release",
        lockedDesc: "This area is prepared daily before it opens. The front desk will release booking once it's ready.",
    },
    es: {
        today: "Hoy", schedule: "Agenda del día", noSlots: "No hay horarios disponibles hoy.",
        unit: "Unidad", book: "Reservar", request: "Solicitar", booking: "Reservando…",
        approval: "Esta área requiere aprobación de recepción.",
        confirmedTitle: "¡Reserva confirmada!", requestedTitle: "¡Solicitud enviada!",
        confirmedDesc: "¡Disfruta tu momento!", requestedDesc: "Espera la confirmación vía WhatsApp.",
        bookAnother: "Reservar otro horario", closed: "Cerrado", error: "Error al reservar. Prueba otro horario.",
        locked: "Esperando liberación de recepción",
        lockedDesc: "Esta área se prepara cada día antes de abrir. Recepción liberará la reserva cuando esté lista.",
    },
};

interface BookingPanelProps {
    area: MapArea;
    stay: Stay;
    property: Property;
    lang: MapLang;
    onBooked?: () => void;
}

export function BookingPanel({ area, stay, property, lang, onBooked }: BookingPanelProps) {
    const t = T[lang];
    const today = new Date().toISOString().split("T")[0];

    // Liberação diária: bloqueada para o hóspede até a recepção liberar para hoje.
    const awaitingRelease = !!area.requiresDailyRelease && area.releasedForDate !== today;

    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<TimeSlot | null>(null);
    const [unit, setUnit] = useState<{ id: string; name: string } | null>(
        area.units && area.units.length > 0 ? area.units[0] : null
    );
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    const loadSlots = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/guest/structure-slots?propertyId=${property.id}&structureId=${area.id}&date=${today}`);
            const bookings: StructureBooking[] = await res.json();
            setSlots(StructureService.generateTimeSlots(area, bookings, unit?.id));
            setSelected(null);
        } catch {
            toast.error(t.error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSlots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [area.id, unit?.id]);

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const isPast = (slot: TimeSlot) => {
        const [h, m] = slot.endTime.split(":").map(Number);
        return (h * 60 + m) - nowMinutes < 30;
    };

    const submit = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const status = area.visibility === "guest_auto_approve" ? "approved" : "pending";
            const res = await fetch("/api/guest/structure-bookings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    propertyId: property.id,
                    stayId: stay.id,
                    guestId: stay.guestId,
                    timezoneOffset: new Date().getTimezoneOffset(),
                    booking: {
                        structureId: area.id,
                        propertyId: property.id,
                        stayId: stay.id,
                        guestId: stay.guestId,
                        guestName: "Hóspede",
                        date: today,
                        startTime: selected.startTime,
                        endTime: selected.endTime,
                        status,
                        source: "guest",
                        type: "booking",
                        unitId: unit?.id,
                        notes: "",
                    },
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            setSuccess(true);
            onBooked?.();
        } catch (e: any) {
            toast.error(e?.message || t.error);
        } finally {
            setSaving(false);
        }
    };

    if (success) {
        const auto = area.visibility === "guest_auto_approve";
        return (
            <div className="flex flex-col items-center text-center py-8 px-4">
                <div className="w-16 h-16 bg-green-500 text-white rounded-full flex items-center justify-center mb-4 animate-in zoom-in shadow-lg shadow-green-500/30">
                    <CheckCircle2 size={32} />
                </div>
                <h3 className="text-lg font-black">{auto ? t.confirmedTitle : t.requestedTitle}</h3>
                <p className="text-sm text-muted-foreground mt-1">{auto ? t.confirmedDesc : t.requestedDesc}</p>
                <p className="font-bold mt-3">{localizedName(area, lang)} · {selected?.startTime}–{selected?.endTime}</p>
                <button
                    onClick={() => { setSuccess(false); loadSlots(); }}
                    className="mt-5 text-xs font-bold uppercase tracking-wider text-primary"
                >
                    {t.bookAnother}
                </button>
            </div>
        );
    }

    if (awaitingRelease) {
        return (
            <div className="flex flex-col items-center text-center py-8 px-4">
                <div className="w-16 h-16 bg-secondary text-muted-foreground rounded-full flex items-center justify-center mb-4">
                    <Lock size={28} />
                </div>
                <h3 className="text-base font-black text-foreground">{t.locked}</h3>
                <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">{t.lockedDesc}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Unidade (se houver) */}
            {area.units && area.units.length > 0 && (
                <div>
                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{t.unit}</label>
                    <select
                        value={unit?.id ?? ""}
                        onChange={e => setUnit(area.units!.find(u => u.id === e.target.value) ?? null)}
                        className="w-full mt-1 bg-card border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                    >
                        {area.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </div>
            )}

            <div className="flex items-center gap-2 bg-secondary/50 border border-border rounded-xl px-3 py-2">
                <Clock size={15} className="text-primary shrink-0" />
                <span className="text-xs font-bold">{t.schedule} · {t.today}</span>
            </div>

            {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
            ) : slots.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t.noSlots}</p>
            ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slots.map(slot => {
                        const past = isPast(slot);
                        const disabled = !slot.available || past;
                        const isSel = selected?.startTime === slot.startTime;
                        return (
                            <button
                                key={slot.startTime}
                                disabled={disabled}
                                onClick={() => setSelected(slot)}
                                className={`py-2.5 rounded-xl font-bold text-sm border-2 flex flex-col items-center gap-0.5 transition-all ${disabled
                                    ? "border-transparent bg-secondary text-muted-foreground opacity-30 cursor-not-allowed"
                                    : isSel
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-transparent bg-secondary text-foreground hover:bg-secondary/70"}`}
                            >
                                <span className="font-mono text-xs">{slot.startTime}</span>
                                {past && <span className="text-[8px] font-black uppercase">{t.closed}</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            {area.visibility === "guest_request" && (
                <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl flex gap-2 text-orange-600 dark:text-orange-400">
                    <Info size={15} className="shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold">{t.approval}</p>
                </div>
            )}

            <button
                onClick={submit}
                disabled={!selected || saving}
                className="w-full py-3.5 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-40 disabled:shadow-none transition-all"
            >
                {saving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                {saving ? t.booking : area.visibility === "guest_auto_approve" ? t.book : t.request}
            </button>
        </div>
    );
}
