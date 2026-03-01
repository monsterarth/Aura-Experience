"use client";

import React, { useState, useEffect } from "react";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar, Check, X, Clock, MapPin, User, Plus, Info, Wrench } from "lucide-react";
import { toast } from "sonner";
import { StructureService } from "@/services/structure-service";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { Structure, StructureBooking, TimeSlot } from "@/types/aura";
import { cn } from "@/lib/utils";

type ModalState = {
    structureId: string;
    unitId?: string;
    isFreeTime?: boolean;
    slot?: TimeSlot;
};

export default function StructureBookingsPage() {
    const { currentProperty } = useProperty();
    const { userData } = useAuth();

    const [currentDate, setCurrentDate] = useState(new Date());

    const [structures, setStructures] = useState<Structure[]>([]);
    const [bookings, setBookings] = useState<StructureBooking[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedConfig, setSelectedConfig] = useState<ModalState | null>(null);

    const [bookingType, setBookingType] = useState<'booking' | 'maintenance_block'>('booking');
    const [guestName, setGuestName] = useState("");
    const [maintenanceNotes, setMaintenanceNotes] = useState("");
    const [freeTimeStart, setFreeTimeStart] = useState("");
    const [freeTimeEnd, setFreeTimeEnd] = useState("");

    useEffect(() => {
        if (currentProperty) fetchData();
    }, [currentProperty, currentDate]);

    const fetchData = async () => {
        if (!currentProperty) return;
        setLoading(true);
        try {
            const dateStr = format(currentDate, "yyyy-MM-dd");

            const [allStructures, allBookings] = await Promise.all([
                StructureService.getStructures(currentProperty.id),
                StructureService.getAllBookingsByDate(currentProperty.id, dateStr)
            ]);

            setStructures(allStructures);
            setBookings(allBookings);
        } catch (error) {
            toast.error("Erro ao carregar agenda.");
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (booking: StructureBooking, newStatus: StructureBooking['status'], structureRequiresTurnover: boolean) => {
        if (!currentProperty || !userData) return;
        try {
            await StructureService.updateBookingStatus(
                currentProperty.id,
                booking.id,
                newStatus,
                userData.id,
                userData.fullName,
                structureRequiresTurnover,
                booking.structureId
            );
            toast.success(`Reserva ${newStatus === 'approved' ? 'Aprovada' : newStatus === 'rejected' ? 'Rejeitada' : newStatus === 'completed' ? 'Finalizada' : 'Cancelada'}`);
            fetchData();
        } catch (error) {
            toast.error("Erro ao atualizar reserva.");
        }
    };

    const handleCreateBooking = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentProperty || !userData || !selectedConfig) return;

        let startTime = selectedConfig.slot?.startTime;
        let endTime = selectedConfig.slot?.endTime;

        if (selectedConfig.isFreeTime) {
            if (!freeTimeStart || !freeTimeEnd) return toast.error("Preencha os horários.");
            const hasOverlap = StructureService.checkOverlap(
                freeTimeStart, freeTimeEnd,
                bookings.filter(b => b.structureId === selectedConfig.structureId),
                selectedConfig.unitId
            );
            if (hasOverlap) return toast.error("Este horário coincide com outra reserva ou bloqueio.");

            startTime = freeTimeStart;
            endTime = freeTimeEnd;
        }

        try {
            await StructureService.createBooking(
                currentProperty.id,
                {
                    structureId: selectedConfig.structureId,
                    propertyId: currentProperty.id,
                    unitId: selectedConfig.unitId,
                    type: bookingType,
                    date: format(currentDate, "yyyy-MM-dd"),
                    startTime: startTime!,
                    endTime: endTime!,
                    status: 'approved',
                    source: 'admin',
                    guestName: bookingType === 'booking' ? guestName : "Manutenção",
                    notes: bookingType === 'maintenance_block' ? maintenanceNotes : "Reserva Manual Adm"
                },
                userData.id,
                userData.fullName
            );
            toast.success("Horário agendado com sucesso!");
            setIsModalOpen(false);
            setGuestName("");
            setMaintenanceNotes("");
            setFreeTimeStart("");
            setFreeTimeEnd("");
            fetchData();
        } catch (error) {
            toast.error("Erro ao criar agendamento.");
        }
    };

    const openModal = (structureId: string, unitId?: string, isFreeTime: boolean = false, slot?: TimeSlot) => {
        setSelectedConfig({ structureId, unitId, isFreeTime, slot });
        setBookingType('booking');
        setGuestName("");
        setMaintenanceNotes("");
        setFreeTimeStart("");
        setFreeTimeEnd("");
        setIsModalOpen(true);
    };

    const statusColors: any = {
        pending: "bg-orange-500/20 text-orange-600 border-orange-500/30",
        approved: "bg-blue-500/20 text-blue-600 border-blue-500/30",
        completed: "bg-green-500/20 text-green-600 border-green-500/30",
        rejected: "bg-red-500/20 text-red-600 border-red-500/30",
        cancelled: "bg-zinc-500/20 text-zinc-500 border-zinc-500/30",
    };

    const statusLabels: any = {
        pending: "Aprovação Pendente",
        approved: "Agendado",
        completed: "Finalizado",
        rejected: "Rejeitado",
        cancelled: "Cancelado",
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Agenda de Estruturas</h1>
                    <p className="text-muted-foreground mt-1">Gerencie os horários de spas, quadras e demais utilidades.</p>
                </div>

                <div className="flex items-center bg-secondary/80 border border-border rounded-xl p-1 shadow-inner">
                    <button onClick={() => setCurrentDate(subDays(currentDate, 1))} className="p-2 hover:bg-background rounded-lg text-muted-foreground hover:text-foreground transition-all"><ChevronLeft size={20} /></button>
                    <div className="px-6 py-2 min-w-[200px] text-center font-bold text-sm text-foreground flex items-center justify-center gap-2">
                        <Calendar size={16} className="text-primary" />
                        {format(currentDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                    </div>
                    <button onClick={() => setCurrentDate(addDays(currentDate, 1))} className="p-2 hover:bg-background rounded-lg text-muted-foreground hover:text-foreground transition-all"><ChevronRight size={20} /></button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-muted-foreground text-sm font-medium animate-pulse">Carregando horários...</div>
            ) : structures.length === 0 ? (
                <div className="text-center py-20 bg-secondary/30 rounded-3xl border border-dashed border-border">
                    <p className="text-muted-foreground">Você ainda não tem estruturas cadastradas na propriedade.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {structures.map(structure => {
                        const hasUnits = structure.units && structure.units.length > 0;
                        const itemsToRender = hasUnits
                            ? structure.units!.map(u => ({ unitId: u.id, unitName: u.name, imageUrl: u.imageUrl }))
                            : [{ unitId: undefined, unitName: structure.name, imageUrl: structure.imageUrl }];

                        return (
                            <div key={structure.id} className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                                <header className="px-6 py-4 bg-secondary/50 border-b border-border flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <MapPin size={24} className="text-primary" />
                                        <div>
                                            <h2 className="font-bold text-lg text-foreground">{structure.name}</h2>
                                            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                                                {structure.bookingType === 'free_time' ? 'Horário Livre' : `${structure.operatingHours.slotDurationMinutes} min / uso`}
                                            </p>
                                        </div>
                                    </div>
                                </header>

                                <div className="divide-y divide-border">
                                    {itemsToRender.map((item, idx) => {
                                        const itemBookings = bookings.filter(b => b.structureId === structure.id && (item.unitId ? b.unitId === item.unitId : !b.unitId));

                                        const slots = structure.bookingType === 'fixed_slots'
                                            ? StructureService.generateTimeSlots(structure, bookings.filter(b => b.structureId === structure.id), item.unitId)
                                            : [];

                                        return (
                                            <div key={item.unitId || idx} className="p-6">
                                                {/* Header da Unidade (Se houver múltiplas) */}
                                                {hasUnits && (
                                                    <div className="flex items-center gap-3 mb-6 bg-secondary/30 p-3 rounded-2xl border border-border w-fit pl-2">
                                                        {item.imageUrl ? (
                                                            <img src={item.imageUrl} alt={item.unitName} className="w-10 h-10 rounded-xl object-cover" />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center">
                                                                <MapPin size={16} className="text-muted-foreground" />
                                                            </div>
                                                        )}
                                                        <div className="pr-4">
                                                            <h3 className="font-bold text-sm text-foreground">{item.unitName}</h3>
                                                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Unidade</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* MODO FREE_TIME */}
                                                {structure.bookingType === 'free_time' ? (
                                                    <div className="flex justify-start">
                                                        <button onClick={() => openModal(structure.id, item.unitId, true)} className="flex items-center gap-2 px-6 py-4 border border-dashed border-primary/50 rounded-2xl text-primary font-bold hover:bg-primary/5 transition-colors">
                                                            <Plus size={18} /> Cadastrar Nova Reserva Manual
                                                        </button>
                                                    </div>
                                                ) : (
                                                    /* MODO FIXED_SLOTS */
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                                        {slots.map((slot, sIdx) => {
                                                            const booking = slot.bookingId ? itemBookings.find(b => b.id === slot.bookingId) : null;

                                                            if (slot.available) {
                                                                return (
                                                                    <button key={sIdx} onClick={() => openModal(structure.id, item.unitId, false, slot)} className="p-3 bg-secondary/30 border border-border rounded-xl text-center hover:bg-primary/10 hover:border-primary/50 transition-all group flex flex-col items-center justify-center gap-1">
                                                                        <div className="font-mono text-sm font-bold text-foreground group-hover:text-primary transition-colors">{slot.startTime}</div>
                                                                        <div className="text-[9px] uppercase font-black text-muted-foreground tracking-widest">Livre</div>
                                                                    </button>
                                                                );
                                                            }

                                                            if (booking) {
                                                                return (
                                                                    <div key={sIdx} className={cn("p-3 border rounded-xl flex flex-col items-center justify-center gap-1 relative group cursor-default", booking.type === 'maintenance_block' ? "bg-red-500/10 text-red-600 border-red-500/30" : (statusColors[booking.status] || "bg-secondary text-foreground border-border"))}>
                                                                        <div className="font-mono text-xs font-bold">{booking.startTime}</div>
                                                                        {booking.type === 'maintenance_block' ? (
                                                                            <div className="text-[10px] font-black w-full text-center flex items-center justify-center gap-1"><Wrench size={10} /> Bloqueio</div>
                                                                        ) : (
                                                                            <div className="text-[10px] font-black truncate w-full text-center" title={booking.guestName}>{booking.guestName || "Ocupado"}</div>
                                                                        )}

                                                                        {/* Hover actions */}
                                                                        <div className="absolute inset-0 bg-background/95 backdrop-blur-md rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 border border-border pointer-events-none group-hover:pointer-events-auto">
                                                                            {booking.status === 'pending' && (
                                                                                <div className="flex gap-2">
                                                                                    <button onClick={() => handleStatusChange(booking, 'approved', structure.requiresTurnover)} className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="Aprovar"><Check size={14} /></button>
                                                                                    <button onClick={() => handleStatusChange(booking, 'rejected', structure.requiresTurnover)} className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="Rejeitar"><X size={14} /></button>
                                                                                </div>
                                                                            )}
                                                                            {(booking.status === 'approved' || booking.type === 'maintenance_block') && (
                                                                                <div className="flex gap-2">
                                                                                    {booking.type !== 'maintenance_block' && (
                                                                                        <button onClick={() => handleStatusChange(booking, 'completed', structure.requiresTurnover)} className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="Concluir Uso"><Check size={14} /></button>
                                                                                    )}
                                                                                    <button onClick={() => handleStatusChange(booking, 'cancelled', structure.requiresTurnover)} className="w-8 h-8 rounded-full bg-zinc-500 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="Remover / Cancelar"><X size={14} /></button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })}
                                                    </div>
                                                )}

                                                {/* LISTA DE RESERVAS PENDENTES OU DO DIA DESTA UNIDADE */}
                                                {itemBookings.length > 0 && (
                                                    <div className="mt-6 pt-6 border-t border-border">
                                                        <h3 className="text-xs font-black uppercase text-foreground/50 tracking-widest mb-4">Agenda do Dia ({itemBookings.length})</h3>
                                                        <div className="space-y-2">
                                                            {itemBookings.map(b => (
                                                                <div key={b.id} className={cn("flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-xl gap-4", b.type === 'maintenance_block' ? "bg-red-500/5 border-red-500/30" : "bg-secondary/30 border-border")}>
                                                                    <div className="flex items-center gap-4 flex-wrap">
                                                                        <div className={cn("px-2.5 py-1 text-[10px] uppercase font-black tracking-widest rounded-lg border", b.type === 'maintenance_block' ? "bg-red-500 text-white border-transparent" : statusColors[b.status])}>
                                                                            {b.type === 'maintenance_block' ? 'Manutenção' : statusLabels[b.status]}
                                                                        </div>
                                                                        <div className="font-mono text-sm font-bold text-foreground">
                                                                            {b.startTime} - {b.endTime}
                                                                        </div>
                                                                        <div className="text-sm font-medium text-foreground flex items-center gap-2">
                                                                            {b.type === 'maintenance_block' ? <Wrench size={14} className="text-red-500" /> : <User size={14} className="text-muted-foreground" />}
                                                                            {b.guestName || "Manutenção/Bloqueio"}
                                                                        </div>
                                                                        {b.notes && (
                                                                            <div className="text-xs text-muted-foreground flex items-center gap-1 ml-4 border-l border-border pl-4">
                                                                                <Info size={12} /> {b.notes}
                                                                            </div>
                                                                        )}
                                                                        {b.source === 'guest' && (
                                                                            <div className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded uppercase font-bold tracking-wider">App Hóspede</div>
                                                                        )}

                                                                        {/* Ações na lista se for free_time e aprovado (só pra poder cancelar/excluir) */}
                                                                        {structure.bookingType === 'free_time' && (b.status === 'approved' || b.type === 'maintenance_block') && (
                                                                            <button onClick={() => handleStatusChange(b, 'cancelled', structure.requiresTurnover)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg ml-auto transition-colors" title="Cancelar"><X size={16} /></button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal Nova Reserva Manual / Bloqueio */}
            {isModalOpen && selectedConfig && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-border animate-in zoom-in-95 duration-300">
                        <header className="p-6 border-b border-border bg-secondary/50 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-foreground">Criar Agendamento</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {format(currentDate, "dd/MM/yyyy")} {selectedConfig.slot ? `• ${selectedConfig.slot.startTime} às ${selectedConfig.slot.endTime}` : ''}
                                </p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-destructive/10 hover:text-destructive text-muted-foreground rounded-xl transition-all"><X size={20} /></button>
                        </header>

                        <div className="p-6 space-y-6">
                            <div className="flex bg-secondary p-1 rounded-xl">
                                <button type="button" onClick={() => setBookingType('booking')} className={cn("flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all", bookingType === 'booking' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}>Hóspede Reserva</button>
                                <button type="button" onClick={() => setBookingType('maintenance_block')} className={cn("flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all", bookingType === 'maintenance_block' ? "bg-red-500 shadow-sm text-white" : "text-muted-foreground hover:text-foreground")}>Bloqueio Manutenção</button>
                            </div>

                            <form id="bookingForm" onSubmit={handleCreateBooking} className="space-y-4">
                                {selectedConfig.isFreeTime && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Início</label>
                                            <input type="time" required value={freeTimeStart} onChange={e => setFreeTimeStart(e.target.value)} className="w-full bg-background border border-border p-3 rounded-xl text-sm font-mono text-center outline-none focus:border-primary text-foreground" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Término</label>
                                            <input type="time" required value={freeTimeEnd} onChange={e => setFreeTimeEnd(e.target.value)} className="w-full bg-background border border-border p-3 rounded-xl text-sm font-mono text-center outline-none focus:border-primary text-foreground" />
                                        </div>
                                    </div>
                                )}

                                {bookingType === 'booking' ? (
                                    <div>
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Nome do Hóspede</label>
                                        <input required value={guestName} onChange={e => setGuestName(e.target.value)} className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground" placeholder="Nome do hóspede..." />
                                        <p className="text-[10px] text-muted-foreground mt-2">Dica: Em breve você poderá selecionar diretamente a reserva ativa na lista.</p>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">Nota de Bloqueio</label>
                                        <input required value={maintenanceNotes} onChange={e => setMaintenanceNotes(e.target.value)} className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-red-500 text-foreground" placeholder="Motivo do bloqueio..." />
                                    </div>
                                )}
                            </form>
                        </div>

                        <footer className="p-4 border-t border-border bg-secondary/30 flex justify-end gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 hover:bg-accent rounded-xl text-muted-foreground font-bold text-xs uppercase tracking-wider transition-all">Cancelar</button>
                            <button type="submit" form="bookingForm" className="px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl text-xs uppercase tracking-wider hover:opacity-90 transition-all">
                                Confirmar {bookingType === 'booking' ? 'Agendamento' : 'Bloqueio'}
                            </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
}
