"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { PropertyService } from "@/services/property-service";
import { StructureService } from "@/services/structure-service";
import { Stay, Property, Structure, TimeSlot, StructureBooking } from "@/types/aura";
import { Loader2, ArrowLeft, Calendar, Info, CheckCircle2, ChevronRight, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// --- Theme Helper ---
function hexToHSL(hex: string): string {
    if (!hex) return '0 0% 0%';
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    let r = parseInt(hex.substring(0, 2), 16) / 255;
    let g = parseInt(hex.substring(2, 4), 16) / 255;
    let b = parseInt(hex.substring(4, 6), 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function getThemeStyles(propertyData?: Property | null) {
    const theme = propertyData?.theme;
    if (!theme) return {};
    const c = theme.colors;
    if (!c) return {};
    return {
        '--primary': hexToHSL(c.primary),
        '--primary-foreground': hexToHSL(c.onPrimary),
        '--secondary': hexToHSL(c.secondary),
        '--secondary-foreground': hexToHSL(c.onSecondary),
        '--background': hexToHSL(c.background),
        '--card': hexToHSL(c.surface),
        '--card-foreground': hexToHSL(c.textMain),
        '--foreground': hexToHSL(c.textMain),
        '--muted': hexToHSL(c.secondary),
        '--muted-foreground': hexToHSL(c.textMuted),
        '--accent': hexToHSL(c.accent),
        '--border': hexToHSL(c.accent),
        '--radius': theme.shape?.radius || '0.5rem'
    } as React.CSSProperties;
}

const structuresTranslations = {
    pt: {
        pageTitle: 'Agendamentos', noSpaces: 'Nenhum Espaço',
        noSpacesDesc: 'Nossas áreas comuns não exigem agendamento no momento ou estão indisponíveis.',
        back: 'Voltar', backToPortal: 'Voltar ao Portal',
        confirmedTitle: 'Agendamento Confirmado!', requestedTitle: 'Solicitação Enviada!',
        confirmedDesc: 'Sua reserva do espaço foi confirmada. Aproveite seu momento!',
        requestedDesc: 'Aguarde a confirmação da nossa equipe na recepção via WhatsApp.',
        heroTitle: 'Reserve o seu momento',
        heroDesc: 'Escolha uma de nossas áreas para agendar o seu uso exclusivo.',
        selectDate: 'Data do Agendamento', availableSlots: 'Horários Disponíveis',
        noSlots: 'Nenhum horário disponível para hoje.',
        summaryTitle: 'Resumo da Reserva', space: 'Espaço', date: 'Data', time: 'Horário',
        approvalNotice: 'Este agendamento requer aprovação da recepção. Você será notificado sobre o status.',
        notes: 'Observações', notesPlaceholder: 'Alguma observação especial para a equipe?',
        proceed: 'Prosseguir', confirmBooking: 'Confirmar Reserva', sendRequest: 'Enviar Solicitação',
        selectSlot: 'Selecione o horário desejado para hoje.',
        selectUnit: 'Escolha a unidade', unit: 'Unidade', today: 'Hoje',
    },
    en: {
        pageTitle: 'Reservations', noSpaces: 'No Spaces',
        noSpacesDesc: 'Our common areas do not require booking at the moment or are unavailable.',
        back: 'Back', backToPortal: 'Back to Portal',
        confirmedTitle: 'Booking Confirmed!', requestedTitle: 'Request Sent!',
        confirmedDesc: 'Your space booking has been confirmed. Enjoy your time!',
        requestedDesc: 'Please wait for confirmation from our front desk via WhatsApp.',
        heroTitle: 'Book your moment',
        heroDesc: 'Choose one of our areas to book your exclusive use.',
        selectDate: 'Booking Date', availableSlots: 'Available Times',
        noSlots: 'No time slots available for today.',
        summaryTitle: 'Booking Summary', space: 'Space', date: 'Date', time: 'Time',
        approvalNotice: 'This booking requires front desk approval. You will be notified of the status.',
        notes: 'Notes', notesPlaceholder: 'Any special requests for the team?',
        proceed: 'Continue', confirmBooking: 'Confirm Booking', sendRequest: 'Send Request',
        selectSlot: 'Select the time you prefer for today.',
        selectUnit: 'Choose the unit', unit: 'Unit', today: 'Today',
    },
    es: {
        pageTitle: 'Reservas', noSpaces: 'Sin Espacios',
        noSpacesDesc: 'Nuestras áreas comunes no requieren reserva en este momento o no están disponibles.',
        back: 'Volver', backToPortal: 'Volver al Portal',
        confirmedTitle: '¡Reserva Confirmada!', requestedTitle: '¡Solicitud Enviada!',
        confirmedDesc: '¡Tu reserva del espacio ha sido confirmada. Disfruta tu momento!',
        requestedDesc: 'Espera la confirmación de nuestra recepción vía WhatsApp.',
        heroTitle: 'Reserva tu momento',
        heroDesc: 'Elige una de nuestras áreas para reservar su uso exclusivo.',
        selectDate: 'Fecha de la Reserva', availableSlots: 'Horarios Disponibles',
        noSlots: 'No hay horarios disponibles para hoy.',
        summaryTitle: 'Resumen de la Reserva', space: 'Espacio', date: 'Fecha', time: 'Horario',
        approvalNotice: 'Esta reserva requiere aprobación de recepción. Será notificado del estado.',
        notes: 'Observaciones', notesPlaceholder: '¿Alguna observación especial para el equipo?',
        proceed: 'Continuar', confirmBooking: 'Confirmar Reserva', sendRequest: 'Enviar Solicitud',
        selectSlot: 'Selecciona el horario deseado para hoy.',
        selectUnit: 'Elige la unidad', unit: 'Unidad', today: 'Hoy',
    },
};

function StructuresWizard() {
    const { code } = useParams();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    const [stay, setStay] = useState<Stay | null>(null);
    const [property, setProperty] = useState<Property | null>(null);
    const [structures, setStructures] = useState<Structure[]>([]);

    // Wizard State
    const [step, setStep] = useState<0 | 1 | 2>(0);
    // 0 = Select Structure (+ unit picker sub-view)
    // 1 = Select Time
    // 2 = Confirm

    const [selectedStructure, setSelectedStructure] = useState<Structure | null>(null);
    const [selectedUnit, setSelectedUnit] = useState<{ id: string; name: string; imageUrl?: string } | null>(null);
    const [showUnitPicker, setShowUnitPicker] = useState(false);

    const [selectedDate, setSelectedDate] = useState<string>("");
    const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

    const [notes, setNotes] = useState("");
    const [lang, setLang] = useState<'pt' | 'en' | 'es'>('pt');
    const t = structuresTranslations[lang];

    useEffect(() => {
        async function init() {
            try {
                if (!code) return;
                const stays = await StayService.getStaysByAccessCode(code as string);
                if (!stays || stays.length === 0) return;

                const s = stays[0] as Stay;
                setStay(s);

                try {
                    const stayData = await StayService.getStayWithGuestAndCabin(s.propertyId, s.id);
                    if (stayData?.guest?.preferredLanguage) {
                        setLang(stayData.guest.preferredLanguage as 'pt' | 'en' | 'es');
                    } else {
                        const bl = navigator.language.slice(0, 2);
                        if (bl === 'es') setLang('es');
                        else if (bl === 'en') setLang('en');
                    }
                } catch { /* silently ignore */ }

                const prop = await PropertyService.getPropertyById(s.propertyId);
                if (!prop) return;
                setProperty(prop as Property);

                // Usar API route server-side para não inicializar sessão auth no browser do hóspede
                const res = await fetch(`/api/guest/structures?propertyId=${prop.id}`);
                const allStructures: Structure[] = await res.json();

                const today = new Date();
                setSelectedDate(today.toISOString().split('T')[0]);

                setStructures(allStructures);
                setLoading(false);
            } catch (error) {
                console.error(error);
                toast.error("Erro ao carregar os espaços.");
                setLoading(false);
            }
        }
        init();
    }, [code]);

    // Fetch slots when structure/unit changes (date is always today)
    useEffect(() => {
        async function fetchSlots() {
            if (!property || !selectedStructure || !selectedDate) return;
            try {
                const res = await fetch(
                    `/api/guest/structure-slots?propertyId=${property.id}&structureId=${selectedStructure.id}&date=${selectedDate}`
                );
                const bookings: StructureBooking[] = await res.json();
                const allSlots = StructureService.generateTimeSlots(selectedStructure, bookings, selectedUnit?.id);

                // Filtrar slots com menos de 30 minutos restantes até o fim
                const now = new Date();
                const nowMinutes = now.getHours() * 60 + now.getMinutes();
                const filteredSlots = allSlots.filter(slot => {
                    const [endH, endM] = slot.endTime.split(':').map(Number);
                    return (endH * 60 + endM - nowMinutes) >= 30;
                });

                setAvailableSlots(filteredSlots);
            } catch (e) {
                console.error(e);
            }
        }
        if (step === 1) {
            fetchSlots();
        }
    }, [selectedDate, selectedStructure, selectedUnit, property, step]);

    const handleSelectStructure = (s: Structure) => {
        setSelectedStructure(s);
        setSelectedUnit(null);
        setSelectedSlot(null);
        if (s.units && s.units.length > 0) {
            setShowUnitPicker(true);
        } else {
            setShowUnitPicker(false);
            setStep(1);
        }
    };

    const handleSelectUnit = (unit: { id: string; name: string; imageUrl?: string }) => {
        setSelectedUnit(unit);
        setShowUnitPicker(false);
        setStep(1);
    };

    const handleBack = () => {
        if (step === 2) {
            setStep(1);
        } else if (step === 1) {
            if (selectedStructure?.units && selectedStructure.units.length > 0) {
                setShowUnitPicker(true);
            }
            setStep(0);
        } else if (showUnitPicker) {
            setShowUnitPicker(false);
            setSelectedStructure(null);
        } else {
            router.push(`/check-in/${code}`);
        }
    };

    const submitBooking = async () => {
        if (!stay || !property || !selectedStructure || !selectedDate || !selectedSlot) return;

        setSaving(true);
        try {
            const bookingStatus = selectedStructure.visibility === 'guest_auto_approve' ? 'approved' : 'pending';

            const res = await fetch('/api/guest/structure-bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: property.id,
                    stayId: stay.id,
                    guestId: stay.guestId,
                    booking: {
                        structureId: selectedStructure.id,
                        propertyId: property.id,
                        stayId: stay.id,
                        guestId: stay.guestId,
                        guestName: "Hóspede",
                        date: selectedDate,
                        startTime: selectedSlot.startTime,
                        endTime: selectedSlot.endTime,
                        status: bookingStatus,
                        source: 'guest',
                        type: 'booking',
                        unitId: selectedUnit?.id,
                        notes: selectedStructure.visibility === 'guest_request' ? notes : '',
                    },
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }

            setSuccess(true);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao solicitar agendamento. Pode estar ocupado.");
        } finally {
            setSaving(false);
        }
    };

    if (loading || !property) {
        return (
            <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-50">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
        );
    }

    const themeStyles = getThemeStyles(property);

    if (structures.length === 0) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center" style={themeStyles}>
                <Calendar size={48} className="text-muted-foreground mb-4 opacity-50" />
                <h1 className="text-2xl font-black uppercase">{t.noSpaces}</h1>
                <p className="text-muted-foreground mt-2">{t.noSpacesDesc}</p>
                <button onClick={() => router.push(`/check-in/${code}`)} className="mt-8 px-6 py-3 bg-secondary rounded-xl font-bold uppercase text-xs tracking-widest">
                    {t.back}
                </button>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center" style={themeStyles}>
                <div className="absolute top-0 left-0 w-full h-[30vh] bg-gradient-to-b from-green-500/20 to-background pointer-events-none -z-10"></div>
                <div className="w-24 h-24 bg-green-500 text-white rounded-full flex items-center justify-center mb-6 animate-in zoom-in shadow-xl shadow-green-500/30">
                    <CheckCircle2 size={48} />
                </div>

                {selectedStructure?.visibility === 'guest_auto_approve' ? (
                    <h1 className="text-3xl font-black uppercase tracking-tighter">{t.confirmedTitle}</h1>
                ) : (
                    <h1 className="text-3xl font-black uppercase tracking-tighter">{t.requestedTitle}</h1>
                )}

                <div className="bg-card border border-border p-6 rounded-2xl mt-6">
                    <p className="text-muted-foreground">
                        {selectedStructure?.visibility === 'guest_auto_approve' ? t.confirmedDesc : t.requestedDesc}
                        <br /><br />
                        <strong className="text-foreground">{selectedStructure?.name}</strong>
                        {selectedUnit && <><br /><span className="text-sm">{t.unit}: {selectedUnit.name}</span></>}
                        <br />
                        <strong className="text-foreground">{selectedDate.split('-').reverse().join('/')}</strong> das <strong className="text-foreground">{selectedSlot?.startTime} às {selectedSlot?.endTime}</strong>
                    </p>
                </div>
                <button onClick={() => router.push(`/check-in/${code}`)} className="mt-8 px-8 py-4 w-full max-w-xs bg-primary text-primary-foreground rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl shadow-primary/20">
                    {t.backToPortal}
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-sans relative" style={themeStyles}>
            <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border p-4 flex items-center gap-4">
                <button onClick={handleBack} className="p-2 hover:bg-secondary rounded-full transition-colors">
                    <ArrowLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className="text-lg font-black uppercase tracking-tighter">{t.pageTitle}</h1>
                    {/* Stepper Dots */}
                    <div className="flex items-center gap-1 mt-1">
                        {[0, 1, 2].map(i => (
                            <div key={i} className={cn("h-1 rounded-full transition-all", step >= i ? "w-8 bg-primary" : "w-2 bg-secondary")} />
                        ))}
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 pb-48 w-full max-w-2xl mx-auto space-y-6">

                {/* STEP 0: Select Structure */}
                {step === 0 && !showUnitPicker && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                        <div className="bg-primary text-primary-foreground rounded-3xl p-6 shadow-xl shadow-primary/10 overflow-hidden relative">
                            <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-bl-full translate-x-1/4 -translate-y-1/4 blur-xl"></div>
                            <Calendar size={32} className="mb-4 opacity-80" />
                            <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">{t.heroTitle}</h2>
                            <p className="opacity-90 leading-relaxed text-sm">{t.heroDesc}</p>
                        </div>

                        <div className="grid gap-4">
                            {structures.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => handleSelectStructure(s)}
                                    className="bg-card border border-border p-5 rounded-3xl flex items-center gap-4 text-left hover:border-primary/50 hover:shadow-md transition-all group"
                                >
                                    {s.imageUrl ? (
                                        <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-secondary">
                                            <img src={s.imageUrl} alt={s.name} className="w-full h-full object-cover" />
                                        </div>
                                    ) : (
                                        <div className="w-12 h-12 bg-secondary rounded-2xl flex items-center justify-center shrink-0">
                                            <MapPin size={24} className="text-muted-foreground group-hover:text-primary transition-colors" />
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <h3 className="font-black text-lg">{s.name}</h3>
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description || "Nenhuma descrição."}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-[10px] bg-secondary px-2 py-0.5 rounded font-bold uppercase tracking-widest text-muted-foreground">
                                                {s.operatingHours?.slotDurationMinutes} min
                                            </span>
                                            {s.units && s.units.length > 0 && (
                                                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-widest">
                                                    {s.units.length}x
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 0 — Sub-etapa: Seleção de Unidade */}
                {step === 0 && showUnitPicker && selectedStructure && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                        <div className="border-b border-border pb-4">
                            <h2 className="text-xl font-black uppercase tracking-tighter">{selectedStructure.name}</h2>
                            <p className="text-xs text-muted-foreground mt-1">{t.selectUnit}</p>
                        </div>

                        <div className="grid gap-4">
                            {selectedStructure.units!.map(unit => (
                                <button
                                    key={unit.id}
                                    onClick={() => handleSelectUnit(unit)}
                                    className="bg-card border border-border p-5 rounded-3xl flex items-center gap-4 text-left hover:border-primary/50 hover:shadow-md transition-all group"
                                >
                                    {unit.imageUrl ? (
                                        <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-secondary">
                                            <img src={unit.imageUrl} alt={unit.name} className="w-full h-full object-cover" />
                                        </div>
                                    ) : (
                                        <div className="w-12 h-12 bg-secondary rounded-2xl flex items-center justify-center shrink-0">
                                            <MapPin size={24} className="text-muted-foreground group-hover:text-primary transition-colors" />
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <h3 className="font-black text-lg">{unit.name}</h3>
                                    </div>
                                    <ChevronRight size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 1: Select Time (data sempre = hoje) */}
                {step === 1 && selectedStructure && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500 relative">
                        <div className="border-b border-border pb-4">
                            <h2 className="text-xl font-black uppercase tracking-tighter">{selectedStructure.name}</h2>
                            {selectedUnit && (
                                <p className="text-xs font-bold text-primary mt-0.5">{t.unit}: {selectedUnit.name}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">{t.selectSlot}</p>
                        </div>

                        {/* Data fixa — hoje */}
                        <div className="flex items-center gap-3 bg-secondary/50 border border-border rounded-2xl px-4 py-3">
                            <Calendar size={18} className="text-primary shrink-0" />
                            <div>
                                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{t.selectDate}</p>
                                <p className="font-black text-sm text-foreground">
                                    {t.today} — {selectedDate.split('-').reverse().join('/')}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{t.availableSlots} ({selectedStructure.operatingHours?.slotDurationMinutes}m)</label>

                            {availableSlots.length > 0 ? (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                    {availableSlots.map(slot => (
                                        <button
                                            key={slot.startTime}
                                            disabled={!slot.available}
                                            onClick={() => setSelectedSlot(slot)}
                                            className={cn(
                                                "py-3 rounded-xl font-bold text-sm transition-all border-2 flex flex-col items-center gap-1",
                                                !slot.available ? "opacity-30 bg-secondary border-transparent cursor-not-allowed" :
                                                    selectedSlot?.startTime === slot.startTime ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-secondary text-foreground hover:bg-secondary/80"
                                            )}
                                        >
                                            <Clock size={16} className={!slot.available ? "opacity-50" : selectedSlot?.startTime === slot.startTime ? "text-primary" : "text-muted-foreground"} />
                                            <span>{slot.startTime}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-secondary/50 border border-border p-6 rounded-2xl text-center">
                                    <p className="text-sm font-bold text-muted-foreground">{t.noSlots}</p>
                                </div>
                            )}
                        </div>

                        <div className="h-20"></div>
                    </div>
                )}

                {/* STEP 2: Confirm */}
                {step === 2 && selectedStructure && selectedSlot && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                            <h2 className="text-xl font-black uppercase tracking-tighter mb-4 border-b border-border pb-2">{t.summaryTitle}</h2>

                            <div className="space-y-4">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.space}</p>
                                    <p className="font-black text-lg">{selectedStructure.name}</p>
                                    {selectedUnit && (
                                        <p className="text-sm font-bold text-primary">{t.unit}: {selectedUnit.name}</p>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.date}</p>
                                        <p className="font-bold">{selectedDate.split('-').reverse().join('/')}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.time}</p>
                                        <p className="font-black text-primary">{selectedSlot.startTime} — {selectedSlot.endTime}</p>
                                    </div>
                                </div>
                                {selectedStructure.visibility === 'guest_request' && (
                                    <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl flex gap-3 text-orange-600 dark:text-orange-400">
                                        <Info size={16} className="shrink-0 mt-0.5" />
                                        <p className="text-xs font-semibold">{t.approvalNotice}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Observações — apenas para pedidos que requerem aprovação */}
                        {selectedStructure.visibility === 'guest_request' && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest ml-2">{t.notes}</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full bg-card border border-border p-4 rounded-2xl outline-none focus:border-primary/50 text-sm resize-none h-24"
                                    placeholder={t.notesPlaceholder}
                                />
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Bottom Floating Bar */}
            {(step === 1 || step === 2) && (
                <div className="fixed bottom-0 left-0 w-full bg-background/90 backdrop-blur-xl border-t border-border p-4 z-50 animate-in slide-in-from-bottom-12">
                    <div className="max-w-2xl mx-auto">
                        {step === 1 && (
                            <button
                                onClick={() => setStep(2)}
                                disabled={!selectedSlot}
                                className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest flex items-center justify-between px-6 shadow-xl shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:shadow-none"
                            >
                                <span>{t.proceed}</span>
                                <ChevronRight size={20} />
                            </button>
                        )}
                        {step === 2 && (
                            <button
                                onClick={submitBooking}
                                disabled={saving}
                                className="w-full py-4 bg-green-500 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-green-500/20 hover:bg-green-600 transition-all disabled:opacity-50 disabled:shadow-none"
                            >
                                {saving ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle2 size={24} />}
                                <span>{selectedStructure?.visibility === 'guest_auto_approve' ? t.confirmBooking : t.sendRequest}</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function GuestStructuresPage() {
    return (
        <Suspense fallback={
            <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        }>
            <StructuresWizard />
        </Suspense>
    );
}
