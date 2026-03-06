// src/app/admin/reservation-map/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { supabase } from "@/lib/supabase";
import { CabinService } from "@/services/cabin-service";
import { StayService } from "@/services/stay-service";
import { StaffService } from "@/services/staff-service";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { StayDetailsModal } from "@/components/admin/StayDetailsModal";
import { MaintenanceTaskManagerModal } from "@/components/admin/maintenance/MaintenanceTaskManagerModal";
import { HousekeepingTaskManagerModal } from "@/components/admin/HousekeepingTaskManagerModal";
import { HousekeepingService } from "@/services/housekeeping-service";
import { Cabin, Stay, MaintenanceTask, HousekeepingTask, Guest, Staff, Structure } from "@/types/aura";
import { cn } from "@/lib/utils";
import {
    ChevronLeft, ChevronRight, CalendarDays, Loader2,
    MapPin, Building2, Circle, Wrench, Sparkles, Home
} from "lucide-react";
import { format, addDays, differenceInCalendarDays, startOfDay, isSameDay, isWithinInterval, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// ==========================================
// TYPES
// ==========================================

interface StayWithGuest extends Stay {
    guestName?: string;
    cabinName?: string;
    guest?: Guest;
}

// ==========================================
// CONSTANTS
// ==========================================
const DAY_WIDTH = 64;
const CABIN_COL_WIDTH = 180;
const ROW_HEIGHT = 52;
const VISIBLE_DAYS = 21; // 3 weeks view

// ==========================================
// HELPERS
// ==========================================

function getCabinStatusLabel(status: Cabin["status"]) {
    switch (status) {
        case "available": return "Disponível";
        case "occupied": return "Ocupada";
        case "cleaning": return "Suja";
        case "maintenance": return "Bloqueada";
        default: return status;
    }
}

function getCabinStatusColor(status: Cabin["status"]) {
    switch (status) {
        case "available": return "text-emerald-400 bg-emerald-500/15 border-emerald-500/30";
        case "occupied": return "text-red-400 bg-red-500/15 border-red-500/30";
        case "cleaning": return "text-amber-400 bg-amber-500/15 border-amber-500/30";
        case "maintenance": return "text-neutral-400 bg-neutral-500/15 border-neutral-500/30";
        default: return "text-muted-foreground bg-muted border-border";
    }
}

function getStayBarColor(status: Stay["status"]) {
    switch (status) {
        case "active":
            return "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-[0_0_12px_rgba(239,68,68,0.3)]";
        case "pending":
        case "pre_checkin_done":
            return "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-[0_0_12px_rgba(59,130,246,0.3)]";
        case "finished":
        case "cancelled":
        case "archived":
            return "bg-gradient-to-r from-neutral-500 to-neutral-600 text-white/80";
        default:
            return "bg-muted text-foreground";
    }
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function ReservationMapPage() {
    const router = useRouter();
    const { userData } = useAuth();
    const { currentProperty: contextProperty } = useProperty();
    const scrollRef = useRef<HTMLDivElement>(null);

    // Data State
    const [cabins, setCabins] = useState<Cabin[]>([]);
    const [stays, setStays] = useState<StayWithGuest[]>([]);
    const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([]);
    const [housekeepingTasks, setHousekeepingTasks] = useState<HousekeepingTask[]>([]);
    const [staff, setStaff] = useState<Staff[]>([]);
    const [holidays, setHolidays] = useState<Date[]>([]);
    const [loading, setLoading] = useState(true);

    // Timeline State
    const [startDate, setStartDate] = useState(() => {
        const today = startOfDay(new Date());
        return addDays(today, -3); // Show 3 days before today
    });

    // Selection State (drag-to-create / action)
    const [dragState, setDragState] = useState<{
        cabinId: string;
        startDay: number;
        endDay: number;
        active: boolean;
    } | null>(null);

    // Modal States
    const [isSelectionActionModalOpen, setIsSelectionActionModalOpen] = useState(false);
    const [selectionData, setSelectionData] = useState<{ cabinId: string; checkIn: Date; checkOut: Date } | null>(null);

    const [isHkActionModalOpen, setIsHkActionModalOpen] = useState(false);
    const [actionCabin, setActionCabin] = useState<Cabin | null>(null);

    const [isDnDActionModalOpen, setIsDnDActionModalOpen] = useState(false);
    const [dndData, setDnDData] = useState<{ stayId: string; oldCabinId: string; newCabinId: string } | null>(null);

    const [selectedStay, setSelectedStay] = useState<any | null>(null);
    const [selectedGuest, setSelectedGuest] = useState<any | null>(null);
    const [isStayModalOpen, setIsStayModalOpen] = useState(false);

    const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceTask | null>(null);
    const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);

    const [selectedHkCabinId, setSelectedHkCabinId] = useState<string | null>(null);
    const [isHousekeepingModalOpen, setIsHousekeepingModalOpen] = useState(false);

    // Derived
    const days = useMemo(() => {
        return Array.from({ length: VISIBLE_DAYS }, (_, i) => addDays(startDate, i));
    }, [startDate]);

    const today = useMemo(() => startOfDay(new Date()), []);

    const cabinsMap = useMemo(() => {
        const m: Record<string, Cabin> = {};
        cabins.forEach(c => { m[c.id] = c; });
        return m;
    }, [cabins]);

    const structuresMap = useMemo(() => {
        return {} as Record<string, Structure>; // Not needed for cabin map but required by modals
    }, []);

    // ==========================================
    // DATA LOADING
    // ==========================================

    const loadData = useCallback(async () => {
        if (!contextProperty?.id) return;
        setLoading(true);
        try {
            const [cabinsData, staysData, maintenanceData, hkData, staffData] = await Promise.all([
                CabinService.getCabinsByProperty(contextProperty.id),
                // Load stays that overlap with our visible window
                (async () => {
                    const windowStart = startDate.toISOString();
                    const windowEnd = addDays(startDate, VISIBLE_DAYS).toISOString();

                    const { data, error } = await supabase
                        .from('stays')
                        .select('*, guests!stays_guestId_fkey(fullName)')
                        .eq('propertyId', contextProperty.id)
                        .in('status', ['pending', 'pre_checkin_done', 'active', 'finished'])
                        .lte('checkIn', windowEnd)
                        .gte('checkOut', windowStart);

                    if (error) {
                        console.error("Error loading stays for map:", error);
                        // Fallback: load all non-archived stays
                        const allStays = await StayService.getStaysByStatus(contextProperty.id, ['pending', 'pre_checkin_done', 'active', 'finished']);
                        return allStays as StayWithGuest[];
                    }

                    return (data || []).map((s: any) => ({
                        ...s,
                        guestName: s.guests?.fullName || "Hóspede"
                    })) as StayWithGuest[];
                })(),
                // Maintenance tasks for cabins
                (async () => {
                    const { data } = await supabase
                        .from('maintenance_tasks')
                        .select('*')
                        .eq('propertyId', contextProperty.id)
                        .not('cabinId', 'is', null)
                        .in('status', ['pending', 'in_progress']);
                    return (data || []) as MaintenanceTask[];
                })(),
                // Housekeeping tasks
                (async () => {
                    const { data } = await supabase
                        .from('housekeeping_tasks')
                        .select('*')
                        .eq('propertyId', contextProperty.id)
                        .in('status', ['pending', 'in_progress', 'waiting_conference']);
                    return (data || []) as HousekeepingTask[];
                })(),
                StaffService.getStaffByProperty(contextProperty.id)
            ]);

            setCabins(cabinsData);
            setStays(staysData);
            setMaintenanceTasks(maintenanceData);
            setHousekeepingTasks(hkData);
            setStaff(staffData);
        } catch (error) {
            console.error("Error loading reservation map data:", error);
            toast.error("Erro ao carregar dados do mapa.");
        } finally {
            setLoading(false);
        }
    }, [contextProperty?.id, startDate]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const year = today.getFullYear();
        fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setHolidays(data.map((d: any) => startOfDay(new Date(`${d.date}T00:00:00`))));
                }
            })
            .catch(err => console.error('Erro ao buscar feriados:', err));
    }, [today]);

    // ==========================================
    // REALTIME
    // ==========================================

    useEffect(() => {
        if (!contextProperty?.id) return;

        const channel = supabase.channel(`reservation_map_${contextProperty.id}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'stays', filter: `propertyId=eq.${contextProperty.id}` },
                () => loadData()
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'cabins', filter: `propertyId=eq.${contextProperty.id}` },
                () => loadData()
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'maintenance_tasks', filter: `propertyId=eq.${contextProperty.id}` },
                () => loadData()
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `propertyId=eq.${contextProperty.id}` },
                () => loadData()
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [contextProperty?.id, loadData]);

    // ==========================================
    // SCROLL TO TODAY ON MOUNT
    // ==========================================

    useEffect(() => {
        if (scrollRef.current && !loading) {
            const todayIndex = differenceInCalendarDays(today, startDate);
            if (todayIndex >= 0 && todayIndex < VISIBLE_DAYS) {
                scrollRef.current.scrollLeft = Math.max(0, todayIndex * DAY_WIDTH - 120);
            }
        }
    }, [loading, today, startDate]);

    // ==========================================
    // CLICK HANDLERS
    // ==========================================

    const handleStayClick = async (stay: StayWithGuest) => {
        if (!contextProperty?.id) return;
        try {
            const data = await StayService.getStayWithGuestAndCabin(contextProperty.id, stay.id);
            if (data) {
                setSelectedStay({ ...data.stay, guestName: data.guest?.fullName, cabinName: data.cabin?.name });
                setSelectedGuest(data.guest);
                setIsStayModalOpen(true);
            }
        } catch (err) {
            console.error(err);
            toast.error("Erro ao abrir ficha da estadia.");
        }
    };

    const handleMaintenanceClick = (task: MaintenanceTask) => {
        setSelectedMaintenance(task);
        setIsMaintenanceModalOpen(true);
    };

    const handleCabinStatusClick = (cabin: Cabin) => {
        if (cabin.status === "cleaning") {
            setActionCabin(cabin);
            setIsHkActionModalOpen(true);
        }
    };

    const handleHkAlternativeAction = async (action: 'open_os' | 'skip') => {
        setIsHkActionModalOpen(false);
        if (!actionCabin || !contextProperty?.id) return;

        if (action === 'open_os') {
            setSelectedHkCabinId(actionCabin.id);
            setIsHousekeepingModalOpen(true);
        } else if (action === 'skip') {
            try {
                const task = getHkTaskForCabin(actionCabin.id);
                if (task) {
                    await HousekeepingService.finishTask(
                        contextProperty.id,
                        task.id,
                        task.checklist.map(c => ({ id: c.id, label: c.label, checked: true })), // Auto-check all
                        "Finalizada pela recepção (Pular Faxina)",
                        userData?.id || "admin",
                        userData?.fullName || "Admin"
                    );
                } else {
                    // Just free the cabin if no task was found
                    await supabase.from('cabins').update({ status: 'available' }).eq('id', actionCabin.id);
                }
                toast.success("Acomodação marcada como limpa.");
                loadData();
            } catch (err) {
                console.error(err);
                toast.error("Erro ao pular faxina.");
            }
        }
        setActionCabin(null);
    };

    // ==========================================
    // DRAG TO SELECT (CREATE ACTION)
    // ==========================================

    const handleMouseDown = (cabinId: string, dayIndex: number) => {
        setDragState({ cabinId, startDay: dayIndex, endDay: dayIndex, active: true });
    };

    const handleMouseEnter = (cabinId: string, dayIndex: number) => {
        if (dragState?.active && dragState.cabinId === cabinId) {
            setDragState(prev => prev ? { ...prev, endDay: dayIndex } : null);
        }
    };

    const handleMouseUp = () => {
        if (dragState?.active) {
            const minDay = Math.min(dragState.startDay, dragState.endDay);
            const maxDay = Math.max(dragState.startDay, dragState.endDay);

            if (maxDay - minDay >= 1) { // At least 2 days selection
                const checkInDate = addDays(startDate, minDay);
                const checkOutDate = addDays(startDate, maxDay + 1);

                setSelectionData({ cabinId: dragState.cabinId, checkIn: checkInDate, checkOut: checkOutDate });
                setIsSelectionActionModalOpen(true);
            }

            setDragState(null);
        }
    };

    const handleSelectionAction = (action: 'reservation' | 'maintenance') => {
        setIsSelectionActionModalOpen(false);
        if (!selectionData) return;

        if (action === 'reservation') {
            const params = new URLSearchParams({
                cabinId: selectionData.cabinId,
                checkIn: format(selectionData.checkIn, "yyyy-MM-dd"),
                checkOut: format(selectionData.checkOut, "yyyy-MM-dd"),
            });
            router.push(`/admin/stays/new?${params.toString()}`);
        } else if (action === 'maintenance') {
            setSelectedMaintenance(null); // Force new block
            setIsMaintenanceModalOpen(true);
            // the modal component must accept the cabin via context/props which we'll handle shortly
        }
    };

    // ==========================================
    // DRAG AND DROP (MOVE STAY BETWEEN CABINS)
    // ==========================================

    const handleDragStart = (e: React.DragEvent, stay: StayWithGuest) => {
        if (!['active', 'pending', 'pre_checkin_done'].includes(stay.status)) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData("stayId", stay.id);
        e.dataTransfer.setData("oldCabinId", stay.cabinId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // allow drop
    };

    const handleDrop = async (e: React.DragEvent, newCabinId: string) => {
        e.preventDefault();
        const stayId = e.dataTransfer.getData("stayId");
        const oldCabinId = e.dataTransfer.getData("oldCabinId");

        if (!stayId || !oldCabinId || oldCabinId === newCabinId) return;

        const stay = stays.find(s => s.id === stayId);
        if (!stay || !contextProperty?.id) return;

        if (stay.status === 'active') {
            setDnDData({ stayId, oldCabinId, newCabinId });
            setIsDnDActionModalOpen(true);
        } else {
            // Future or finished stay, just move it
            await moveStayToCabin(stayId, newCabinId);
        }
    };

    const handleDnDAction = async (createTurnover: boolean) => {
        setIsDnDActionModalOpen(false);
        if (!dndData || !contextProperty?.id) return;

        await moveStayToCabin(dndData.stayId, dndData.newCabinId);

        if (createTurnover) {
            try {
                // Free up old cabin & create turnover task
                await supabase.from('cabins').update({ status: 'cleaning', currentStayId: null }).eq('id', dndData.oldCabinId);
                await supabase.from('housekeeping_tasks').insert({
                    id: crypto.randomUUID(),
                    propertyId: contextProperty.id,
                    cabinId: dndData.oldCabinId,
                    type: 'turnover',
                    status: 'pending',
                    assignedTo: [],
                    checklist: []
                });
                toast.success("Estadia movida e faxina de troca gerada.");
                loadData();
            } catch (err) {
                console.error(err);
                toast.error("Estadia foi movida, mas ocorreu erro ao criar faxina.");
            }
        }
        setDnDData(null);
    };

    const moveStayToCabin = async (stayId: string, newCabinId: string) => {
        if (!contextProperty?.id) return;
        setLoading(true);
        try {
            await StayService.updateStayData(
                contextProperty.id,
                stayId,
                { cabinId: newCabinId },
                userData?.id || "admin",
                userData?.fullName || "Admin"
            );
            toast.success("Acomodação alterada com sucesso.");
            loadData();
        } catch (err) {
            console.error(err);
            toast.error("Erro ao alterar acomodação.");
            setLoading(false);
        }
    };

    // ==========================================
    // BAR POSITION CALCULATION
    // ==========================================

    const getBarPosition = (itemCheckIn: string, itemCheckOut: string) => {
        const checkInDate = startOfDay(new Date(itemCheckIn));
        const checkOutDate = startOfDay(new Date(itemCheckOut));
        const windowStart = startDate;

        // Shift offsets by 0.5 (half day) to represent 15h and 12h accurately in the grid.
        const startOffsetDays = differenceInCalendarDays(checkInDate, windowStart) + 0.5;
        const endOffsetDays = differenceInCalendarDays(checkOutDate, windowStart) + 0.5;

        const visibleStartOffset = Math.max(0, startOffsetDays);
        const visibleEndOffset = Math.min(VISIBLE_DAYS, endOffsetDays);

        const duration = visibleEndOffset - visibleStartOffset;

        if (duration <= 0) return null;

        return {
            left: visibleStartOffset * DAY_WIDTH,
            width: duration * DAY_WIDTH - 4,
            clippedLeft: startOffsetDays < 0,
            clippedRight: endOffsetDays > VISIBLE_DAYS,
        };
    };

    // ==========================================
    // GET ITEMS FOR A SPECIFIC CABIN
    // ==========================================

    const getStaysForCabin = (cabinId: string) => {
        return stays.filter(s => s.cabinId === cabinId);
    };

    const getMaintenanceForCabin = (cabinId: string) => {
        return maintenanceTasks.filter(t => t.cabinId === cabinId && t.blocksCabin);
    };

    // ==========================================
    // DRAG SELECTION HIGHLIGHT
    // ==========================================

    const isDayInSelection = (cabinId: string, dayIndex: number) => {
        if (!dragState?.active || dragState.cabinId !== cabinId) return false;
        const minDay = Math.min(dragState.startDay, dragState.endDay);
        const maxDay = Math.max(dragState.startDay, dragState.endDay);
        return dayIndex >= minDay && dayIndex <= maxDay;
    };

    // ==========================================
    // GET HOUSEKEEPING TASK FOR MODAL
    // ==========================================

    const getHkTaskForCabin = (cabinId: string): HousekeepingTask | null => {
        return housekeepingTasks.find(t => t.cabinId === cabinId && t.status !== 'completed' && t.status !== 'cancelled') || null;
    };

    const maids = useMemo(() => staff.filter(s => s.role === 'maid' || s.role === 'governance'), [staff]);
    const technicians = useMemo(() => staff.filter(s => s.role === 'technician' || s.role === 'maintenance'), [staff]);

    // ==========================================
    // NAVIGATION
    // ==========================================

    const goToPreviousWeek = () => setStartDate(prev => addDays(prev, -7));
    const goToNextWeek = () => setStartDate(prev => addDays(prev, 7));
    const goToToday = () => setStartDate(addDays(startOfDay(new Date()), -3));

    // ==========================================
    // RENDER
    // ==========================================

    return (
        <RoleGuard allowedRoles={["super_admin", "admin", "reception"]}>
            <div className="p-6 max-w-[100vw] space-y-6 animate-in fade-in duration-500">

                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3 text-foreground">
                            <CalendarDays className="text-primary" size={32} /> Mapa de Reservas
                        </h1>
                        <div className="flex items-center gap-2">
                            <p className="font-medium flex items-center gap-2 opacity-70 text-sm" style={{ color: "hsl(var(--foreground))" }}>
                                <MapPin size={14} />
                                {contextProperty?.name || "Carregando Propriedade..."}
                            </p>
                        </div>
                    </div>

                    {/* Timeline Navigation */}
                    <div className="flex items-center gap-2 bg-card border border-white/5 p-1.5 rounded-2xl">
                        <button
                            onClick={goToPreviousWeek}
                            className="p-2.5 hover:bg-white/5 rounded-xl transition-colors text-foreground/60 hover:text-foreground"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            onClick={goToToday}
                            className="px-5 py-2 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary/20 transition-colors"
                        >
                            Hoje
                        </button>
                        <button
                            onClick={goToNextWeek}
                            className="p-2.5 hover:bg-white/5 rounded-xl transition-colors text-foreground/60 hover:text-foreground"
                        >
                            <ChevronRight size={18} />
                        </button>
                        <div className="hidden md:block px-3 text-xs font-bold text-foreground/40 uppercase tracking-widest">
                            {format(startDate, "dd MMM", { locale: ptBR })} — {format(addDays(startDate, VISIBLE_DAYS - 1), "dd MMM yyyy", { locale: ptBR })}
                        </div>
                    </div>
                </header>

                {/* Map Container */}
                {!contextProperty?.id ? (
                    <div className="text-center p-24 bg-card rounded-[40px] border border-dashed border-white/10">
                        <Building2 size={60} className="mx-auto text-foreground/10 mb-6" />
                        <h3 className="text-2xl font-black text-foreground">Carregando...</h3>
                    </div>
                ) : loading ? (
                    <div className="flex flex-col items-center justify-center p-24 space-y-4">
                        <Loader2 className="animate-spin text-primary" size={48} />
                        <p className="text-xs font-bold uppercase tracking-widest text-foreground/20">Carregando Mapa...</p>
                    </div>
                ) : (
                    <div className="bg-card border border-white/5 rounded-3xl overflow-hidden shadow-xl">
                        <div className="flex">

                            {/* Fixed Cabin Column */}
                            <div className="shrink-0 border-r border-white/5 z-10 bg-card" style={{ width: CABIN_COL_WIDTH }}>
                                {/* Header cell */}
                                <div
                                    className="flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-foreground/30 border-b border-white/5 bg-secondary/50"
                                    style={{ height: ROW_HEIGHT }}
                                >
                                    Acomodação
                                </div>
                                {/* Cabin rows */}
                                {cabins.map((cabin) => (
                                    <div
                                        key={cabin.id}
                                        className={cn(
                                            "flex items-center gap-3 px-4 border-b border-white/5 transition-colors",
                                            cabin.status === "cleaning" && "cursor-pointer hover:bg-amber-500/5"
                                        )}
                                        style={{ height: ROW_HEIGHT }}
                                        onClick={() => handleCabinStatusClick(cabin)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-black text-foreground truncate tracking-tight">
                                                {cabin.name}
                                            </p>
                                        </div>
                                        <div className={cn(
                                            "shrink-0 px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-wider",
                                            getCabinStatusColor(cabin.status)
                                        )}>
                                            {getCabinStatusLabel(cabin.status)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Scrollable Timeline Grid */}
                            <div
                                ref={scrollRef}
                                className="flex-1 overflow-x-auto custom-scrollbar"
                                onMouseUp={handleMouseUp}
                                onMouseLeave={() => dragState?.active && setDragState(null)}
                            >
                                <div style={{ width: VISIBLE_DAYS * DAY_WIDTH, minWidth: "100%" }}>
                                    {/* Day Headers */}
                                    <div className="flex border-b border-border bg-secondary/50" style={{ height: ROW_HEIGHT }}>
                                        {days.map((day, i) => {
                                            const isToday = isSameDay(day, today);
                                            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                            const isHoliday = holidays.some(h => isSameDay(h, day));
                                            const isSpecialDay = isWeekend || isHoliday;

                                            return (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "shrink-0 flex flex-col items-center justify-center border-r border-border transition-colors relative",
                                                        isToday ? "bg-primary/10" : (isSpecialDay ? "bg-destructive/5" : "")
                                                    )}
                                                    style={{ width: DAY_WIDTH }}
                                                >
                                                    {isHoliday && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-destructive" title="Feriado Nacional"></div>}
                                                    <span className={cn(
                                                        "text-[9px] font-bold uppercase tracking-wider",
                                                        isToday ? "text-primary" : (isSpecialDay ? "text-destructive/60" : "text-foreground/30")
                                                    )}>
                                                        {format(day, "EEE", { locale: ptBR })}
                                                    </span>
                                                    <span className={cn(
                                                        "text-sm font-black",
                                                        isToday ? "text-primary" : "text-foreground/60"
                                                    )}>
                                                        {format(day, "dd")}
                                                    </span>
                                                    <span className={cn(
                                                        "text-[8px] font-bold uppercase tracking-wider",
                                                        isToday ? "text-primary/60" : "text-foreground/20"
                                                    )}>
                                                        {format(day, "MMM", { locale: ptBR })}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Cabin Rows with Stay Bars */}
                                    {cabins.map((cabin) => {
                                        const cabinStays = getStaysForCabin(cabin.id);
                                        const cabinMaintenance = getMaintenanceForCabin(cabin.id);

                                        return (
                                            <div
                                                key={cabin.id}
                                                className="flex border-b border-border relative"
                                                style={{ height: ROW_HEIGHT }}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => handleDrop(e, cabin.id)}
                                            >
                                                {/* Day cell backgrounds (for drag & today highlight & visual borders) */}
                                                {days.map((day, i) => {
                                                    const isToday = isSameDay(day, today);
                                                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                                    const isHoliday = holidays.some(h => isSameDay(h, day));
                                                    const isSpecialDay = isWeekend || isHoliday;
                                                    const isSelected = isDayInSelection(cabin.id, i);

                                                    return (
                                                        <div
                                                            key={i}
                                                            className={cn(
                                                                "shrink-0 border-r border-border transition-colors cursor-crosshair z-0",
                                                                isToday ? "bg-primary/[0.04]" : (isSpecialDay ? "bg-destructive/[0.02]" : "hover:bg-foreground/[0.01]"),
                                                                isSelected && "bg-primary/20"
                                                            )}
                                                            style={{ width: DAY_WIDTH }}
                                                            onMouseDown={() => handleMouseDown(cabin.id, i)}
                                                            onMouseEnter={() => handleMouseEnter(cabin.id, i)}
                                                        />
                                                    );
                                                })}

                                                {/* Stay Bars (absolute positioned) */}
                                                {cabinStays.map((stay) => {
                                                    const pos = getBarPosition(stay.checkIn, stay.checkOut);
                                                    if (!pos) return null;

                                                    const guestName = stay.guestName || "Hóspede";
                                                    const shortName = guestName.split(" ")[0] + (guestName.split(" ").length > 1 ? ` ${guestName.split(" ").slice(-1)}` : "");

                                                    return (
                                                        <button
                                                            key={stay.id}
                                                            draggable={['active', 'pending', 'pre_checkin_done'].includes(stay.status)}
                                                            onDragStart={(e) => handleDragStart(e, stay)}
                                                            onClick={() => handleStayClick(stay)}
                                                            className={cn(
                                                                "absolute top-1.5 h-[calc(100%-12px)] flex items-center px-3 rounded-lg text-[10px] font-bold transition-all hover:brightness-110 hover:scale-[1.02] z-10 truncate",
                                                                ['active', 'pending', 'pre_checkin_done'].includes(stay.status) ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                                                                getStayBarColor(stay.status),
                                                                pos.clippedLeft && "rounded-l-none border-l-2 border-dashed border-white/30",
                                                                pos.clippedRight && "rounded-r-none border-r-2 border-dashed border-white/30"
                                                            )}
                                                            style={{
                                                                left: pos.left + 2,
                                                                width: pos.width - 4,
                                                            }}
                                                            title={`${guestName} — ${format(new Date(stay.checkIn), "dd/MM")} a ${format(new Date(stay.checkOut), "dd/MM")}`}
                                                        >
                                                            <span className="truncate">{shortName}</span>
                                                        </button>
                                                    );
                                                })}

                                                {/* Maintenance Bars */}
                                                {cabinMaintenance.map((task) => {
                                                    const startIso = task.expectedStart || task.createdAt;
                                                    const endIso = task.expectedEnd || task.finishedAt || addDays(new Date(), 7).toISOString();
                                                    if (!startIso) return null;

                                                    const pos = getBarPosition(startIso, endIso);
                                                    if (!pos) return null;

                                                    return (
                                                        <button
                                                            key={`mt-${task.id}`}
                                                            onClick={() => handleMaintenanceClick(task)}
                                                            className={cn(
                                                                "absolute top-1.5 h-[calc(100%-12px)] flex items-center gap-1.5 px-3 rounded-lg text-[10px] font-bold cursor-pointer transition-all hover:brightness-125 z-10 truncate",
                                                                "bg-gradient-to-r from-neutral-800 to-neutral-900 text-neutral-300 border border-neutral-600/50 shadow-[0_0_10px_rgba(0,0,0,0.4)]",
                                                                pos.clippedLeft && "rounded-l-none",
                                                                pos.clippedRight && "rounded-r-none"
                                                            )}
                                                            style={{
                                                                left: pos.left + 2,
                                                                width: pos.width,
                                                            }}
                                                            title={`Manutenção: ${task.title}`}
                                                        >
                                                            <Wrench size={10} className="shrink-0" />
                                                            <span className="truncate">{task.title}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="flex items-center justify-center gap-6 p-4 border-t border-white/5 bg-secondary/30">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-3 rounded-sm bg-gradient-to-r from-blue-500 to-blue-600" />
                                <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Prevista</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-3 rounded-sm bg-gradient-to-r from-red-500 to-red-600" />
                                <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Ativa</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-3 rounded-sm bg-gradient-to-r from-neutral-500 to-neutral-600" />
                                <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Finalizada</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-3 rounded-sm bg-gradient-to-r from-neutral-800 to-neutral-900 border border-neutral-600/50" />
                                <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Manutenção</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Drag instruction hint */}
                <p className="text-center text-[10px] font-bold text-foreground/20 uppercase tracking-[0.2em]">
                    Arraste sobre o mapa para criar uma nova reserva • Clique nas barras para ver detalhes
                </p>

                {/* ==================== MODALS ==================== */}

                {/* Stay Details Modal */}
                {selectedStay && selectedGuest && (
                    <StayDetailsModal
                        isOpen={isStayModalOpen}
                        onClose={() => setIsStayModalOpen(false)}
                        stay={selectedStay}
                        guest={selectedGuest}
                        onViewGuest={(id) => router.push(`/admin/guests/${id}`)}
                        onUpdate={loadData}
                    />
                )}

                {/* Maintenance Modal */}
                {isMaintenanceModalOpen && contextProperty?.id && (
                    <MaintenanceTaskManagerModal
                        isOpen={isMaintenanceModalOpen}
                        onClose={() => { setIsMaintenanceModalOpen(false); setSelectedMaintenance(null); setSelectionData(null); }}
                        propertyId={contextProperty.id}
                        task={selectedMaintenance}
                        cabins={cabinsMap}
                        structures={structuresMap}
                        technicians={technicians}
                        initialCabinId={selectionData?.cabinId}
                        initialExpectedStart={selectionData ? format(selectionData.checkIn, "yyyy-MM-dd'T'15:00") : undefined}
                        initialExpectedEnd={selectionData ? format(selectionData.checkOut, "yyyy-MM-dd'T'12:00") : undefined}
                    />
                )}

                {/* Housekeeping Modal */}
                {isHousekeepingModalOpen && contextProperty?.id && selectedHkCabinId && (
                    <HousekeepingTaskManagerModal
                        isOpen={isHousekeepingModalOpen}
                        onClose={() => { setIsHousekeepingModalOpen(false); setSelectedHkCabinId(null); }}
                        propertyId={contextProperty.id}
                        task={getHkTaskForCabin(selectedHkCabinId)}
                        cabins={cabinsMap}
                        structures={structuresMap}
                        maids={maids}
                    />
                )}

                {/* --- New Action Dialogs --- */}

                {/* Selection Action Dialog */}
                {isSelectionActionModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                        <div className="bg-background w-full max-w-sm rounded-[24px] overflow-hidden shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
                            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CalendarDays className="text-primary" size={32} />
                            </div>
                            <h2 className="text-xl font-bold text-foreground mb-2">Bloqueio de Período</h2>
                            <p className="text-sm text-foreground/60 mb-6">
                                Você selecionou um período. O que deseja fazer com esse bloqueio?
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => handleSelectionAction('reservation')}
                                    className="w-full py-3 px-4 bg-primary text-primary-foreground font-black uppercase tracking-wider text-xs rounded-xl hover:bg-primary/90 transition-all shadow-md"
                                >
                                    Nova Reserva
                                </button>
                                <button
                                    onClick={() => handleSelectionAction('maintenance')}
                                    className="w-full py-3 px-4 bg-secondary text-foreground font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-muted border border-border transition-all"
                                >
                                    Bloqueio de Manutenção
                                </button>
                                <button
                                    onClick={() => { setIsSelectionActionModalOpen(false); setSelectionData(null); }}
                                    className="w-full py-3 px-4 text-muted-foreground font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-secondary/50 transition-all mt-2"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Quick Housekeeping Action Dialog */}
                {isHkActionModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                        <div className="bg-background w-full max-w-sm rounded-[24px] overflow-hidden shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
                            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Sparkles className="text-amber-500" size={32} />
                            </div>
                            <h2 className="text-xl font-bold text-foreground mb-2">Acomodação Suja</h2>
                            <p className="text-sm text-foreground/60 mb-6 flex flex-col items-center">
                                <span className="font-bold text-foreground bg-muted px-2 py-0.5 rounded text-xs mb-2 block">{actionCabin?.name}</span>
                                Como deseja lidar com o status desta acomodação?
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => handleHkAlternativeAction('skip')}
                                    className="w-full py-3 px-4 bg-emerald-500/10 border border-emerald-500 text-emerald-600 font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-emerald-500 hover:text-white transition-all"
                                >
                                    Marcar como Limpa
                                </button>
                                <button
                                    onClick={() => handleHkAlternativeAction('open_os')}
                                    className="w-full py-3 px-4 bg-secondary text-foreground font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-muted border border-border transition-all"
                                >
                                    Abrir Ordem de Serviço
                                </button>
                                <button
                                    onClick={() => { setIsHkActionModalOpen(false); setActionCabin(null); }}
                                    className="w-full py-3 px-4 text-muted-foreground font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-secondary/50 transition-all mt-2"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* DnD Active Stay Action Dialog */}
                {isDnDActionModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                        <div className="bg-background w-full max-w-sm rounded-[24px] overflow-hidden shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Home className="text-red-500" size={32} />
                            </div>
                            <h2 className="text-xl font-bold text-foreground mb-2">Mudança de Acomodação</h2>
                            <p className="text-sm text-foreground/60 mb-6">
                                O hóspede <strong>já realizou o check-in</strong>. Ao mover para uma nova acomodação, a antiga precisará de limpeza?
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => handleDnDAction(true)}
                                    className="w-full py-3 px-4 bg-amber-500/10 border border-amber-500 text-amber-600 font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-amber-500 hover:text-white transition-all"
                                >
                                    Sim, Gerar Faxina (Troca)
                                </button>
                                <button
                                    onClick={() => handleDnDAction(false)}
                                    className="w-full py-3 px-4 bg-secondary text-foreground font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-muted border border-border transition-all"
                                >
                                    Não, Apenas Mover
                                </button>
                                <button
                                    onClick={() => { setIsDnDActionModalOpen(false); setDnDData(null); }}
                                    className="w-full py-3 px-4 text-muted-foreground font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-secondary/50 transition-all mt-2"
                                >
                                    Cancelar Movimentação
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </RoleGuard>
    );
}
