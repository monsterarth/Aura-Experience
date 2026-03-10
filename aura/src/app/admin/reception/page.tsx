"use client";

import React, { useState, useEffect } from "react";
import {
    Users, LogIn, LogOut, Clock, CalendarCheck, Calendar,
    Coffee, MessageCircleWarning, AlertTriangle,
    Sparkles, CheckCircle2, Timer, BellRing,
    Home, Utensils, Info, Check, X, Megaphone, CheckCircle, Star
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock Data
const TOP_STATS = {
    checkinsPendentes: 4,
    checkoutsPendentes: 2,
    preCheckins48h: 12,
    cabanasWalkIn: 3
};

const PEDIDOS = [
    { id: 1, type: "concierge", title: "Lenha Extra", cabin: "Cabana 01", time: "10 min", status: "waiting" },
    { id: 2, type: "loan", title: "Kit Fondue", cabin: "Cabana 03", time: "15 min", status: "progress" },
];

const FAXINAS = [
    { id: 1, cabin: "Cabana 02", type: "Checkout", progress: 60, timeLeft: "25 min" },
    { id: 2, cabin: "Cabana 05", type: "Retoque", progress: 90, timeLeft: "5 min" },
];

const CABANAS_LIBERADAS = ["Cabana 04", "Cabana 07"];

const ESTRUTURAS = [
    { name: "Spa", status: "in_use", by: "Cabana 01", until: "14:00" },
    { name: "Fogo de Chão", status: "upcoming", by: "Cabana 03", at: "15:00" },
    { name: "Sauna", status: "freed", time: "Há 10 min", needCleaning: true }
];

const ALERTS = [
    {
        type: "review",
        title: "Avaliação Negativa (Detrator)",
        desc: "Cabana 06 avaliou a estadia com nota 6/10 (Falta de água quente).",
        time: "Há 2 horas"
    },
    {
        type: "message_error",
        title: "Falha: Mensagem de Boas-vindas",
        desc: "Não foi possível enviar WhatsApp para João (Cabana 02).",
        time: "Há 15 min"
    }
];

const BREAKFAST_ORDERS = [
    { cabin: "Cabana 01", time: "08:30", items: "2x Ovos, 1x Suco Laranja", status: "preparing" },
    { cabin: "Cabana 03", time: "09:00", items: "Cesta Completa, S/ Glúten", status: "pending" },
];

export default function ReceptionDashboard() {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [breakfastMode, setBreakfastMode] = useState<"buffet" | "delivery">("delivery");

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

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
                    value={TOP_STATS.checkinsPendentes}
                    color="text-blue-400"
                    bg="bg-blue-400/10"
                />
                <StatCard
                    icon={LogOut}
                    label="Check-outs Hoje"
                    value={TOP_STATS.checkoutsPendentes}
                    color="text-orange-400"
                    bg="bg-orange-400/10"
                />
                <StatCard
                    icon={CalendarCheck}
                    label="Pré-check-ins (48h)"
                    value={TOP_STATS.preCheckins48h}
                    color="text-emerald-400"
                    bg="bg-emerald-400/10"
                />
                <StatCard
                    icon={Home}
                    label="Disponíveis Walk-in"
                    value={TOP_STATS.cabanasWalkIn}
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
                            {FAXINAS.map(f => (
                                <div key={f.id} className="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-sm">{f.cabin}</span>
                                        <span className="text-[10px] uppercase font-bold text-primary tracking-wider bg-primary/10 px-2 py-0.5 rounded-full">
                                            {f.type}
                                        </span>
                                    </div>
                                    <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${f.progress}%` }} />
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1"><Timer size={12} /> {f.timeLeft} left</span>
                                        <span>{f.progress}%</span>
                                    </div>
                                </div>
                            ))}

                            {CABANAS_LIBERADAS.length > 0 && (
                                <div className="pt-3 border-t border-white/10">
                                    <p className="text-xs text-muted-foreground mb-2">Recém liberadas:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {CABANAS_LIBERADAS.map(c => (
                                            <span key={c} className="bg-emerald-500/10 text-emerald-400 text-xs font-semibold px-2 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                                                <CheckCircle2 size={12} /> {c}
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
                            {ESTRUTURAS.map((est, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
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
                            {ALERTS.map((alert, i) => (
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
                            <span className="text-[10px] bg-white/10 text-muted-foreground px-2 py-1 rounded-lg uppercase font-bold tracking-widest border border-white/5">
                                Em Breve
                            </span>
                        </div>

                        <div className="space-y-3 opacity-60 pointer-events-none grayscale-[0.5] transition-all hover:grayscale-0 hover:opacity-100">
                            {PEDIDOS.map(p => (
                                <div key={p.id} className="bg-white/5 border border-white/5 rounded-2xl p-3 flex justify-between items-center">
                                    <div>
                                        <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">
                                            {p.type === 'loan' ? 'Empréstimo' : 'Concierge'}
                                        </span>
                                        <p className="font-bold text-sm mt-0.5">{p.title}</p>
                                        <p className="text-xs text-muted-foreground">{p.cabin}</p>
                                    </div>
                                    <div className="text-right flex flex-col items-end gap-1">
                                        <span className={cn(
                                            "text-xs font-medium px-2 py-0.5 rounded-full border",
                                            p.status === 'waiting' ? "bg-orange-500/10 text-orange-400 border-orange-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                        )}>
                                            {p.status === 'waiting' ? 'Aguardando' : 'Em Andamento'}
                                        </span>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Timer size={12} /> {p.time}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            <div className="mt-4 text-center p-3 border border-dashed border-white/10 rounded-xl">
                                <p className="text-xs text-muted-foreground">O módulo de Pedidos será ativado na próxima atualização.</p>
                            </div>
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

                        {/* SWITCH MODALIDADE */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-1 flex relative mb-6">
                            <div className={cn(
                                "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-primary transition-all duration-300 shadow-md",
                                breakfastMode === 'delivery' ? "left-1" : "left-[calc(50%+3px)]"
                            )} />

                            <button
                                onClick={() => setBreakfastMode('delivery')}
                                className={cn(
                                    "relative z-10 flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors",
                                    breakfastMode === 'delivery' ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Cesta Delivery
                            </button>
                            <button
                                onClick={() => setBreakfastMode('buffet')}
                                className={cn(
                                    "relative z-10 flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors",
                                    breakfastMode === 'buffet' ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Buffet Salão
                            </button>
                        </div>

                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-foreground/80">Pedidos p/ Hoje (Delivery)</h3>
                            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-mono">
                                {BREAKFAST_ORDERS.length}
                            </span>
                        </div>

                        <div className="space-y-3 flex-1">
                            {BREAKFAST_ORDERS.map((order, i) => (
                                <div key={i} className="bg-black/20 border border-white/5 rounded-2xl p-3 flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-sm text-amber-100">{order.cabin}</span>
                                        <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono text-muted-foreground">
                                            <Clock size={10} /> {order.time}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground italic">&quot;{order.items}&quot;</p>
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
