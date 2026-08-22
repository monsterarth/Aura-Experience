// src/app/admin/reservation-map/ReservationMapClient.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { supabase, safeRemoveChannel } from "@/lib/supabase";
import { StayService } from "@/services/stay-service";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { StayDetailsModal } from "@/components/admin/StayDetailsModal";
import { MaintenanceTaskManagerModal } from "@/components/admin/maintenance/MaintenanceTaskManagerModal";
import { HousekeepingTaskManagerModal } from "@/components/admin/HousekeepingTaskManagerModal";
import { HousekeepingService } from "@/services/housekeeping-service";
import { chatwootSyncOnCabinTransfer } from "@/app/actions/chatwoot-actions";
import { Cabin, Stay, MaintenanceTask, HousekeepingTask, Guest, Staff, Structure } from "@/types/aura";
import { cn } from "@/lib/utils";
import {
    ChevronLeft, ChevronRight, CalendarDays, Loader2,
    MapPin, Building2, Circle, Wrench, Sparkles, Home, BedDouble,
    PlusCircle, Lock, AlignJustify, LayoutList
} from "lucide-react";
import { format, addDays, differenceInCalendarDays, startOfDay, isSameDay, isWithinInterval, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { T } from "@/lib/admin-tokens";
import { PageShell, PageHeader, Button, IconButton, Dialog, PageSkeleton } from "@/components/aura";

// ==========================================
// TYPES
// ==========================================

interface StayWithGuest extends Stay {
    guestName?: string;
    cabinName?: string;
    guest?: Guest;
}

interface CabinStaySegment {
    stay: StayWithGuest;
    cabinId: string;
    effectiveCheckIn: string;
    effectiveCheckOut: string;
    isHistorical: boolean;
}

// ==========================================
// CONSTANTS
// ==========================================
const DAY_WIDTH = 64;
const CABIN_COL_WIDTH = 180;
const ROW_HEIGHT_NORMAL = 42;
const ROW_HEIGHT_COMPACT = 28;
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
        case "available": return "text-emerald-500";
        case "occupied": return "text-red-500";
        case "cleaning": return "text-amber-500";
        case "maintenance": return "text-neutral-500";
        default: return "text-muted-foreground";
    }
}

function renderCabinStatusIcon(status: Cabin["status"]) {
    switch (status) {
        case "available": return <BedDouble size={16} />;
        case "occupied": return <BedDouble size={16} />;
        case "cleaning": return <Sparkles size={16} />;
        case "maintenance": return <Wrench size={16} />;
        default: return <Circle size={16} />;
    }
}

function getStayBarColor(stay: StayWithGuest) {
    // Uso da casa (ocupação interna) → âmbar, distinto de reservas de cliente
    if (stay.internalUse) {
        return "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-[0_0_12px_rgba(245,158,11,0.35)]";
    }
    // finished com conta aberta → laranja
    if (stay.status === "finished" && (stay.hasOpenFolio || stay.lostItemsDescription)) {
        return "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(249,115,22,0.4)]";
    }
    switch (stay.status) {
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

export default function ReservationMapClient() {
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

    // Timeline State — inicializado em useEffect para evitar hydration mismatch (server=UTC vs client=UTC-3)
    const [startDate, setStartDate] = useState<Date | null>(null);

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
    const [dndData, setDnDData] = useState<{ stayId: string; oldCabinId: string | null; newCabinId: string } | null>(null);

    const [selectedStay, setSelectedStay] = useState<any | null>(null);
    const [selectedGuest, setSelectedGuest] = useState<any | null>(null);
    const [isStayModalOpen, setIsStayModalOpen] = useState(false);

    const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceTask | null>(null);
    const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);

    const [selectedHkCabinId, setSelectedHkCabinId] = useState<string | null>(null);
    const [isHousekeepingModalOpen, setIsHousekeepingModalOpen] = useState(false);

    const [today, setToday] = useState<Date | null>(null);

    // UI State
    const [selectionMode, setSelectionMode] = useState<'reservation' | 'maintenance' | null>(null);
    const [compact, setCompact] = useState(false);

    // Inicializa datas somente no cliente para evitar hydration mismatch
    useEffect(() => {
        const t = startOfDay(new Date());
        setToday(t);
        setStartDate(addDays(t, -3));
    }, []);

    // Derived
    const days = useMemo(() => {
        if (!startDate) return [];
        return Array.from({ length: VISIBLE_DAYS }, (_, i) => addDays(startDate, i));
    }, [startDate]);

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
        if (!contextProperty?.id || !startDate) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const windowStart = startDate.toISOString();
            const windowEnd = addDays(startDate, VISIBLE_DAYS).toISOString();
            const params = new URLSearchParams({
                propertyId: contextProperty.id,
                windowStart,
                windowEnd,
            });
            const res = await fetch(`/api/admin/reservation-map/data?${params}`);
            if (!res.ok) throw new Error('fetch-error');
            const data = await res.json();

            setCabins(data.cabins ?? []);
            setStays(data.stays ?? []);
            setMaintenanceTasks(data.maintenanceTasks ?? []);
            setHousekeepingTasks(data.housekeepingTasks ?? []);
            setStaff(data.staff ?? []);
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
        if (!today) return;
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

        let subscribed = false;
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
            .subscribe((status: string) => { if (status === 'SUBSCRIBED') subscribed = true; });

        return () => { safeRemoveChannel(channel, subscribed); };
    }, [contextProperty?.id, loadData]);

    // ==========================================
    // SCROLL TO TODAY ON MOUNT
    // ==========================================

    useEffect(() => {
        if (scrollRef.current && !loading && today && startDate) {
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
            const data = await StayService.getStayWithGuestAndCabinAdmin(contextProperty.id, stay.id);
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
                }
                // Sempre libera a cabana — finishTask só faz isso se type !== 'turnover'
                await supabase.from('cabins').update({ status: 'available' }).eq('id', actionCabin.id);
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
        if (!selectionMode) return; // só arrasta em modo de seleção explícito
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

            if (maxDay - minDay >= 1 && startDate) {
                const checkInDate = addDays(startDate, minDay);
                const checkOutDate = addDays(startDate, maxDay + 1);
                const captured = { cabinId: dragState.cabinId, checkIn: checkInDate, checkOut: checkOutDate };

                setDragState(null);
                setSelectionMode(null);

                if (selectionMode === 'reservation') {
                    const params = new URLSearchParams({
                        cabinId: captured.cabinId,
                        checkIn: format(captured.checkIn, "yyyy-MM-dd"),
                        checkOut: format(captured.checkOut, "yyyy-MM-dd"),
                    });
                    router.push(`/admin/stays/new?${params.toString()}`);
                } else if (selectionMode === 'maintenance') {
                    setSelectionData(captured);
                    setSelectedMaintenance(null);
                    setIsMaintenanceModalOpen(true);
                }
            } else {
                setDragState(null);
            }
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
            setSelectedMaintenance(null);
            setIsMaintenanceModalOpen(true);
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
        e.dataTransfer.setData("oldCabinId", stay.cabinId ?? '');
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // allow drop
    };

    const handleDropUnassigned = async (e: React.DragEvent) => {
        e.preventDefault();
        const stayId = e.dataTransfer.getData("stayId");
        const oldCabinId = e.dataTransfer.getData("oldCabinId");
        if (!stayId || !oldCabinId || !contextProperty?.id) return;
        const stay = stays.find(s => s.id === stayId);
        if (!stay) return;
        if (stay.status === 'active') {
            toast.error("Não é possível remover a cabana de uma estadia ativa.");
            return;
        }
        setLoading(true);
        try {
            await StayService.unassignCabin(contextProperty.id, stayId, userData?.id || "admin", userData?.fullName || "Admin");
            toast.success("Cabana removida da reserva.");
            loadData();
        } catch {
            toast.error("Erro ao remover cabana da reserva.");
            setLoading(false);
        }
    };

    const handleDrop = async (e: React.DragEvent, newCabinId: string) => {
        e.preventDefault();
        const stayId = e.dataTransfer.getData("stayId");
        const oldCabinId = e.dataTransfer.getData("oldCabinId") || null;

        if (!stayId || oldCabinId === newCabinId) return;

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

        setLoading(true);
        try {
            await StayService.transferCabin(
                contextProperty.id,
                dndData.stayId,
                dndData.newCabinId,
                createTurnover ? 'cleaning' : 'available',
                userData?.id || "admin",
                userData?.fullName || "Admin"
            );
            chatwootSyncOnCabinTransfer(dndData.stayId, dndData.newCabinId).catch(() => {});
            toast.success(createTurnover ? "Estadia movida e faxina de troca gerada." : "Acomodação alterada com sucesso.");
            loadData();
        } catch (err: any) {
            console.error(err);
            const msg = err?.message ?? '';
            if (msg.startsWith('CABIN_NOT_AVAILABLE')) {
                const label = msg.split(':')[2] ?? 'indisponível';
                toast.error(`Transferência bloqueada: acomodação ${label}.`);
            } else if (msg.startsWith('CABIN_OVERLAP')) {
                toast.error("Transferência bloqueada: já existe uma reserva nessa acomodação para esse período.");
            } else {
                toast.error("Erro ao alterar acomodação.");
            }
            setLoading(false);
        }
        setDnDData(null);
    };

    const moveStayToCabin = async (stayId: string, newCabinId: string) => {
        if (!contextProperty?.id) return;
        setLoading(true);
        try {
            // Non-active stays: just reassign cabin, no cabin status changes needed
            await StayService.transferCabin(
                contextProperty.id,
                stayId,
                newCabinId,
                'available',
                userData?.id || "admin",
                userData?.fullName || "Admin"
            );
            chatwootSyncOnCabinTransfer(stayId, newCabinId).catch(() => {});
            toast.success("Acomodação alterada com sucesso.");
            loadData();
        } catch (err: any) {
            console.error(err);
            const msg = err?.message ?? '';
            if (msg.startsWith('CABIN_NOT_AVAILABLE')) {
                const label = msg.split(':')[2] ?? 'indisponível';
                toast.error(`Transferência bloqueada: acomodação ${label}.`);
            } else if (msg.startsWith('CABIN_OVERLAP')) {
                toast.error("Transferência bloqueada: já existe uma reserva nessa acomodação para esse período.");
            } else {
                toast.error("Erro ao alterar acomodação.");
            }
            setLoading(false);
        }
    };

    // ==========================================
    // BAR POSITION CALCULATION
    // ==========================================

    const getBarPosition = (itemCheckIn: string, itemCheckOut: string) => {
        if (!startDate) return null;
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

    const getSegmentsForCabin = (cabinId: string): CabinStaySegment[] => {
        const segments: CabinStaySegment[] = [];
        for (const stay of stays) {
            const history = stay.cabinHistory || [];

            // Historical segments: past cabin assignments that match this cabin
            for (const entry of history) {
                if (entry.cabinId === cabinId) {
                    segments.push({
                        stay,
                        cabinId,
                        effectiveCheckIn: entry.from,
                        effectiveCheckOut: entry.to,
                        isHistorical: true,
                    });
                }
            }

            // Current segment: if the stay is currently assigned to this cabin
            if (stay.cabinId === cabinId) {
                const fromDate = history.length > 0 ? history[history.length - 1].to : stay.checkIn;
                segments.push({
                    stay,
                    cabinId,
                    effectiveCheckIn: fromDate,
                    effectiveCheckOut: stay.checkOut,
                    isHistorical: false,
                });
            }
        }
        return segments;
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

    const sortedCabins = useMemo(() =>
        [...cabins].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        ),
        [cabins]
    );

    const unassignedStays = useMemo(() =>
        stays.filter(s => !s.cabinId && ['pending', 'pre_checkin_done'].includes(s.status)),
        [stays]
    );

    const maids = useMemo(() => staff.filter(s => s.role === 'maid' || s.role === 'governance'), [staff]);
    const technicians = useMemo(() => staff.filter(s => s.role === 'technician' || s.role === 'maintenance'), [staff]);

    // ==========================================
    // NAVIGATION
    // ==========================================

    const goToPreviousWeek = () => setStartDate(prev => prev ? addDays(prev, -7) : prev);
    const goToNextWeek = () => setStartDate(prev => prev ? addDays(prev, 7) : prev);
    const goToToday = () => setStartDate(addDays(startOfDay(new Date()), -3));

    // ==========================================
    // RENDER
    // ==========================================

    const ROW_HEIGHT = compact ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_NORMAL;

    return (
        <RoleGuard allowedRoles={["super_admin", "admin", "reception", "manager"]}>
            <PageShell maxWidth="full">

                <PageHeader
                    icon={CalendarDays}
                    title="Mapa de reservas"
                    subtitle={contextProperty?.name || "Carregando propriedade…"}
                    actions={(
                        <>
                            <Button variant={selectionMode === 'reservation' ? 'primary' : 'secondary'} icon={PlusCircle} onClick={() => setSelectionMode(prev => prev === 'reservation' ? null : 'reservation')}>
                                {selectionMode === 'reservation' ? "Arraste para reservar…" : "Criar reserva"}
                            </Button>
                            <Button variant={selectionMode === 'maintenance' ? 'primary' : 'secondary'} icon={Lock} onClick={() => setSelectionMode(prev => prev === 'maintenance' ? null : 'maintenance')}>
                                {selectionMode === 'maintenance' ? "Arraste para bloquear…" : "Bloquear"}
                            </Button>
                            <IconButton icon={compact ? AlignJustify : LayoutList} label={compact ? "Visualização normal" : "Visualização compacta"} variant="secondary" active={compact} onClick={() => setCompact(prev => !prev)} />
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 12, background: T.glass, border: `1px solid ${T.border}` }}>
                                <IconButton icon={ChevronLeft} label="Semana anterior" onClick={goToPreviousWeek} />
                                <Button size="sm" variant="soft" onClick={goToToday}>Hoje</Button>
                                <IconButton icon={ChevronRight} label="Próxima semana" onClick={goToNextWeek} />
                                <span className="ak-hide-mobile" style={{ padding: "0 10px", fontSize: 11, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" }}>
                                    {startDate ? `${format(startDate, "dd MMM", { locale: ptBR })} — ${format(addDays(startDate, VISIBLE_DAYS - 1), "dd MMM yyyy", { locale: ptBR })}` : ""}
                                </span>
                            </span>
                        </>
                    )}
                />

                {/* Map Container */}
                {!contextProperty?.id || loading ? (
                    <PageSkeleton kpis={0} rows={8} />
                ) : (
                    <div className="ak-card" data-pad="0" style={{ overflow: "hidden" }}>
                        <div className="flex">

                            {/* Fixed Cabin Column */}
                            <div className="shrink-0 border-r border-border z-10 bg-card" style={{ width: CABIN_COL_WIDTH }}>
                                {/* Header cell */}
                                <div
                                    className="flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-foreground/30 border-b border-border bg-secondary/50"
                                    style={{ height: ROW_HEIGHT }}
                                >
                                    Acomodação
                                </div>
                                {/* Linha Sem Cabana */}
                                {unassignedStays.length > 0 && (
                                    <div
                                        className="flex items-center gap-3 px-4 border-b border-amber-500/20 bg-amber-500/5"
                                        style={{ height: ROW_HEIGHT }}
                                    >
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-xs font-black text-amber-600 dark:text-amber-400 truncate tracking-tight text-right">
                                                Sem Cabana
                                            </p>
                                        </div>
                                        <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/10 text-amber-500">
                                            <Home size={16} />
                                        </div>
                                    </div>
                                )}
                                {/* Cabin rows */}
                                {sortedCabins.map((cabin) => (
                                    <div
                                        key={cabin.id}
                                        className={cn(
                                            "flex items-center gap-3 px-4 border-b border-border transition-colors",
                                            cabin.status === "cleaning" && "cursor-pointer hover:bg-amber-500/5"
                                        )}
                                        style={{ height: ROW_HEIGHT }}
                                        onClick={() => handleCabinStatusClick(cabin)}
                                    >
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-xs font-black text-foreground truncate tracking-tight text-right">
                                                {cabin.name}
                                            </p>
                                            {cabin.ignoreInOccupancy && (
                                                <p className="text-[8px] font-bold uppercase tracking-wider text-amber-500 truncate text-right">
                                                    Fora da ocupação
                                                </p>
                                            )}
                                        </div>
                                        <div className={cn(
                                            "shrink-0 flex items-center justify-center w-6 h-6 rounded-md",
                                            getCabinStatusColor(cabin.status),
                                            cabin.status === 'available' ? 'bg-emerald-500/10' :
                                                cabin.status === 'occupied' ? 'bg-red-500/10' :
                                                    cabin.status === 'cleaning' ? 'bg-amber-500/10' : 'bg-neutral-500/10'
                                        )} title={getCabinStatusLabel(cabin.status)}>
                                            {renderCabinStatusIcon(cabin.status)}
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
                                            const isToday = today ? isSameDay(day, today) : false;
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

                                    {/* Linha Sem Cabana — drop zone para desatrelar */}
                                    {unassignedStays.length > 0 && (
                                        <div
                                            className="flex border-b border-amber-500/20 bg-amber-500/5 relative"
                                            style={{ height: ROW_HEIGHT }}
                                            onDragOver={handleDragOver}
                                            onDrop={handleDropUnassigned}
                                        >
                                            {days.map((day, i) => {
                                                const isToday = today ? isSameDay(day, today) : false;
                                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                                return (
                                                    <div
                                                        key={i}
                                                        className={cn(
                                                            "shrink-0 border-r border-amber-500/10 z-0",
                                                            isToday ? "bg-primary/[0.04]" : (isWeekend ? "bg-amber-500/[0.02]" : "")
                                                        )}
                                                        style={{ width: DAY_WIDTH }}
                                                    />
                                                );
                                            })}
                                            {unassignedStays.map((stay, idx) => {
                                                const pos = getBarPosition(stay.checkIn, stay.checkOut);
                                                if (!pos) return null;
                                                const guestName = stay.guestName || "Hóspede";
                                                const shortName = guestName.split(" ")[0] + (guestName.split(" ").length > 1 ? ` ${guestName.split(" ").slice(-1)}` : "");
                                                return (
                                                    <button
                                                        key={stay.id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, stay)}
                                                        onClick={() => handleStayClick(stay)}
                                                        className={cn(
                                                            "absolute top-1.5 h-[calc(100%-12px)] flex items-center px-3 rounded-lg text-[10px] font-bold transition-all z-10 truncate cursor-grab active:cursor-grabbing hover:brightness-110 hover:scale-[1.02]",
                                                            "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-[0_0_12px_rgba(245,158,11,0.3)]",
                                                            pos.clippedLeft && "rounded-l-none border-l-2 border-dashed border-white/30",
                                                            pos.clippedRight && "rounded-r-none border-r-2 border-dashed border-white/30"
                                                        )}
                                                        style={{ left: pos.left + 2 + idx * 2, width: pos.width - 4 }}
                                                        title={`${guestName} — sem cabana · Arraste para uma cabana para atribuir`}
                                                    >
                                                        <span className="truncate">{shortName}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Cabin Rows with Stay Bars */}
                                    {sortedCabins.map((cabin) => {
                                        const cabinSegments = getSegmentsForCabin(cabin.id);
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
                                                    const isToday = today ? isSameDay(day, today) : false;
                                                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                                    const isHoliday = holidays.some(h => isSameDay(h, day));
                                                    const isSpecialDay = isWeekend || isHoliday;
                                                    const isSelected = isDayInSelection(cabin.id, i);

                                                    return (
                                                        <div
                                                            key={i}
                                                            className={cn(
                                                                "shrink-0 border-r border-border transition-colors z-0",
                                                                selectionMode ? "cursor-crosshair" : "cursor-default",
                                                                isToday ? "bg-primary/[0.04]" : (isSpecialDay ? "bg-destructive/[0.02]" : (selectionMode ? "hover:bg-foreground/[0.02]" : "")),
                                                                isSelected && "bg-primary/20"
                                                            )}
                                                            style={{ width: DAY_WIDTH }}
                                                            onMouseDown={() => handleMouseDown(cabin.id, i)}
                                                            onMouseEnter={() => handleMouseEnter(cabin.id, i)}
                                                        />
                                                    );
                                                })}

                                                {/* Stay Bars (absolute positioned) */}
                                                {cabinSegments.map((seg, segIdx) => {
                                                    const pos = getBarPosition(seg.effectiveCheckIn, seg.effectiveCheckOut);
                                                    if (!pos) return null;

                                                    const guestName = seg.stay.guestName || "Hóspede";
                                                    const shortName = guestName.split(" ")[0] + (guestName.split(" ").length > 1 ? ` ${guestName.split(" ").slice(-1)}` : "");

                                                    return (
                                                        <button
                                                            key={`${seg.stay.id}-${segIdx}`}
                                                            draggable={!seg.isHistorical && ['active', 'pending', 'pre_checkin_done'].includes(seg.stay.status)}
                                                            onDragStart={(e) => !seg.isHistorical && handleDragStart(e, seg.stay)}
                                                            onClick={() => handleStayClick(seg.stay)}
                                                            className={cn(
                                                                "absolute top-1.5 h-[calc(100%-12px)] flex items-center px-3 rounded-lg text-[10px] font-bold transition-all z-10 truncate",
                                                                seg.isHistorical
                                                                    ? "opacity-50 border border-dashed border-white/30 cursor-pointer bg-gradient-to-r from-neutral-500 to-neutral-600 text-white/80"
                                                                    : cn(
                                                                        "hover:brightness-110 hover:scale-[1.02]",
                                                                        ['active', 'pending', 'pre_checkin_done'].includes(seg.stay.status) ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                                                                        getStayBarColor(seg.stay)
                                                                    ),
                                                                pos.clippedLeft && "rounded-l-none border-l-2 border-dashed border-white/30",
                                                                pos.clippedRight && "rounded-r-none border-r-2 border-dashed border-white/30"
                                                            )}
                                                            style={{
                                                                left: pos.left + 2,
                                                                width: pos.width - 4,
                                                            }}
                                                            title={seg.isHistorical
                                                                ? `${guestName} (anterior) — ${format(new Date(seg.effectiveCheckIn), "dd/MM")} a ${format(new Date(seg.effectiveCheckOut), "dd/MM")}`
                                                                : `${guestName} — ${format(new Date(seg.effectiveCheckIn), "dd/MM")} a ${format(new Date(seg.effectiveCheckOut), "dd/MM")}`
                                                            }
                                                        >
                                                            <span className="truncate">{seg.isHistorical ? `${shortName} ↗` : shortName}</span>
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
                        <div className="flex items-center justify-center gap-6 p-4 border-t border-border bg-secondary/30">
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
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-3 rounded-sm bg-gradient-to-r from-neutral-500 to-neutral-600 opacity-50 border border-dashed border-white/30" />
                                <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Transferida</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-3 rounded-sm bg-gradient-to-r from-amber-500 to-amber-600" />
                                <span className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Sem Cabana</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Drag instruction hint */}
                <p className="text-center text-[10px] font-bold text-foreground/20 uppercase tracking-[0.2em]">
                    {selectionMode
                        ? `Modo ${selectionMode === 'reservation' ? 'Reserva' : 'Bloqueio'} ativo — arraste sobre as células e solte para confirmar • Pressione o botão novamente para cancelar`
                        : "Clique nas barras para ver detalhes • Arraste para mover entre cabanas • Arraste para 'Sem Cabana' para desatrelar"
                    }
                </p>

                {/* ==================== MODALS ==================== */}

                {/* Stay Details Modal */}
                {/* selectedGuest pode ser null (uso da casa) — o modal tolera e mostra o rótulo interno */}
                {selectedStay && (
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

                <Dialog open={isSelectionActionModalOpen} onClose={() => { setIsSelectionActionModalOpen(false); setSelectionData(null); }} presentation="auto" size="sm" icon={CalendarDays} iconTone="brand" title="Bloqueio de período" subtitle="Você selecionou um período. O que deseja fazer?"
                    footer={(<>
                        <Button variant="ghost" onClick={() => { setIsSelectionActionModalOpen(false); setSelectionData(null); }}>Cancelar</Button>
                        <Button variant="secondary" icon={Lock} onClick={() => handleSelectionAction('maintenance')}>Bloqueio de manutenção</Button>
                        <Button variant="primary" icon={PlusCircle} onClick={() => handleSelectionAction('reservation')}>Nova reserva</Button>
                    </>)}>
                    <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>Nova reserva abre o formulário de hospedagem com datas e cabana preenchidas; o bloqueio cria uma ordem de manutenção que trava a cabana no período.</p>
                </Dialog>

                <Dialog open={isHkActionModalOpen} onClose={() => { setIsHkActionModalOpen(false); setActionCabin(null); }} presentation="auto" size="sm" icon={Sparkles} iconTone="amber" title="Acomodação suja" subtitle={actionCabin?.name}
                    footer={(<>
                        <Button variant="ghost" onClick={() => { setIsHkActionModalOpen(false); setActionCabin(null); }}>Cancelar</Button>
                        <Button variant="secondary" onClick={() => handleHkAlternativeAction('open_os')}>Abrir ordem de serviço</Button>
                        <Button variant="primary" tone="green" icon={Sparkles} onClick={() => handleHkAlternativeAction('skip')}>Marcar como limpa</Button>
                    </>)}>
                    <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>Como deseja lidar com o status desta acomodação?</p>
                </Dialog>

                <Dialog open={isDnDActionModalOpen} onClose={() => { setIsDnDActionModalOpen(false); setDnDData(null); }} presentation="auto" size="sm" icon={Home} iconTone="red" title="Mudança de acomodação" subtitle="O hóspede já fez check-in"
                    footer={(<>
                        <Button variant="ghost" onClick={() => { setIsDnDActionModalOpen(false); setDnDData(null); }}>Cancelar movimentação</Button>
                        <Button variant="secondary" onClick={() => handleDnDAction(false)}>Só mover</Button>
                        <Button variant="primary" tone="amber" icon={Sparkles} onClick={() => handleDnDAction(true)}>Gerar faxina</Button>
                    </>)}>
                    <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>Ao mover para a nova acomodação, a antiga precisa de limpeza de troca?</p>
                </Dialog>

            </PageShell>
        </RoleGuard>
    );
}
