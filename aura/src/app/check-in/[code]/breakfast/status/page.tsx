"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { PropertyService } from "@/services/property-service";
import { BreakfastSalonService } from "@/services/breakfast-salon-service";
import { fbService } from "@/services/fb-service";
import { Stay, Property, FBOrder, FBCategory, FBMenuItem } from "@/types/aura";
import {
    Loader2, Coffee, ArrowLeft, ChevronRight, Clock, CheckCircle2,
    ChefHat, Edit3, AlertCircle, Utensils, CalendarClock, Sun,
    PackageCheck, Ban, ChevronDown, ChevronUp, Plus
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Theme helpers ────────────────────────────────────────────────────────────
function hexToHSL(hex: string): string {
    if (!hex) return '0 0% 0%';
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
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

function getThemeStyles(propertyData?: Property | null): React.CSSProperties {
    const c = propertyData?.theme?.colors;
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
        '--radius': propertyData?.theme?.shape?.radius || '0.5rem',
    } as React.CSSProperties;
}

// ─── Translations ─────────────────────────────────────────────────────────────
const T = {
    pt: {
        title: 'Café da Manhã',
        back: 'Voltar',
        yourOrder: 'Seu Pedido',
        noOrder: 'Nenhum pedido ainda',
        noOrderDesc: 'Você ainda não fez seu pedido de café da manhã.',
        makeOrder: 'Montar minha cesta',
        makeNextOrder: 'Montar cesta de amanhã',
        editOrder: 'Editar pedido',
        deliveryAt: 'Entrega às',
        windowOpen: 'Pedidos abertos',
        windowOpenDesc: (end: string) => `Você pode pedir ou editar seu café de amanhã até as ${end}.`,
        windowClosed: 'Pedidos encerrados',
        windowClosedDesc: (start: string, end: string) => `Os pedidos de amanhã abrem às ${start} e encerram às ${end}.`,
        orderStatus: {
            pending: 'Aguardando preparo',
            confirmed: 'Confirmado',
            preparing: 'Em preparo',
            delivered: 'Entregue',
            cancelled: 'Cancelado',
        },
        obs: 'Observações',
        cannotEdit: 'Seu pedido já está em preparo e não pode ser alterado.',
        showDetails: 'Ver itens do pedido',
        hideDetails: 'Ocultar itens',
        today: 'Hoje',
        tomorrow: 'Amanhã',

        // Buffet
        buffetTitle: 'Café da Manhã Buffet',
        buffetDesc: 'Nosso café da manhã é servido no formato Buffet no restaurante.',
        salonOpen: 'Salão Aberto',
        salonClosed: 'Salão Fechado',
        salonClosedDesc: 'O salão está fechado no momento.',
        todaySchedule: 'Funcionamento hoje',
        noScheduleToday: 'Sem funcionamento hoje.',
    },
    en: {
        title: 'Breakfast',
        back: 'Back',
        yourOrder: 'Your Order',
        noOrder: 'No order yet',
        noOrderDesc: "You haven't placed a breakfast order yet.",
        makeOrder: 'Build my basket',
        makeNextOrder: "Build tomorrow's basket",
        editOrder: 'Edit order',
        deliveryAt: 'Delivery at',
        windowOpen: 'Orders open',
        windowOpenDesc: (end: string) => `You can order or edit tomorrow's breakfast until ${end}.`,
        windowClosed: 'Orders closed',
        windowClosedDesc: (start: string, end: string) => `Tomorrow's orders open at ${start} and close at ${end}.`,
        orderStatus: {
            pending: 'Awaiting preparation',
            confirmed: 'Confirmed',
            preparing: 'Being prepared',
            delivered: 'Delivered',
            cancelled: 'Cancelled',
        },
        obs: 'Notes',
        cannotEdit: 'Your order is already being prepared and cannot be changed.',
        showDetails: 'View order items',
        hideDetails: 'Hide items',
        today: 'Today',
        tomorrow: 'Tomorrow',

        buffetTitle: 'Breakfast Buffet',
        buffetDesc: 'Our breakfast is served buffet-style at the restaurant.',
        salonOpen: 'Dining Room Open',
        salonClosed: 'Dining Room Closed',
        salonClosedDesc: 'The dining room is currently closed.',
        todaySchedule: "Today's hours",
        noScheduleToday: 'No service today.',
    },
    es: {
        title: 'Desayuno',
        back: 'Volver',
        yourOrder: 'Su Pedido',
        noOrder: 'Sin pedido aún',
        noOrderDesc: 'Aún no ha realizado su pedido de desayuno.',
        makeOrder: 'Armar mi canasta',
        makeNextOrder: 'Armar canasta de mañana',
        editOrder: 'Editar pedido',
        deliveryAt: 'Entrega a las',
        windowOpen: 'Pedidos abiertos',
        windowOpenDesc: (end: string) => `Puede pedir o editar el desayuno de mañana hasta las ${end}.`,
        windowClosed: 'Pedidos cerrados',
        windowClosedDesc: (start: string, end: string) => `Los pedidos de mañana abren a las ${start} y cierran a las ${end}.`,
        orderStatus: {
            pending: 'Esperando preparación',
            confirmed: 'Confirmado',
            preparing: 'En preparación',
            delivered: 'Entregado',
            cancelled: 'Cancelado',
        },
        obs: 'Observaciones',
        cannotEdit: 'Su pedido ya está siendo preparado y no puede modificarse.',
        showDetails: 'Ver ítems del pedido',
        hideDetails: 'Ocultar ítems',
        today: 'Hoy',
        tomorrow: 'Mañana',

        buffetTitle: 'Desayuno Buffet',
        buffetDesc: 'Nuestro desayuno se sirve en formato buffet en el restaurante.',
        salonOpen: 'Comedor Abierto',
        salonClosed: 'Comedor Cerrado',
        salonClosedDesc: 'El comedor está cerrado en este momento.',
        todaySchedule: 'Horario de hoy',
        noScheduleToday: 'Sin servicio hoy.',
    },
};

const DAY_NAMES: Record<string, string[]> = {
    pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
};

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'pending':   return <Clock size={18} className="text-amber-400" />;
        case 'confirmed': return <CheckCircle2 size={18} className="text-green-400" />;
        case 'preparing': return <ChefHat size={18} className="text-blue-400" />;
        case 'delivered': return <PackageCheck size={18} className="text-green-500" />;
        case 'cancelled': return <Ban size={18} className="text-red-400" />;
        default:          return <Clock size={18} className="text-muted-foreground" />;
    }
}

// ─── Main component ───────────────────────────────────────────────────────────
function BreakfastStatusPage() {
    const { code } = useParams<{ code: string }>();
    const router = useRouter();

    const [lang, setLang] = useState<'pt' | 'en' | 'es'>('pt');
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    const [stay, setStay]         = useState<Stay | null>(null);
    const [property, setProperty] = useState<Property | null>(null);
    const [order, setOrder]       = useState<FBOrder | null>(null);
    const [orderIsToday, setOrderIsToday] = useState(false);
    const [tomorrowOrder, setTomorrowOrder] = useState<FBOrder | null>(null);
    const [windowOpen, setWindowOpen] = useState(false);
    const [salonOpen, setSalonOpen]   = useState(false);
    const [categories, setCategories] = useState<FBCategory[]>([]);
    const [menuItems, setMenuItems]   = useState<FBMenuItem[]>([]);

    const t = T[lang];

    useEffect(() => {
        if (!code) return;
        load();
    }, [code]);

    async function load() {
        try {
            const stays = await StayService.getStaysByAccessCode(code as string);
            if (!stays || stays.length === 0) { router.replace(`/check-in/${code}`); return; }
            const s = stays[0] as Stay;
            setStay(s);

            const [stayData, prop] = await Promise.all([
                StayService.getStayWithGuestAndCabin(s.propertyId, s.id),
                PropertyService.getPropertyById(s.propertyId),
            ]);

            const guestLang = stayData?.guest?.preferredLanguage as 'pt' | 'en' | 'es' | undefined;
            if (guestLang && ['pt', 'en', 'es'].includes(guestLang)) setLang(guestLang);
            setProperty(prop);

            const fb = prop?.settings?.fbSettings?.breakfast;
            if (!fb?.enabled) { router.replace(`/check-in/${code}`); return; }

            const resolvedModality = fb.modality === 'both' ? (fb.dailyMode ?? 'delivery') : fb.modality;
            const effectiveModality = (s as any).cestaBreakfastEnabled === true ? 'delivery' : resolvedModality;

            if (effectiveModality === 'delivery') {
                // Check order window
                const delivery = fb.delivery;
                if (delivery?.orderWindowStart && delivery?.orderWindowEnd) {
                    const now = new Date();
                    const hhmm = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                    setWindowOpen(hhmm >= delivery.orderWindowStart && hhmm <= delivery.orderWindowEnd);
                }

                // Fetch today + tomorrow orders in parallel
                const todayISO = new Date().toISOString().split('T')[0];
                const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
                const tomorrowISO = tomorrowDate.toISOString().split('T')[0];

                const [resToday, resTomorrow, cats, itms] = await Promise.all([
                    fetch(`/api/guest/breakfast-orders?stayId=${s.id}&propertyId=${s.propertyId}&deliveryDate=${todayISO}&type=breakfast`),
                    fetch(`/api/guest/breakfast-orders?stayId=${s.id}&propertyId=${s.propertyId}&deliveryDate=${tomorrowISO}&type=breakfast`),
                    fbService.getCategories(s.propertyId),
                    fbService.getMenuItems(s.propertyId),
                ]);

                setCategories(cats.filter(c => c.type === 'both' || c.type === 'breakfast').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
                setMenuItems(itms);

                let todayFound: FBOrder | null = null;
                let tomorrowFound: FBOrder | null = null;

                if (resToday.ok) {
                    const j = await resToday.json();
                    if (j.order) todayFound = j.order;
                }
                if (resTomorrow.ok) {
                    const j = await resTomorrow.json();
                    if (j.order) tomorrowFound = j.order;
                }

                // Show today's order if it exists; otherwise show tomorrow's
                if (todayFound) {
                    setOrder(todayFound);
                    setOrderIsToday(true);
                    // Also store tomorrow's order separately to know if "make tomorrow" button is needed
                    setTomorrowOrder(tomorrowFound);
                } else if (tomorrowFound) {
                    setOrder(tomorrowFound);
                    setOrderIsToday(false);
                }
            } else {
                // Buffet — check today's session status + any order the guest may have placed
                const todayISO = new Date().toISOString().split('T')[0];
                const [session, cats, itms, resToday] = await Promise.all([
                    BreakfastSalonService.getTodaySession(s.propertyId),
                    fbService.getCategories(s.propertyId),
                    fbService.getMenuItems(s.propertyId),
                    fetch(`/api/guest/breakfast-orders?stayId=${s.id}&propertyId=${s.propertyId}&deliveryDate=${todayISO}&type=breakfast`),
                ]);
                setSalonOpen(session?.status === 'open');
                setCategories(cats.filter(c => c.type === 'both' || c.type === 'breakfast').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
                setMenuItems(itms);
                if (resToday.ok) {
                    const j = await resToday.json();
                    if (j.order) { setOrder(j.order); setOrderIsToday(true); }
                }
            }
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    }

    if (loading || !property) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-background">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    const themeStyles = getThemeStyles(property);
    const fb = property.settings?.fbSettings?.breakfast!;
    const resolvedModality = fb.modality === 'both' ? (fb.dailyMode ?? 'delivery') : fb.modality;
    const effectiveModality = (stay as any)?.cestaBreakfastEnabled === true ? 'delivery' : resolvedModality;

    // Can edit: today's order only if window is open and status allows; tomorrow's order if window open
    const canEdit = order && ['pending', 'confirmed'].includes(order.status) && windowOpen;
    const canCreate = !order && windowOpen;

    // Show "make tomorrow" button when: showing today's order AND no tomorrow order AND not last day AND window open
    const checkoutDate = stay?.checkOut ? new Date(stay.checkOut) : null;
    const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const isLastDay = checkoutDate ? tomorrowDate >= checkoutDate : false;
    const canMakeTomorrow = orderIsToday && !tomorrowOrder && !isLastDay && windowOpen;

    // Group items by category
    const regularItems = order ? (order.items as any[]).filter((it: any) => it.menuItemId !== 'guest_observations') : [];
    const observations = order ? (order.items as any[]).find((it: any) => it.menuItemId === 'guest_observations') : null;

    // Build category groups from the menu catalog
    const itemsByCategory: { category: FBCategory; items: any[] }[] = [];
    const usedItemIds = new Set<string>();

    for (const cat of categories) {
        const catMenuItemIds = new Set(menuItems.filter(m => m.categoryId === cat.id).map(m => m.id));
        const catOrderItems = regularItems.filter((it: any) => catMenuItemIds.has(it.menuItemId));
        if (catOrderItems.length > 0) {
            itemsByCategory.push({ category: cat, items: catOrderItems });
            catOrderItems.forEach((it: any) => usedItemIds.add(it.menuItemId));
        }
    }
    // Uncategorized fallback (items not matched to any category)
    const uncategorized = regularItems.filter((it: any) => !usedItemIds.has(it.menuItemId));

    return (
        <div className="min-h-[100dvh] bg-background text-foreground flex flex-col" style={themeStyles}>
            {/* Background blobs */}
            <div className="fixed top-0 left-0 w-full h-[35vh] bg-gradient-to-b from-primary/15 to-transparent pointer-events-none -z-10" />
            <div className="fixed -top-24 -left-24 w-80 h-80 bg-primary/15 rounded-full blur-3xl opacity-60 pointer-events-none -z-10" />
            <div className="fixed top-16 -right-16 w-64 h-64 bg-secondary/25 rounded-full blur-3xl pointer-events-none -z-10" />

            <div className="w-full max-w-md mx-auto px-5 pt-6 pb-24 space-y-5 animate-in slide-in-from-bottom-4 duration-500">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <button onClick={() => router.push(`/check-in/${code}`)} className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft size={16} /> {t.back}
                    </button>
                    <div className="flex bg-secondary/70 backdrop-blur-md rounded-lg p-0.5 border border-border/40">
                        {(['pt', 'en', 'es'] as const).map(l => (
                            <button key={l} onClick={() => setLang(l)}
                                className={cn("px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all",
                                    lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                                )}>
                                {l}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Title */}
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
                        <Coffee size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight uppercase leading-none">{t.title}</h1>
                        {stay && <p className="text-xs text-muted-foreground mt-0.5 font-medium">{(stay as any).cabinName ?? ''}</p>}
                    </div>
                </div>

                {/* ── DELIVERY flow ── */}
                {effectiveModality === 'delivery' && (
                    <>
                        {/* Order card — exists */}
                        {order ? (
                            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                                {/* Collapsed header — always visible */}
                                <button
                                    className="w-full p-4 flex items-center justify-between gap-3 text-left"
                                    onClick={() => setExpanded(v => !v)}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <StatusIcon status={order.status} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm">
                                                    {t.orderStatus[order.status as keyof typeof t.orderStatus] ?? order.status}
                                                </span>
                                                {orderIsToday && (
                                                    <span className="text-[10px] font-black uppercase tracking-widest bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                                                        {t.today}
                                                    </span>
                                                )}
                                            </div>
                                            {order.deliveryTime && (
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {t.deliveryAt} <span className="font-black font-mono text-primary">{order.deliveryTime}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-muted-foreground">
                                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </button>

                                {/* Expandable items */}
                                {expanded && (
                                    <div className="border-t border-border">
                                        <div className="px-4 py-3 space-y-4">
                                            {/* Items grouped by category */}
                                            {itemsByCategory.map(({ category, items: catItems }) => (
                                                <div key={category.id}>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                                                        {category.name}
                                                    </p>
                                                    <div className="space-y-1.5">
                                                        {catItems.map((it: any, i: number) => (
                                                            <div key={i} className="flex items-start gap-3 py-1">
                                                                <span className="font-black text-primary bg-primary/10 min-w-[2rem] h-6 flex items-center justify-center rounded-lg text-xs shrink-0">
                                                                    {it.quantity}×
                                                                </span>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="font-semibold text-sm block leading-snug">{it.name}</span>
                                                                    {it.flavor && <span className="text-xs text-amber-400/80 block">→ {it.flavor}</span>}
                                                                    {it.guestName && <span className="text-xs text-primary/70 block font-medium">→ {it.guestName}</span>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Uncategorized fallback */}
                                            {uncategorized.length > 0 && (
                                                <div className="space-y-1.5">
                                                    {uncategorized.map((it: any, i: number) => (
                                                        <div key={i} className="flex items-start gap-3 py-1">
                                                            <span className="font-black text-primary bg-primary/10 min-w-[2rem] h-6 flex items-center justify-center rounded-lg text-xs shrink-0">
                                                                {it.quantity}×
                                                            </span>
                                                            <div className="flex-1 min-w-0">
                                                                <span className="font-semibold text-sm block leading-snug">{it.name}</span>
                                                                {it.flavor && <span className="text-xs text-amber-400/80 block">→ {it.flavor}</span>}
                                                                {it.guestName && <span className="text-xs text-primary/70 block font-medium">→ {it.guestName}</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Observations */}
                                            {observations?.notes && (
                                                <div className="pt-2 border-t border-border/40">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">{t.obs}</p>
                                                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{observations.notes}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Edit / cannot-edit */}
                                        <div className="px-4 pb-4 pt-1">
                                            {canEdit ? (
                                                <button
                                                    onClick={() => router.push(`/check-in/${code}/breakfast`)}
                                                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                                                >
                                                    <Edit3 size={16} /> {t.editOrder}
                                                </button>
                                            ) : (order.status === 'preparing' || order.status === 'delivered') ? (
                                                <p className="text-xs text-center text-muted-foreground bg-secondary/50 rounded-xl px-3 py-2.5">
                                                    {t.cannotEdit}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* No order yet */
                            <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-4">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                                    <Coffee size={32} className="text-primary opacity-70" />
                                </div>
                                <div>
                                    <p className="font-black text-lg">{t.noOrder}</p>
                                    <p className="text-sm text-muted-foreground mt-1">{t.noOrderDesc}</p>
                                </div>
                                {canCreate && (
                                    <button
                                        onClick={() => router.push(`/check-in/${code}/breakfast`)}
                                        className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                                    >
                                        {t.makeOrder} <ChevronRight size={16} />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Window status pill — shown after today's order */}
                        <div className={cn(
                            "flex items-start gap-3 p-4 rounded-2xl border",
                            windowOpen
                                ? "bg-green-500/10 border-green-500/25"
                                : "bg-secondary/60 border-border"
                        )}>
                            <CalendarClock size={20} className={windowOpen ? "text-green-400 shrink-0 mt-0.5" : "text-muted-foreground shrink-0 mt-0.5"} />
                            <div>
                                <p className={cn("font-bold text-sm", windowOpen ? "text-green-300" : "text-foreground")}>
                                    {windowOpen ? t.windowOpen : t.windowClosed}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {windowOpen
                                        ? t.windowOpenDesc(fb.delivery?.orderWindowEnd ?? '22:00')
                                        : t.windowClosedDesc(fb.delivery?.orderWindowStart ?? '18:00', fb.delivery?.orderWindowEnd ?? '22:00')
                                    }
                                </p>
                            </div>
                        </div>

                        {/* "Make tomorrow's basket" button — shown when today's order is in progress */}
                        {canMakeTomorrow && (
                            <button
                                onClick={() => router.push(`/check-in/${code}/breakfast`)}
                                className="w-full py-3.5 bg-card border border-primary/40 text-primary rounded-2xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary/10 transition-colors"
                            >
                                <Plus size={16} /> {t.makeNextOrder}
                            </button>
                        )}
                    </>
                )}

                {/* ── BUFFET flow ── */}
                {effectiveModality !== 'delivery' && (
                    <>
                        {/* Guest's order (a-la-carte or special request) if it exists */}
                        {order && (
                            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                                <button
                                    className="w-full p-4 flex items-center justify-between gap-3 text-left"
                                    onClick={() => setExpanded(v => !v)}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <StatusIcon status={order.status} />
                                        <div className="min-w-0">
                                            <span className="font-bold text-sm">
                                                {t.orderStatus[order.status as keyof typeof t.orderStatus] ?? order.status}
                                            </span>
                                            {order.deliveryTime && (
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {t.deliveryAt} <span className="font-black font-mono text-primary">{order.deliveryTime}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-muted-foreground">
                                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </button>

                                {expanded && (
                                    <div className="border-t border-border">
                                        <div className="px-4 py-3 space-y-4">
                                            {itemsByCategory.map(({ category, items: catItems }) => (
                                                <div key={category.id}>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{category.name}</p>
                                                    <div className="space-y-1.5">
                                                        {catItems.map((it: any, i: number) => (
                                                            <div key={i} className="flex items-start gap-3 py-1">
                                                                <span className="font-black text-primary bg-primary/10 min-w-[2rem] h-6 flex items-center justify-center rounded-lg text-xs shrink-0">{it.quantity}×</span>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="font-semibold text-sm block leading-snug">{it.name}</span>
                                                                    {it.flavor && <span className="text-xs text-amber-400/80 block">→ {it.flavor}</span>}
                                                                    {it.guestName && <span className="text-xs text-primary/70 block font-medium">→ {it.guestName}</span>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                            {uncategorized.map((it: any, i: number) => (
                                                <div key={i} className="flex items-start gap-3 py-1">
                                                    <span className="font-black text-primary bg-primary/10 min-w-[2rem] h-6 flex items-center justify-center rounded-lg text-xs shrink-0">{it.quantity}×</span>
                                                    <div className="flex-1 min-w-0">
                                                        <span className="font-semibold text-sm block leading-snug">{it.name}</span>
                                                        {it.flavor && <span className="text-xs text-amber-400/80 block">→ {it.flavor}</span>}
                                                        {it.guestName && <span className="text-xs text-primary/70 block font-medium">→ {it.guestName}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                            {observations?.notes && (
                                                <div className="pt-2 border-t border-border/40">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-1">{t.obs}</p>
                                                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{observations.notes}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Salon status */}
                        <div className={cn(
                            "flex items-center gap-4 p-5 rounded-2xl border",
                            salonOpen
                                ? "bg-green-500/10 border-green-500/25"
                                : "bg-secondary/60 border-border"
                        )}>
                            <div className={cn(
                                "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0",
                                salonOpen ? "bg-green-500/20" : "bg-secondary"
                            )}>
                                {salonOpen
                                    ? <Sun size={28} className="text-green-400" />
                                    : <Utensils size={28} className="text-muted-foreground" />
                                }
                            </div>
                            <div>
                                <p className={cn("font-black text-lg uppercase tracking-tight leading-none",
                                    salonOpen ? "text-green-300" : "text-foreground"
                                )}>
                                    {salonOpen ? t.salonOpen : t.salonClosed}
                                </p>
                                {fb.buffetHours && fb.buffetHours.length > 0 && (() => {
                                    const todayHours = fb.buffetHours!.find(h => h.dayOfWeek === new Date().getDay());
                                    return todayHours ? (
                                        <p className="text-sm font-bold font-mono text-foreground/80 mt-1">
                                            {todayHours.openTime} – {todayHours.closeTime}
                                        </p>
                                    ) : null;
                                })()}
                                {!salonOpen && !(fb.buffetHours?.find(h => h.dayOfWeek === new Date().getDay())) && (
                                    <p className="text-xs text-muted-foreground mt-1">{t.salonClosedDesc}</p>
                                )}
                            </div>
                        </div>

                        {/* Buffet description */}
                        {(fb as any).description && (
                            <div className="bg-card border border-border rounded-2xl p-4 space-y-1">
                                <p className="font-bold text-sm">{t.buffetTitle}</p>
                                <p className="text-xs text-muted-foreground leading-relaxed">{(fb as any).description}</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default function BreakfastStatusPageWrapper() {
    return (
        <Suspense fallback={
            <div className="min-h-[100dvh] flex items-center justify-center bg-background">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        }>
            <BreakfastStatusPage />
        </Suspense>
    );
}
