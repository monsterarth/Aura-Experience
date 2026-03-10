"use client";

import React, { useState, useEffect } from "react";
import { useProperty } from "@/context/PropertyContext";
import { fbService } from "@/services/fb-service";
import { StayService } from "@/services/stay-service";
import { FBOrder, Stay } from "@/types/aura";
import { Loader2, RefreshCcw, Printer, Clock, CheckCircle2, Package, ChefHat, CalendarDays, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function FBOrdersPage() {
    const { currentProperty } = useProperty();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<FBOrder[]>([]);
    const [stays, setStays] = useState<{ [key: string]: { cabinName: string, guestName: string } }>({});

    // Filter controls
    const [dateFilter, setDateFilter] = useState<"yesterday" | "today" | "tomorrow">("today");
    const [typeFilter, setTypeFilter] = useState<"all" | "breakfast" | "restaurant">("all");

    // Printing Modal
    const [printingOrder, setPrintingOrder] = useState<FBOrder | null>(null);

    useEffect(() => {
        if (currentProperty) loadOrders();
    }, [currentProperty, dateFilter, typeFilter]);

    // Simple Auto-Refresh (a cada 30 seg)
    useEffect(() => {
        const interval = setInterval(() => {
            if (currentProperty) loadOrders(false);
        }, 30000);
        return () => clearInterval(interval);
    }, [currentProperty, dateFilter, typeFilter]);

    async function loadOrders(showLoader = true) {
        if (!currentProperty) return;
        if (showLoader) setLoading(true);

        try {
            // Calculate target date based on filter
            const targetDate = new Date();
            if (dateFilter === "yesterday") targetDate.setDate(targetDate.getDate() - 1);
            if (dateFilter === "tomorrow") targetDate.setDate(targetDate.getDate() + 1);
            const isoDate = targetDate.toISOString().split('T')[0];

            const filters: any = { date: isoDate };
            if (typeFilter !== "all") filters.type = typeFilter;

            const fetchedOrders = await fbService.getOrders(currentProperty.id, filters);
            setOrders(fetchedOrders);

            // Fetch missing stay details (Cabin names, guest names)
            const newStays = { ...stays };
            let hasNewStays = false;

            for (const order of fetchedOrders) {
                if (order.stayId && !newStays[order.stayId]) {
                    try {
                        const stayInfo = await StayService.getStayWithGuestAndCabin(currentProperty.id, order.stayId);
                        if (stayInfo) {
                            newStays[order.stayId] = {
                                cabinName: stayInfo.cabin?.name || "N/A",
                                guestName: stayInfo.guest?.fullName || "Desconhecido",
                            };
                            hasNewStays = true;
                        }
                    } catch (e) {
                        console.error("Error fetching stay", e);
                    }
                }
            }

            if (hasNewStays) {
                setStays(newStays);
            }

        } catch (error) {
            toast.error("Erro ao carregar pedidos.");
        } finally {
            if (showLoader) setLoading(false);
        }
    }

    async function updateStatus(id: string, newStatus: FBOrder['status']) {
        try {
            await fbService.updateOrderStatus(id, newStatus);
            toast.success("Status atualizado!");
            setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
        } catch (error) {
            toast.error("Erro ao atualizar status.");
        }
    }

    // Handlers para impressão térmica simulada
    const handlePrint = (order: FBOrder) => {
        setPrintingOrder(order);
        setTimeout(() => {
            window.print();
        }, 300);
    };

    if (loading) return <div className="flex justify-center p-24"><Loader2 className="animate-spin text-primary" size={40} /></div>;

    const StatusBadge = ({ status }: { status: string }) => {
        switch (status) {
            case 'pending': return <span className="bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-1.5"><Clock size={14} /> Pendente</span>;
            case 'preparing': return <span className="bg-blue-500/10 text-blue-500 border border-blue-500/20 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-1.5"><ChefHat size={14} /> Preparando</span>;
            case 'delivered': return <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-1.5"><CheckCircle2 size={14} /> Entregue</span>;
            case 'cancelled': return <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest">Cancelado</span>;
            default: return <span className="bg-secondary text-muted-foreground px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">{status}</span>;
        }
    };

    const targetDateObj = new Date();
    if (dateFilter === "yesterday") targetDateObj.setDate(targetDateObj.getDate() - 1);
    if (dateFilter === "tomorrow") targetDateObj.setDate(targetDateObj.getDate() + 1);

    return (
        <div className="space-y-4 md:space-y-8 p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 print:bg-white print:text-black print:p-0 print:space-y-0">
            {/* INVISIBLE PRINT AREA - Só aparece na hora de dar Ctrl+P graças às classes Tailwind print: */}
            {printingOrder && (
                <div className="hidden print:block w-[80mm] min-h-[50mm] p-2 font-mono text-black mx-auto overflow-hidden">
                    <div className="text-center mb-4 border-b-2 border-dashed border-black pb-4">
                        <h2 className="font-extrabold text-xl uppercase leading-tight">{currentProperty?.name}</h2>
                        <h3 className="font-bold text-lg leading-tight">CAFE DA MANHA - TICKET</h3>
                        <p className="text-sm">Pedido #{printingOrder.id.substring(0, 6).toUpperCase()}</p>
                        <p className="text-sm mt-1">{new Date(printingOrder.createdAt || '').toLocaleString('pt-BR')}</p>
                    </div>

                    <div className="mb-4 text-center">
                        <h1 className="text-4xl font-black border-4 border-black inline-block px-4 py-2 rounded-xl mb-2">
                            {printingOrder.stayId ? stays[printingOrder.stayId]?.cabinName : "N/A"}
                        </h1>
                        {printingOrder.deliveryTime && (
                            <div className="text-xl font-bold">Entrega: {printingOrder.deliveryTime}</div>
                        )}
                    </div>

                    <div className="border-t-2 border-b-2 border-dashed border-black py-4 mb-4 space-y-3">
                        {printingOrder.items.filter((it: any) => it.menuItemId !== 'guest_observations').map((it: any, i: number) => (
                            <div key={i} className="text-sm font-bold space-y-0.5">
                                <div className="flex gap-2">
                                    <span className="w-8 shrink-0">{it.quantity}X</span>
                                    <span className="flex-1 uppercase">{it.name}</span>
                                </div>
                                {it.flavor && <div className="pl-8 text-xs font-normal">Sabor: {it.flavor}</div>}
                                {it.guestName && <div className="pl-8 text-xs font-bold uppercase">→ {it.guestName}</div>}
                            </div>
                        ))}
                    </div>

                    {(() => {
                        const obs = (printingOrder.items as any[]).find(it => it.menuItemId === 'guest_observations');
                        return obs ? (
                            <div className="border-b-2 border-dashed border-black pb-4 mb-4">
                                <p className="font-extrabold text-sm uppercase mb-1">OBSERVAÇÕES:</p>
                                <p className="text-sm whitespace-pre-wrap break-words">{obs.notes}</p>
                            </div>
                        ) : null;
                    })()}

                    <div className="text-center font-bold text-sm mb-4">
                        TOTAL: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(printingOrder.totalPrice)}
                    </div>
                </div>
            )}

            {/* SCREEN VIEW (Oculto na impressão) */}
            <div className="print:hidden space-y-8">
                {/* Filtros e Controles */}
                <div className="flex flex-col lg:flex-row gap-4 justify-between bg-card border border-border p-4 rounded-3xl shadow-sm">
                    <div className="flex bg-secondary p-1 rounded-2xl w-full lg:w-auto">
                        <button onClick={() => setDateFilter("yesterday")} className={cn("flex-1 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all", dateFilter === 'yesterday' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Ontem</button>
                        <button onClick={() => setDateFilter("today")} className={cn("flex-1 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all", dateFilter === 'today' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Hoje</button>
                        <button onClick={() => setDateFilter("tomorrow")} className={cn("flex-1 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all", dateFilter === 'tomorrow' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Amanhã</button>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex bg-secondary p-1 rounded-2xl">
                            <button onClick={() => setTypeFilter("all")} className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all", typeFilter === 'all' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Todos</button>
                            <button onClick={() => setTypeFilter("breakfast")} className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all", typeFilter === 'breakfast' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Café</button>
                            <button onClick={() => setTypeFilter("restaurant")} className={cn("px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all", typeFilter === 'restaurant' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Restaurante</button>
                        </div>

                        <button onClick={() => loadOrders()} className="p-3 text-muted-foreground hover:text-primary bg-secondary rounded-xl transition-colors shrink-0" title="Atualizar">
                            <RefreshCcw size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3 px-4">
                    <CalendarDays className="text-primary" size={24} />
                    <h2 className="text-xl font-black uppercase tracking-tighter">Pedidos para: {targetDateObj.toLocaleDateString("pt-BR")}</h2>
                </div>

                {orders.length === 0 ? (
                    <div className="text-center p-12 bg-card border border-border rounded-3xl border-dashed">
                        <Package className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                        <p className="text-lg font-bold">Nenhum pedido encontrado.</p>
                        <p className="text-muted-foreground text-sm">Aguardando novos pedidos para esta data.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {orders.map(order => {
                            const stayData = order.stayId ? stays[order.stayId] : undefined;
                            const guestName = stayData?.guestName || "Desconhecido";
                            const cabinName = stayData?.cabinName || "N/A";
                            const itemsList = order.items as any[];

                            return (
                                <div key={order.id} className={cn("bg-card border border-border rounded-3xl shadow-sm overflow-hidden flex flex-col transition-all hover:border-primary/50 group",
                                    order.status === 'delivered' ? 'opacity-60 grayscale hover:grayscale-0' : '')}
                                >
                                    {/* CABIN HEADER */}
                                    <div className="bg-primary/5 p-5 border-b border-border flex justify-between items-start">
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">{order.type === 'breakfast' ? 'Café da Manhã' : 'Restaurante'} • {order.modality}</p>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-3xl font-black tracking-tighter text-foreground">{cabinName}</h3>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-1 font-medium">{guestName}</p>
                                        </div>
                                        <button onClick={() => handlePrint(order)} className="p-2 text-muted-foreground hover:text-primary hover:bg-secondary rounded-xl transition-colors" title="Imprimir Ticket">
                                            <Printer size={18} />
                                        </button>
                                    </div>

                                    {/* INFO (TIME & STATUS) */}
                                    <div className="p-4 bg-secondary/30 border-b border-border flex items-center justify-between">
                                        <div className="flex items-center gap-2 font-mono font-bold text-foreground">
                                            {order.deliveryTime ? (
                                                <span className="flex items-center gap-1.5"><Clock size={16} className="text-primary" /> {order.deliveryTime}</span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">S/ Hora</span>
                                            )}
                                        </div>
                                        <StatusBadge status={order.status} />
                                    </div>

                                    {/* ITEMS LIST */}
                                    <div className="p-5 flex-1 space-y-3 overflow-y-auto max-h-[250px] custom-scrollbar">
                                        {itemsList.filter((item: any) => item.menuItemId !== 'guest_observations').map((item: any, idx: number) => (
                                            <div key={idx} className="space-y-0.5">
                                                <div className="flex gap-3">
                                                    <span className="font-black text-primary bg-primary/10 w-7 h-7 flex items-center justify-center rounded-lg text-sm shrink-0">
                                                        {item.quantity}x
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <span className="font-bold text-sm text-foreground leading-tight block">{item.name}</span>
                                                        {item.flavor && <span className="text-xs text-muted-foreground">Sabor: {item.flavor}</span>}
                                                        {item.guestName && <span className="text-xs font-bold text-primary block">→ {item.guestName}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {/* Observações gerais */}
                                        {itemsList.find((item: any) => item.menuItemId === 'guest_observations') && (
                                            <div className="mt-3 pt-3 border-t border-border/50">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Observações</p>
                                                <p className="text-xs text-foreground whitespace-pre-wrap break-words">{itemsList.find((item: any) => item.menuItemId === 'guest_observations').notes}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* ACTIONS */}
                                    <div className="p-4 border-t border-border bg-secondary/30 mt-auto flex flex-col gap-3">
                                        <div className="flex justify-between items-center px-1">
                                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total</span>
                                            <span className="font-black text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.totalPrice)}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => updateStatus(order.id, 'pending')}
                                                disabled={order.status === 'pending'}
                                                className="px-2 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider disabled:opacity-30 hover:bg-yellow-500/10 hover:text-yellow-600 transition-colors"
                                            >
                                                Pendente
                                            </button>
                                            <button
                                                onClick={() => updateStatus(order.id, 'preparing')}
                                                disabled={order.status === 'preparing'}
                                                className="px-2 py-2.5 bg-blue-500/10 text-blue-500 rounded-xl font-bold text-[10px] uppercase tracking-wider disabled:opacity-30 hover:bg-blue-500/20 transition-colors"
                                            >
                                                Preparo
                                            </button>
                                            <button
                                                onClick={() => updateStatus(order.id, 'delivered')}
                                                disabled={order.status === 'delivered'}
                                                className="px-2 py-2.5 bg-green-500/10 text-green-500 rounded-xl font-bold text-[10px] uppercase tracking-wider disabled:opacity-30 hover:bg-green-500/20 transition-colors"
                                            >
                                                Pronto
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Modal Fullscreen Print Warning */}
            {printingOrder && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center print:hidden p-4">
                    <div className="bg-card w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl p-8 text-center animate-in zoom-in">
                        <Printer size={48} className="mx-auto text-primary mb-4 animate-bounce" />
                        <h2 className="text-xl font-black mb-2">Preparando Impressão</h2>
                        <p className="text-muted-foreground text-sm mb-6">O diálogo de impressão do navegador será aberto. Pressione ESC para cancelar se não abrir.</p>
                        <button onClick={() => setPrintingOrder(null)} className="px-6 py-3 w-full border border-border text-foreground hover:bg-secondary font-bold uppercase tracking-widest text-xs rounded-xl">Cancelar / Fechar</button>
                    </div>
                </div>
            )}
        </div>
    );
}
