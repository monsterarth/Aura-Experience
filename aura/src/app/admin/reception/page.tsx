"use client";

import React, { useState, useEffect } from "react";
import {
    Users, LogIn, LogOut, Clock, CalendarCheck, Calendar,
    Coffee, MessageCircleWarning, AlertTriangle,
    Sparkles, CheckCircle2, Timer, BellRing,
    Home, Utensils, Info, Check, X, Megaphone, CheckCircle, Star
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { supabase } from "@/lib/supabase";
import { HousekeepingService } from "@/services/housekeeping-service";
import { ConciergeService } from "@/services/concierge-service";
import { StructureService } from "@/services/structure-service";
import { fbService } from "@/services/fb-service";
import { StayService } from "@/services/stay-service";
import { HousekeepingTask, ConciergeRequest, FBOrder, StructureBooking, Structure, Cabin } from "@/types/aura";
import { toast } from "sonner";

export default function ReceptionDashboard() {
    const { userData } = useAuth();
    const { currentProperty: property, loading: propLoading } = useProperty();

    const [currentTime, setCurrentTime] = useState(new Date());
    const [breakfastMode, setBreakfastMode] = useState<"buffet" | "delivery">("delivery");
    const [loading, setLoading] = useState(true);

    // Stats
    const [stats, setStats] = useState({ checkins: 0, checkouts: 0, preCheckins: 0, walkIns: 0 });

    // Governança
    const [hkTasks, setHkTasks] = useState<HousekeepingTask[]>([]);
    const [cabins, setCabins] = useState<Cabin[]>([]);

    // Estruturas
    const [structures, setStructures] = useState<Structure[]>([]);
    const [structureBookings, setStructureBookings] = useState<StructureBooking[]>([]);
    const [bookingCabinNames, setBookingCabinNames] = useState<Record<string, string>>({});

    // Alertas
    const [detractors, setDetractors] = useState<any[]>([]);
    const [msgFailures, setMsgFailures] = useState<any[]>([]);

    // Concierge (realtime)
    const [pendingRequests, setPendingRequests] = useState<ConciergeRequest[]>([]);

    // F&B
    const [breakfastOrders, setBreakfastOrders] = useState<FBOrder[]>([]);
    const [orderCabinNames, setOrderCabinNames] = useState<Record<string, string>>({});

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Sincronizar switch de café com valor persistido
    useEffect(() => {
        const saved = property?.settings?.fbSettings?.breakfast?.dailyMode;
        if (saved) setBreakfastMode(saved);
    }, [property?.id]);

    // ==========================================
    // HELPERS
    // ==========================================

    function formatTimeAgo(iso: string): string {
        const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (mins < 60) return `Há ${mins} min`;
        const h = Math.floor(mins / 60);
        return `Há ${h} hora${h > 1 ? 's' : ''}`;
    }

    function getTaskProgress(task: HousekeepingTask): number {
        if (!task.checklist.length)
            return task.status === 'in_progress' ? 30 : task.status === 'waiting_conference' ? 95 : 0;
        return Math.round(task.checklist.filter(i => i.checked).length / task.checklist.length * 100);
    }

    function getElapsed(task: HousekeepingTask): string {
        if (!task.startedAt) return 'Aguardando';
        const mins = Math.round((Date.now() - new Date(task.startedAt as string).getTime()) / 60000);
        return `${mins} min`;
    }

    function getTaskLocationName(task: HousekeepingTask): string {
        if (task.cabinId) return cabins.find(c => c.id === task.cabinId)?.name ?? '—';
        return structures.find(s => s.id === task.structureId)?.name ?? '—';
    }

    function formatOrderItems(items: any[]): string {
        return items.filter(i => i.menuItemId !== 'guest_observations')
            .map(i => `${i.quantity}x ${i.name}`).join(', ');
    }

    // ==========================================
    // DATA LOADERS
    // ==========================================

    async function loadCabins() {
        const { data } = await supabase.from('cabins').select('id, name, status').eq('propertyId', property!.id);
        const result = (data || []) as Cabin[];
        setCabins(result);
        return result;
    }

    async function loadStats() {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000);

        const [a, b, c, d] = await Promise.all([
            supabase.from('stays').select('id', { count: 'exact', head: true })
                .eq('propertyId', property!.id)
                .gte('checkIn', todayStart.toISOString()).lte('checkIn', todayEnd.toISOString())
                .in('status', ['pending', 'pre_checkin_done']),
            supabase.from('stays').select('id', { count: 'exact', head: true })
                .eq('propertyId', property!.id)
                .gte('checkOut', todayStart.toISOString()).lte('checkOut', todayEnd.toISOString())
                .eq('status', 'active'),
            supabase.from('stays').select('id', { count: 'exact', head: true })
                .eq('propertyId', property!.id)
                .gte('checkIn', todayStart.toISOString()).lte('checkIn', in48h.toISOString())
                .eq('status', 'pending'),
            supabase.from('cabins').select('id', { count: 'exact', head: true })
                .eq('propertyId', property!.id).eq('status', 'available'),
        ]);
        setStats({ checkins: a.count || 0, checkouts: b.count || 0, preCheckins: c.count || 0, walkIns: d.count || 0 });
    }

    async function loadStructures(cabinsData: Cabin[]) {
        const today = new Date().toISOString().split('T')[0];
        const [structs, bookings] = await Promise.all([
            StructureService.getStructures(property!.id),
            StructureService.getAllBookingsByDate(property!.id, today),
        ]);
        setStructures(structs);
        const active = bookings.filter(b => !['cancelled', 'rejected'].includes(b.status));
        setStructureBookings(active);

        const nameMap: Record<string, string> = {};
        await Promise.all(active.filter(b => b.stayId).map(async b => {
            const { data: stay } = await supabase.from('stays').select('cabinId').eq('id', b.stayId!).single();
            if (stay?.cabinId) {
                const cabin = cabinsData.find(c => c.id === stay.cabinId);
                if (cabin) nameMap[b.id] = cabin.name;
            }
        }));
        setBookingCabinNames(nameMap);
    }

    async function loadAlerts(cabinsData: Cabin[]) {
        const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const [surveyRes, msgRes] = await Promise.all([
            supabase.from('survey_responses').select('id, stayId, metrics, createdAt')
                .eq('propertyId', property!.id).gte('createdAt', since48h).order('createdAt', { ascending: false }),
            supabase.from('messages').select('id, triggerEvent, to, createdAt')
                .eq('propertyId', property!.id).eq('status', 'failed')
                .gte('createdAt', since48h).order('createdAt', { ascending: false }).limit(5),
        ]);

        const detractorList = (surveyRes.data || []).filter((r: any) => r.metrics?.isDetractor === true);
        const enriched = await Promise.all(detractorList.slice(0, 5).map(async (r: any) => {
            const { data: stay } = await supabase.from('stays').select('cabinId').eq('id', r.stayId).maybeSingle();
            const cabin = stay?.cabinId ? cabinsData.find(c => c.id === stay.cabinId) : null;
            return { ...r, cabinName: cabin?.name || 'Hóspede' };
        }));

        setDetractors(enriched);
        setMsgFailures(msgRes.data || []);
    }

    async function loadBreakfast() {
        const today = new Date().toISOString().split('T')[0];
        const orders = await fbService.getOrders(property!.id, { date: today, type: 'breakfast' });
        const active = orders.filter(o => o.status !== 'cancelled');
        setBreakfastOrders(active);

        const cabinMap: Record<string, string> = {};
        await Promise.all(active.filter(o => o.stayId).map(async o => {
            if (cabinMap[o.stayId!]) return;
            const info = await StayService.getStayWithGuestAndCabin(property!.id, o.stayId!);
            if (info?.cabin) cabinMap[o.stayId!] = info.cabin.name;
        }));
        setOrderCabinNames(cabinMap);
    }

    async function handleBreakfastModeToggle(mode: 'delivery' | 'buffet') {
        setBreakfastMode(mode);
        try {
            await fbService.setDailyBreakfastMode(property!.id, mode);
        } catch {
            toast.error('Erro ao salvar modalidade do café.');
        }
    }

    async function loadInitialData() {
        if (!property) return;
        setLoading(true);
        try {
            const cabinsData = await loadCabins();
            await Promise.all([
                loadStats(),
                loadStructures(cabinsData),
                loadAlerts(cabinsData),
                loadBreakfast(),
            ]);
        } catch {
            toast.error('Erro ao carregar dados da recepção.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!property?.id) return;
        loadInitialData();

        const unsubHK = HousekeepingService.listenToActiveTasks(property.id, setHkTasks);
        const unsubConcierge = ConciergeService.listenToPendingRequests(property.id, setPendingRequests);

        const staysChannel = supabase.channel(`reception_stays_${property.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'stays',
                filter: `propertyId=eq.${property.id}` }, loadStats)
            .subscribe();

        return () => { unsubHK(); unsubConcierge(); supabase.removeChannel(staysChannel); };
    }, [property?.id]);

    // ==========================================
    // DERIVED VALUES
    // ==========================================

    const activeTasks = hkTasks.filter(t => ['pending', 'in_progress', 'waiting_conference'].includes(t.status));

    const recentlyReleasedCabins = hkTasks
        .filter(t => t.status === 'completed' && t.cabinId && t.finishedAt &&
            Date.now() - new Date(t.finishedAt as string).getTime() < 4 * 60 * 60 * 1000)
        .map(t => cabins.find(c => c.id === t.cabinId)?.name ?? t.cabinId!);

    const nowHHMM = currentTime.toTimeString().slice(0, 5);
    const structureAgenda = structureBookings.map(b => {
        const structure = structures.find(s => s.id === b.structureId);
        const guestLabel = bookingCabinNames[b.id] || b.guestName || '—';
        let displayStatus: 'in_use' | 'upcoming' | 'freed';
        if (b.status === 'completed') displayStatus = 'freed';
        else if (b.startTime <= nowHHMM && nowHHMM < b.endTime) displayStatus = 'in_use';
        else displayStatus = 'upcoming';
        const [eh, em] = b.endTime.split(':').map(Number);
        const endMins = eh * 60 + em;
        const nowMins = currentTime.getHours() * 60 + currentTime.getMinutes();
        const freeMins = Math.max(0, nowMins - endMins);
        return {
            id: b.id, name: structure?.name ?? '—', status: displayStatus,
            by: guestLabel, until: b.endTime, at: b.startTime,
            time: `Há ${freeMins} min`, needCleaning: displayStatus === 'freed' && structure?.requiresTurnover,
        };
    });

    const alertItems = [
        ...detractors.map(r => ({
            type: 'review' as const,
            title: 'Avaliação Negativa (Detrator)',
            desc: `${r.cabinName} avaliou com nota ${r.metrics?.npsScore ?? r.metrics?.averageRating ?? '—'}/10.`,
            time: formatTimeAgo(r.createdAt),
        })),
        ...msgFailures.map(m => ({
            type: 'message_error' as const,
            title: 'Falha: Mensagem Automática',
            desc: `Não foi possível enviar (${m.triggerEvent || 'automação'}) para ${m.to || 'hóspede'}.`,
            time: formatTimeAgo(m.createdAt),
        })),
    ].slice(0, 5);

    // ==========================================
    // GUARDS
    // ==========================================

    if (propLoading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin w-8 h-8 text-primary" />
        </div>
    );
    if (!property) return (
        <div className="p-8 text-center text-muted-foreground">
            Selecione uma propriedade para ver a recepção.
        </div>
    );

    return (
        <div className="p-4 lg:p-8 space-y-6 lg:space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl lg:text-3xl font-black tracking-tight flex items-center gap-3">
                        <span className="bg-gradient-to-r from-primary to-primary/50 text-transparent bg-clip-text">
                            Recepção
                        </span>
                        <span className="text-sm font-medium px-2 py-1 bg-white/5 border border-white/10 rounded-md text-muted-foreground flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Operação Ao Vivo
                        </span>
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Visão geral da operação, status das cabanas, pedidos e alertas.
                    </p>
                </div>

                <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
                    <Clock className="w-5 h-5 text-primary" />
                    <div className="text-right">
                        <p className="font-bold text-lg leading-none">
                            {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                            {currentTime.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' })}
                        </p>
                    </div>
                </div>
            </div>

            {/* TOP STATS GRID */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    icon={LogIn}
                    label="Check-ins Hoje"
                    value={stats.checkins}
                    color="text-blue-400"
                    bg="bg-blue-400/10"
                />
                <StatCard
                    icon={LogOut}
                    label="Check-outs Hoje"
                    value={stats.checkouts}
                    color="text-orange-400"
                    bg="bg-orange-400/10"
                />
                <StatCard
                    icon={CalendarCheck}
                    label="Pré-check-ins (48h)"
                    value={stats.preCheckins}
                    color="text-emerald-400"
                    bg="bg-emerald-400/10"
                />
                <StatCard
                    icon={Home}
                    label="Disponíveis Walk-in"
                    value={stats.walkIns}
                    color="text-purple-400"
                    bg="bg-purple-400/10"
                    highlight
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* COLUNA 1: Operação de Limpeza e Estruturas */}
                <div className="space-y-6">
                    {/* FAXINAS */}
                    <div className="bg-card border border-white/5 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="font-bold flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-primary" />
                                Governança
                            </h2>
                        </div>

                        <div className="space-y-4">
                            {activeTasks.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma tarefa ativa.</p>
                            )}
                            {activeTasks.map(task => (
                                <div key={task.id} className="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-sm">{getTaskLocationName(task)}</span>
                                        <span className="text-[10px] uppercase font-bold text-primary tracking-wider bg-primary/10 px-2 py-0.5 rounded-full">
                                            {task.type === 'turnover' ? 'Faxina' : task.type === 'daily' ? 'Diária' : 'Avulsa'}
                                        </span>
                                    </div>
                                    <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${getTaskProgress(task)}%` }} />
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1"><Timer size={12} /> {getElapsed(task)} left</span>
                                        <span>{getTaskProgress(task)}%</span>
                                    </div>
                                </div>
                            ))}

                            {recentlyReleasedCabins.length > 0 && (
                                <div className="pt-3 border-t border-white/10">
                                    <p className="text-xs text-muted-foreground mb-2">Recém liberadas:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {recentlyReleasedCabins.map(name => (
                                            <span key={name} className="bg-emerald-500/10 text-emerald-400 text-xs font-semibold px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                                                <CheckCircle2 size={12} /> {name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ESTRUTURAS */}
                    <div className="bg-card border border-white/5 rounded-3xl p-5 shadow-lg">
                        <h2 className="font-bold flex items-center gap-2 mb-5">
                            <Calendar className="w-5 h-5 text-purple-400" />
                            Agenda das Estruturas
                        </h2>
                        <div className="space-y-3">
                            {structureAgenda.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma reserva hoje.</p>
                            )}
                            {structureAgenda.map(est => (
                                <div key={est.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-2 h-2 rounded-full",
                                            est.status === 'in_use' && "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]",
                                            est.status === 'upcoming' && "bg-blue-500",
                                            est.status === 'freed' && "bg-emerald-500"
                                        )} />
                                        <div>
                                            <p className="font-semibold text-sm leading-none">{est.name}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {est.status === 'in_use' && `Uso por ${est.by} até ${est.until}`}
                                                {est.status === 'upcoming' && `Reserva ${est.by} às ${est.at}`}
                                                {est.status === 'freed' && `Liberada ${est.time}`}
                                            </p>
                                        </div>
                                    </div>
                                    {est.needCleaning && (
                                        <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded border border-red-500/30">
                                            Limpar
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* COLUNA 2: Alertas e Pedidos */}
                <div className="space-y-6">
                    {/* ALERTAS CRÍTICOS (Detratores e Erros) */}
                    <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-5 shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                        <h2 className="font-bold text-red-400 flex items-center gap-2 mb-4">
                            <AlertTriangle className="w-5 h-5" />
                            Atenção Requerida (48h)
                        </h2>
                        <div className="space-y-3">
                            {alertItems.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">Nenhum alerta nas últimas 48h.</p>
                            )}
                            {alertItems.map((alert, i) => (
                                <div key={i} className="bg-black/20 border border-red-500/10 rounded-2xl p-3 flex gap-3">
                                    <div className="shrink-0 mt-0.5">
                                        {alert.type === 'review' ? (
                                            <Star className="text-yellow-500 w-4 h-4 fill-yellow-500" />
                                        ) : (
                                            <MessageCircleWarning className="text-red-400 w-4 h-4" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm text-red-200">{alert.title}</h3>
                                        <p className="text-xs text-muted-foreground mt-1 leading-snug">{alert.desc}</p>
                                        <p className="text-[10px] text-red-500/60 mt-2 font-mono">{alert.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* PEDIDOS E SERVIÇOS */}
                    <div className="bg-card border border-white/5 rounded-3xl p-5 shadow-lg">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="font-bold flex items-center gap-2">
                                <BellRing className="w-5 h-5 text-blue-400" />
                                Pedidos dos Hóspedes
                            </h2>
                        </div>

                        <div className="space-y-3">
                            {pendingRequests.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">Nenhum pedido pendente.</p>
                            )}
                            {pendingRequests.map(p => (
                                <div key={p.id} className="bg-white/5 border border-white/5 rounded-2xl p-3 flex justify-between items-center">
                                    <div>
                                        <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">
                                            {p.item?.category === 'loan' ? 'Empréstimo' : 'Concierge'}
                                        </span>
                                        <p className="font-bold text-sm mt-0.5">{p.item?.name ?? p.itemId}</p>
                                        <p className="text-xs text-muted-foreground">{p.cabinName ?? '—'}</p>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-1">
                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-400 border-orange-500/20">
                                            Aguardando
                                        </span>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Timer size={12} /> {formatTimeAgo(p.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* COLUNA 3: F&B (Café da Manhã) */}
                <div className="space-y-6">
                    <div className="bg-card border border-white/5 rounded-3xl p-5 shadow-lg h-full flex flex-col">
                        <h2 className="font-bold flex items-center gap-2 mb-5">
                            <Coffee className="w-5 h-5 text-amber-500" />
                            Café da Manhã & F&B
                        </h2>

                        {/* SWITCH MODALIDADE — visível apenas para propriedades com modality 'both' */}
                        {property.settings?.fbSettings?.breakfast?.modality === 'both' && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-1 flex relative mb-6">
                            <div className={cn(
                                "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-primary transition-all duration-300 shadow-md",
                                breakfastMode === 'delivery' ? "left-1" : "left-[calc(50%+3px)]"
                            )} />

                            <button
                                onClick={() => handleBreakfastModeToggle('delivery')}
                                className={cn(
                                    "relative z-10 flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors",
                                    breakfastMode === 'delivery' ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Cesta Delivery
                            </button>
                            <button
                                onClick={() => handleBreakfastModeToggle('buffet')}
                                className={cn(
                                    "relative z-10 flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors",
                                    breakfastMode === 'buffet' ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Buffet Salão
                            </button>
                        </div>
                        )}

                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-foreground/80">Pedidos p/ Hoje (Delivery)</h3>
                            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-mono">
                                {breakfastOrders.length}
                            </span>
                        </div>

                        <div className="space-y-3 flex-1">
                            {breakfastOrders.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">Nenhum pedido de café da manhã hoje.</p>
                            )}
                            {breakfastOrders.map(order => (
                                <div key={order.id} className="bg-black/20 border border-white/5 rounded-2xl p-3 flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-sm text-amber-100">
                                            {orderCabinNames[order.stayId!] ?? 'Cabana'}
                                        </span>
                                        <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono text-muted-foreground">
                                            <Clock size={10} /> {order.deliveryTime ?? '—'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground italic">&quot;{formatOrderItems(order.items as any[])}&quot;</p>
                                    <div className="flex justify-end mt-1">
                                        {order.status === 'preparing' ? (
                                            <span className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1">
                                                <Utensils size={12} /> Preparando
                                            </span>
                                        ) : (
                                            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                                Aguardando
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {breakfastMode === 'buffet' && (
                                <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex gap-3 text-amber-200">
                                    <Info className="shrink-0 w-5 h-5 text-amber-400" />
                                    <p className="text-xs leading-relaxed">
                                        A modalidade está configurada como <strong>Buffet Salão</strong>. Os pedidos acima são de estadias que solicitaram café no quarto como serviço à parte.
                                    </p>
                                </div>
                            )}
                        </div>

                        <button className="w-full mt-4 py-3 bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-widest rounded-xl border border-white/10 transition-colors flex items-center justify-center gap-2">
                            <Utensils size={14} />
                            Gerenciar Cardápio F&B
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, color, bg, highlight = false }: any) {
    return (
        <div className={cn(
            "bg-card border p-4 lg:p-5 rounded-3xl relative overflow-hidden group transition-all duration-300",
            highlight ? "border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.1)]" : "border-white/5 shadow-sm"
        )}>
            <div className={cn(
                "absolute -right-4 -top-4 w-24 h-24 rounded-full blur-3xl opacity-50 transition-opacity group-hover:opacity-100",
                bg
            )} />
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center mb-4 relative z-10", bg, color)}>
                <Icon size={20} />
            </div>
            <div className="relative z-10">
                <p className="text-2xl lg:text-3xl font-black mb-1">{value}</p>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
            </div>
        </div>
    );
}
