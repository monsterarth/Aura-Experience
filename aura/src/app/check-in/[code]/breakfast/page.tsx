"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { PropertyService } from "@/services/property-service";
import { fbService } from "@/services/fb-service";
import { Stay, Property, FBCategory, FBMenuItem } from "@/types/aura";
import { Loader2, ArrowLeft, Coffee, Plus, Minus, Info, CheckCircle2, ChevronRight, Utensils, AlertCircle, X, ArrowRight } from "lucide-react";
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

// --- Types ---
export interface OrderSelection {
    id: string; // unique literal id for cart mapping
    menuItemId: string;
    quantity: number;
    flavor?: string;
    guestName?: string; // Para identificação 'Hóspede 1', 'Hóspede 2'
}

function BreakfastWizard() {
    const { code } = useParams();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    const [stay, setStay] = useState<Stay | null>(null);
    const [property, setProperty] = useState<Property | null>(null);
    const [categories, setCategories] = useState<FBCategory[]>([]);
    const [items, setItems] = useState<FBMenuItem[]>([]);

    // Wizard State
    const [step, setStep] = useState<0 | 1 | 2>(0);
    // 0 = Horário e Info
    // 1 = Seleção (Cesta)
    // 2 = Resumo e Confirmar

    const [deliveryTime, setDeliveryTime] = useState("");
    const [deliveryDate, setDeliveryDate] = useState("");

    // O carrinho será apenas a lista de OrderSelection
    const [selections, setSelections] = useState<OrderSelection[]>([]);
    const [skippedGuests, setSkippedGuests] = useState<Record<string, boolean>>({});
    const [currentGuestIdxPerCat, setCurrentGuestIdxPerCat] = useState<Record<string, number>>({});
    const [pendingFlavorSelection, setPendingFlavorSelection] = useState<{ categoryId: string, guestName: string, menuItem: FBMenuItem } | null>(null);
    const [guestNames, setGuestNames] = useState<string[]>([]);
    const [observationsText, setObservationsText] = useState('');

    const totalGuests = useMemo(() => {
        if (!stay) return 1;
        const adults = stay.counts?.adults || 0;
        const children = stay.counts?.children || 0;
        return Math.max(1, adults + children);
    }, [stay]);

    const guestIdentifiers = useMemo(() => {
        const arr = [];
        for (let i = 1; i <= totalGuests; i++) {
            arr.push(totalGuests === 1 ? 'Você' : `Hóspede ${i}`);
        }
        return arr;
    }, [totalGuests]);

    // Inicializa os nomes editáveis quando o número de hóspedes é resolvido
    useEffect(() => {
        if (totalGuests > 0 && guestNames.length === 0) {
            setGuestNames(guestIdentifiers);
        }
    }, [totalGuests]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        async function init() {
            try {
                if (!code) return;
                const stays = await StayService.getStaysByAccessCode(code as string);
                if (!stays || stays.length === 0) return;

                const s = stays[0] as Stay;
                setStay(s);

                const prop = await PropertyService.getPropertyById(s.propertyId);
                if (!prop) return;
                setProperty(prop as Property);

                const [cats, itms] = await Promise.all([
                    fbService.getCategories(prop.id),
                    fbService.getMenuItems(prop.id)
                ]);

                // Filtrar apenas categorias de café da manhã ativas com itens
                const bCats = cats.filter(c => c.type === 'both' || c.type === 'breakfast');
                const catIds = bCats.map(c => c.id);
                const activeItems = itms.filter(i => i.active && catIds.includes(i.categoryId));

                // Limpar categorias vazias
                const validCats = bCats.filter(c => activeItems.some(i => i.categoryId === c.id));

                setCategories(validCats);
                setItems(activeItems);

                // Determinar Data de Entrega (Amanhã)
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                setDeliveryDate(tomorrow.toLocaleDateString('pt-BR'));

                // Horário Padrão
                const times = prop.settings?.fbSettings?.breakfast?.delivery?.deliveryTimes;
                if (times && times.length > 0) {
                    setDeliveryTime(times[0]);
                }

                setLoading(false);
            } catch (error) {
                console.error(error);
                toast.error("Erro ao carregar o cardápio.");
                setLoading(false);
            }
        }
        init();
    }, [code]);

    // Helpers de Manipulação do Carrinho
    const addSelection = (menuItemId: string, guestName?: string, flavor?: string) => {
        setSelections(prev => {
            // Verificar limite individual se aplicável
            const item = items.find(i => i.id === menuItemId);
            const category = categories.find(c => c.id === item?.categoryId);

            if (category?.selectionTarget === 'individual' && guestName) {
                const currentGuestQty = prev
                    .filter(s => s.guestName === guestName && items.find(i => i.id === s.menuItemId)?.categoryId === category.id)
                    .reduce((sum, s) => sum + s.quantity, 0);

                if (currentGuestQty >= (category.maxPerGuest || 1)) {
                    toast.error(`Você já atingiu o limite de ${category.maxPerGuest} item(s) por hóspede nesta categoria.`);
                    return prev;
                }
            } else if (category?.selectionTarget === 'group_portion') {
                const currentQty = prev.filter(s => s.menuItemId === menuItemId).reduce((sum, s) => sum + s.quantity, 0);
                // The limit is the total guests in the booking
                const adults = stay?.counts?.adults || 0;
                const children = stay?.counts?.children || 0;
                const maxGuests = Math.max(1, adults + children);
                if (currentQty >= maxGuests) {
                    toast.error(`A quantidade máxima é o número de hóspedes (${maxGuests}).`);
                    return prev;
                }
            } else if (category?.selectionTarget === 'group_unit') {
                const currentCategoryQty = prev
                    .filter(s => items.find(i => i.id === s.menuItemId)?.categoryId === category.id)
                    .reduce((sum, s) => sum + s.quantity, 0);
                const adults = stay?.counts?.adults || 0;
                const children = stay?.counts?.children || 0;
                const maxGuests = Math.max(1, adults + children);
                const poolSize = (category.maxPerGuest || 1) * maxGuests;
                if (currentCategoryQty >= poolSize) {
                    toast.error(`Você atingiu o limite de ${poolSize} unidades para esta categoria.`);
                    return prev;
                }
            }

            // Tentar agrupar itens iguais (mesmo item, mesmo guest, mesmo flavor)
            const existingIdx = prev.findIndex(s => s.menuItemId === menuItemId && s.guestName === guestName && s.flavor === flavor);
            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = { ...updated[existingIdx], quantity: updated[existingIdx].quantity + 1 };
                return updated;
            }

            return [...prev, { id: Math.random().toString(36).substr(2, 9), menuItemId, quantity: 1, guestName, flavor }];
        });
    };

    const removeSelection = (selectionId: string) => {
        setSelections(prev => {
            const existingIdx = prev.findIndex(s => s.id === selectionId);
            if (existingIdx < 0) return prev;

            const updated = [...prev];
            if (updated[existingIdx].quantity > 1) {
                updated[existingIdx] = { ...updated[existingIdx], quantity: updated[existingIdx].quantity - 1 };
            } else {
                updated.splice(existingIdx, 1);
            }
            return updated;
        });
    };

    const getTotalQuantity = (menuItemId: string, guestName?: string) => {
        return selections
            .filter(s => s.menuItemId === menuItemId && (guestName ? s.guestName === guestName : true))
            .reduce((sum, s) => sum + s.quantity, 0);
    };

    const submitOrder = async () => {
        if (!stay || !property || !deliveryTime) return;
        if (selections.length === 0) {
            toast.error("Você não selecionou nenhum item.");
            return;
        }

        setSaving(true);
        try {
            const orderItems = selections.map(s => {
                const itemDef = items.find(i => i.id === s.menuItemId);
                const categoryDef = categories.find(c => c.id === itemDef?.categoryId);
                const unitPrice = itemDef?.price || 0;

                let notes = "";
                if (categoryDef?.selectionTarget === 'individual') {
                    notes = `Para: ${s.guestName || 'Hóspede'}`;
                    if (s.flavor) notes += ` | Sabor: ${s.flavor}`;
                } else if (categoryDef?.selectionTarget === 'group_portion') {
                    notes = `Para ${s.quantity} pessoa(s)`;
                }

                return {
                    menuItemId: s.menuItemId,
                    name: itemDef?.name || "Item",
                    quantity: s.quantity,
                    unitPrice,
                    totalPrice: unitPrice * s.quantity,
                    flavor: s.flavor,
                    guestName: s.guestName,
                    notes
                };
            });

            // Observações gerais como item especial
            if (observationsText.trim()) {
                orderItems.push({
                    menuItemId: 'guest_observations',
                    name: 'Observações Gerais',
                    quantity: 1,
                    unitPrice: 0,
                    totalPrice: 0,
                    notes: observationsText.trim(),
                } as any);
            }

            const totalPrice = orderItems.reduce((acc, curr) => acc + curr.totalPrice, 0);

            const tomorrowData = new Date();
            tomorrowData.setDate(tomorrowData.getDate() + 1);
            const isoDate = tomorrowData.toISOString().split('T')[0];

            await fbService.createOrder({
                propertyId: stay.propertyId,
                stayId: stay.id,
                type: 'breakfast',
                modality: 'delivery',
                status: 'pending',
                items: orderItems,
                totalPrice,
                deliveryTime,
                deliveryDate: isoDate
            });

            setSuccess(true);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao enviar pedido.");
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
    const fb = property.settings?.fbSettings?.breakfast;

    if (!fb || !fb.enabled) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center" style={themeStyles}>
                <Coffee size={48} className="text-muted-foreground mb-4 opacity-50" />
                <h1 className="text-2xl font-black uppercase">Serviço Indisponível</h1>
                <p className="text-muted-foreground mt-2">O Café da manhã não está ativo no momento.</p>
                <button onClick={() => router.push(`/check-in/${code}`)} className="mt-8 px-6 py-3 bg-secondary rounded-xl font-bold uppercase text-xs tracking-widest">
                    Voltar
                </button>
            </div>
        );
    }

    // Modalidade: Apenas Buffet
    if (fb.modality === 'buffet') {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center" style={themeStyles}>
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                    <Utensils size={40} className="text-primary" />
                </div>
                <h1 className="text-3xl font-black uppercase tracking-tighter">Café da Manhã</h1>
                <p className="text-muted-foreground mt-2 max-w-sm">
                    Nosso café da manhã é servido no formato Buffet em nosso restaurante central.
                </p>

                <div className="mt-8 w-full max-w-sm bg-card border border-border rounded-2xl p-6 text-left">
                    <h3 className="font-bold text-sm uppercase text-muted-foreground mb-4 tracking-widest">Horários Disponíveis</h3>
                    {fb.buffetHours?.map((h, i) => (
                        <div key={i} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                            <span className="font-semibold">{['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][h.dayOfWeek]}</span>
                            <span className="font-black text-primary">{h.openTime} às {h.closeTime}</span>
                        </div>
                    ))}
                </div>

                <button onClick={() => router.push(`/check-in/${code}`)} className="mt-8 px-6 py-3 bg-secondary rounded-xl font-bold uppercase text-xs tracking-widest">
                    Voltar ao Portal
                </button>
            </div>
        )
    }

    // Modalidade: Delivery (Fluxo de Sucesso)
    if (success) {
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 text-center" style={themeStyles}>
                <div className="absolute top-0 left-0 w-full h-[30vh] bg-gradient-to-b from-green-500/20 to-background pointer-events-none -z-10"></div>
                <div className="w-24 h-24 bg-green-500 text-white rounded-full flex items-center justify-center mb-6 animate-in zoom-in shadow-xl shadow-green-500/30">
                    <CheckCircle2 size={48} />
                </div>
                <h1 className="text-3xl font-black uppercase tracking-tighter">Pedido Confirmado!</h1>
                <div className="bg-card border border-border p-6 rounded-2xl mt-6">
                    <p className="text-muted-foreground">
                        Seu café será entregue no dia <strong className="text-foreground">{deliveryDate}</strong> às <strong className="text-foreground">{deliveryTime}</strong> na sua cabana.
                    </p>
                </div>
                <button onClick={() => router.push(`/check-in/${code}`)} className="mt-8 px-8 py-4 w-full max-w-xs bg-primary text-primary-foreground rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl shadow-primary/20">
                    Voltar ao Portal
                </button>
            </div>
        );
    }

    // --- WIZARD RENDER ---
    const totalItems = selections.reduce((sum, s) => sum + s.quantity, 0);
    const totalPrice = selections.reduce((sum, s) => sum + ((items.find(i => i.id === s.menuItemId)?.price || 0) * s.quantity), 0);

    return (
        <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-sans relative overflow-x-hidden" style={themeStyles}>
            <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border p-4 flex items-center gap-4">
                <button
                    onClick={() => step > 0 ? setStep((step - 1) as any) : router.push(`/check-in/${code}`)}
                    className="p-2 hover:bg-secondary rounded-full transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className="text-lg font-black uppercase tracking-tighter">Café da Manhã</h1>
                    {/* Stepper Dots */}
                    <div className="flex items-center gap-1 mt-1">
                        {[0, 1, 2].map(i => (
                            <div key={i} className={cn("h-1 rounded-full transition-all", step >= i ? "w-8 bg-primary" : "w-2 bg-secondary")} />
                        ))}
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 pb-48 w-full max-w-2xl mx-auto space-y-6">
                {/* STEP 0: Horário e Preparação */}
                {step === 0 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                        <div className="bg-primary text-primary-foreground rounded-3xl p-6 shadow-xl shadow-primary/10 overflow-hidden relative">
                            <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-bl-full translate-x-1/4 -translate-y-1/4 blur-xl"></div>
                            <Coffee size={32} className="mb-4 opacity-80" />
                            <h2 className="text-2xl font-black uppercase tracking-tighter mb-2 whitespace-pre-wrap break-words">{fb.delivery?.welcomeMessage || "Bom dia inicia aqui"}</h2>
                            <p className="opacity-90 leading-relaxed text-sm whitespace-pre-wrap break-words">
                                {fb.delivery?.instructions || `Crie a cesta perfeita para amanhã. O limite para pedidos é hoje até as ${fb.delivery?.orderWindowEnd || "22:00"}.`}
                            </p>
                        </div>

                        <div className="bg-card border border-border p-6 rounded-3xl space-y-4">
                            <h3 className="font-bold uppercase tracking-widest text-muted-foreground text-xs">Para qual horário?</h3>

                            <div className="grid grid-cols-2 gap-3">
                                {fb.delivery?.deliveryTimes?.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setDeliveryTime(t)}
                                        className={cn(
                                            "py-4 rounded-2xl font-black text-lg transition-all border-2",
                                            deliveryTime === t ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-secondary text-foreground hover:bg-secondary/80"
                                        )}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={() => setStep(1)}
                            disabled={!deliveryTime}
                            className="w-full py-4 bg-foreground text-background font-black uppercase tracking-widest rounded-2xl shadow-xl flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                        >
                            Montar Cesta <ChevronRight size={20} />
                        </button>
                    </div>
                )}

                {/* STEP 1: Seleção de Itens */}
                {step === 1 && (
                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500 relative">

                        {/* Bloco de nomes — apenas para grupos com categoria individual */}
                        {categories.some(c => c.selectionTarget === 'individual') && totalGuests > 1 && (
                            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <Info size={12} /> Quem está hospedado?
                                </p>
                                {guestNames.map((name, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground shrink-0 w-20">Hóspede {idx + 1}</span>
                                        <input
                                            value={name}
                                            onChange={e => setGuestNames(prev => prev.map((n, i) => i === idx ? e.target.value : n))}
                                            className="flex-1 bg-secondary border border-border px-3 py-2 rounded-xl text-sm font-bold outline-none focus:border-primary/50 transition-all"
                                            placeholder={`Hóspede ${idx + 1}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {categories.map(category => {
                            const catItems = items.filter(i => i.categoryId === category.id);
                            if (catItems.length === 0) return null;

                            // LÓGICA DE GRUPO (Porções vs Unidades do Pool)
                            if (category.selectionTarget === 'group_portion' || category.selectionTarget === 'group_unit') {
                                const isUnitPool = category.selectionTarget === 'group_unit';
                                const poolSize = (category.maxPerGuest || 1) * totalGuests;
                                const categoryTotalQty = isUnitPool ? catItems.reduce((sum, item) => sum + getTotalQuantity(item.id), 0) : 0;

                                return (
                                    <section key={category.id} className="space-y-4">
                                        <div className="border-b border-border pb-2">
                                            <h2 className="text-lg font-black uppercase tracking-tighter">{category.name}</h2>
                                            {isUnitPool ? (
                                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                                                    Escolha seus itens ({category.maxPerGuest || 1} unidades por pessoa)
                                                </p>
                                            ) : (
                                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                                                    Opções para o Grupo
                                                </p>
                                            )}
                                        </div>
                                        <div className="grid gap-3">
                                            {catItems.map(item => {
                                                const qty = getTotalQuantity(item.id);
                                                const firstSelectionId = selections.find(s => s.menuItemId === item.id)?.id;

                                                // Descobre se o botão de Mais deve ser desabilitado
                                                let isMaxedOut = false;
                                                if (isUnitPool) {
                                                    isMaxedOut = categoryTotalQty >= poolSize;
                                                } else {
                                                    // group_portion maxes out at totalGuests
                                                    isMaxedOut = qty >= totalGuests;
                                                }

                                                const hasFlavors = item.flavors && item.flavors.length > 0;
                                                const itemSelections = selections.filter(s => s.menuItemId === item.id);

                                                if (!hasFlavors) {
                                                    return (
                                                        <div key={item.id} className="bg-card p-4 rounded-2xl border border-border flex flex-col gap-3">
                                                            <div className="flex items-start gap-3">
                                                                {item.imageUrl && (
                                                                    <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-secondary">
                                                                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <h3 className="font-bold text-sm">{item.name}</h3>
                                                                    {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
                                                                    {item.price > 0 && <p className="text-primary font-black mt-1 text-sm">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}</p>}
                                                                    {!isUnitPool && (
                                                                        <p className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded mt-2">
                                                                            Quantos hóspedes querem?
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="text-xs text-muted-foreground font-medium">{qty > 0 ? `${qty} selecionado(s)` : ""}</span>
                                                                <div className="flex items-center gap-3 bg-secondary rounded-xl p-1 border border-border">
                                                                    <button
                                                                        onClick={() => firstSelectionId && removeSelection(firstSelectionId)}
                                                                        disabled={qty === 0}
                                                                        className="w-8 h-8 flex items-center justify-center text-foreground hover:bg-background rounded-lg disabled:opacity-30 transition-all font-bold"
                                                                    ><Minus size={16} /></button>
                                                                    <span className="w-4 text-center font-black text-sm">{qty}</span>
                                                                    <button
                                                                        onClick={() => addSelection(item.id)}
                                                                        disabled={isMaxedOut}
                                                                        className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-all font-bold", isMaxedOut ? "opacity-30 text-foreground" : "text-primary hover:bg-background")}
                                                                    ><Plus size={16} /></button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                }

                                                let displayImage = item.imageUrl;
                                                if (hasFlavors && itemSelections.length > 0) {
                                                    const lastSelection = itemSelections[itemSelections.length - 1];
                                                    const flavorObj = item.flavors!.find(f => f.name === lastSelection.flavor);
                                                    if (flavorObj?.imageUrl) displayImage = flavorObj.imageUrl;
                                                }

                                                return (
                                                    <div key={item.id} className="bg-card p-4 rounded-2xl border border-border space-y-3">
                                                        <div className="flex items-start gap-3">
                                                            {displayImage && (
                                                                <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-secondary">
                                                                    <img src={displayImage} alt={item.name} className="w-full h-full object-cover transition-all duration-300" />
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-bold text-sm">{item.name}</h4>
                                                                {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
                                                                {item.price > 0 && (
                                                                    <span className="text-primary font-bold text-xs mt-1 block">+{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)} (cada)</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {!isUnitPool && (
                                                            <p className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded mt-2">
                                                                Quantos hóspedes querem? (Adicione os sabores abaixo)
                                                            </p>
                                                        )}

                                                        {/* Lista as opções já selecionadas para o grupo */}
                                                        {itemSelections.length > 0 && (
                                                            <div className="flex flex-col gap-2">
                                                                {itemSelections.map(sel => (
                                                                    <div key={sel.id} className="flex items-center justify-between bg-primary/10 border border-primary/20 px-3 py-2 rounded-xl text-xs font-semibold text-primary min-w-0 overflow-hidden">
                                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                            <span className="px-1.5 py-0.5 bg-primary/20 rounded font-black shrink-0">{sel.quantity}x</span>
                                                                            <span className="truncate">{sel.flavor}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <button onClick={() => addSelection(item.id, undefined, sel.flavor)} disabled={isMaxedOut} className="p-1 hover:bg-primary/20 rounded-md transition-colors"><Plus size={14} /></button>
                                                                            <button onClick={() => removeSelection(sel.id)} className="p-1 hover:bg-primary/20 rounded-md transition-colors"><Minus size={14} /></button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Dropdown para adicionar nova seleção de sabor */}
                                                        <div className="flex items-center gap-2">
                                                            <select
                                                                className="flex-1 bg-secondary border border-border p-2 rounded-xl text-xs font-bold outline-none"
                                                                defaultValue=""
                                                                disabled={isMaxedOut}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (val) {
                                                                        addSelection(item.id, undefined, val);
                                                                        e.target.value = ""; // reset
                                                                    }
                                                                }}
                                                            >
                                                                <option value="" disabled>{isMaxedOut ? "Limite Atingido" : "+ Adicionar Sabor..."}</option>
                                                                {item.flavors!.map(f => (
                                                                    <option key={f.name} value={f.name}>{f.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </section>
                                );
                            }

                            // LÓGICA INDIVIDUAL (Por Hóspede)
                            return (
                                <section key={category.id} className="space-y-6">
                                    <div className="border-b border-border pb-2">
                                        <h2 className="text-lg font-black uppercase tracking-tighter">{category.name}</h2>
                                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold flex items-center gap-1">
                                            <AlertCircle size={12} /> Máx. {category.maxPerGuest || 1} item(s) por hóspede
                                        </p>
                                    </div>

                                    <div className="space-y-4 pt-4 relative">
                                        {/* Tabs Carrossel de Guests */}
                                        <div className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar snap-x relative z-10 w-full md:px-2">
                                            {guestIdentifiers.map((guest, idx) => {
                                                const currentIdx = currentGuestIdxPerCat[category.id] || 0;
                                                const isActive = currentIdx === idx;
                                                const displayName = guestNames[idx] || guest;
                                                const hasSelections = selections.some(s => s.guestName === displayName && catItems.some(i => i.id === s.menuItemId));
                                                const isSkipped = skippedGuests[`${category.id}_${idx}`];
                                                const isFinished = hasSelections || isSkipped;

                                                return (
                                                    <button
                                                        key={guest}
                                                        onClick={() => setCurrentGuestIdxPerCat(prev => ({ ...prev, [category.id]: idx }))}
                                                        className={cn(
                                                            "snap-start shrink-0 px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all snap-center flex items-center gap-2 border",
                                                            isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 border-primary"
                                                                : "bg-secondary text-muted-foreground hover:bg-primary/5 hover:text-foreground border-border",
                                                            isFinished && !isActive ? "opacity-60 border-primary/30" : ""
                                                        )}
                                                    >
                                                        {displayName}
                                                        {isFinished && <CheckCircle2 size={14} className={isActive ? "text-primary-foreground" : "text-primary"} />}
                                                    </button>
                                                )
                                            })}
                                        </div>

                                        {/* Painel do Guest Atual */}
                                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                            {(() => {
                                                const currentIdx = currentGuestIdxPerCat[category.id] || 0;
                                                const guest = guestIdentifiers[currentIdx];
                                                const displayName = guestNames[currentIdx] || guest;

                                                return (
                                                    <div key={guest} className="space-y-4 p-4 md:p-6 bg-secondary/10 rounded-3xl border border-primary/10 relative overflow-hidden ring-1 ring-inset ring-foreground/5 shadow-inner">
                                                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10" />

                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-bold text-sm uppercase tracking-widest bg-background border border-border w-max px-3 py-1 rounded-full text-foreground shadow-sm">{displayName}</h3>
                                                            </div>
                                                            {skippedGuests[`${category.id}_${currentIdx}`] ? (
                                                                <button onClick={() => setSkippedGuests(prev => ({ ...prev, [`${category.id}_${currentIdx}`]: false }))} className="text-[10px] font-bold text-primary uppercase underline">Escolher Itens</button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => {
                                                                        setSelections(prev => prev.filter(s => !(s.guestName === displayName && catItems.some(i => i.id === s.menuItemId))));
                                                                        setSkippedGuests(prev => ({ ...prev, [`${category.id}_${currentIdx}`]: true }));
                                                                        if (currentIdx < guestIdentifiers.length - 1) {
                                                                            setCurrentGuestIdxPerCat(prev => ({ ...prev, [category.id]: currentIdx + 1 }));
                                                                        }
                                                                    }}
                                                                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase underline transition-colors"
                                                                >
                                                                    Nenhum / Pular
                                                                </button>
                                                            )}
                                                        </div>

                                                        {skippedGuests[`${category.id}_${currentIdx}`] ? (
                                                            <div className="bg-secondary/50 border border-dashed border-border p-6 rounded-2xl text-center">
                                                                <AlertCircle size={24} className="mx-auto text-muted-foreground mb-2 opacity-50" />
                                                                <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">{displayName} pulou esta etapa</p>
                                                            </div>
                                                        ) : pendingFlavorSelection?.categoryId === category.id && pendingFlavorSelection?.guestName === displayName ? (
                                                            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                                                                <button onClick={() => setPendingFlavorSelection(null)} className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-2 hover:text-foreground">
                                                                    <ArrowLeft size={12} /> Voltar para as opções
                                                                </button>
                                                                <div className="bg-card p-4 rounded-3xl border border-primary/20 shadow-sm relative overflow-hidden">
                                                                    <div className="flex items-center gap-4 relative z-10 bg-card rounded-t-xl mb-4 pb-4 border-b border-border/50">
                                                                        {pendingFlavorSelection.menuItem.imageUrl && <img src={pendingFlavorSelection.menuItem.imageUrl} className="w-14 h-14 rounded-xl object-cover bg-secondary" />}
                                                                        <div>
                                                                            <h4 className="font-bold text-sm text-primary">{pendingFlavorSelection.menuItem.name}</h4>
                                                                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Sabor selecionado:</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 relative z-10">
                                                                        {pendingFlavorSelection.menuItem.flavors?.map(f => (
                                                                            <button
                                                                                key={f.name}
                                                                                onClick={() => {
                                                                                    addSelection(pendingFlavorSelection.menuItem.id, displayName, f.name);
                                                                                    setPendingFlavorSelection(null);

                                                                                    // Auto advance se o limite foi atingido
                                                                                    const guestQty = selections.filter(s => s.guestName === displayName && catItems.some(i => i.id === s.menuItemId)).reduce((sum, s) => sum + s.quantity, 0) + 1;
                                                                                    if (guestQty >= (category.maxPerGuest || 1)) {
                                                                                        setTimeout(() => {
                                                                                            if (currentIdx < guestIdentifiers.length - 1) {
                                                                                                setCurrentGuestIdxPerCat(prev => ({ ...prev, [category.id]: currentIdx + 1 }));
                                                                                            }
                                                                                        }, 400);
                                                                                    }
                                                                                }}
                                                                                className="p-3 border border-border rounded-xl flex items-center justify-between hover:border-primary/50 hover:bg-primary/5 transition-colors text-left bg-background shadow-xs hover:shadow-sm"
                                                                            >
                                                                                <div className="flex items-center gap-3">
                                                                                    {f.imageUrl && <img src={f.imageUrl} className="w-10 h-10 rounded-lg object-cover bg-secondary" />}
                                                                                    <span className="font-bold text-sm text-foreground">{f.name}</span>
                                                                                </div>
                                                                                <ChevronRight size={16} className="text-muted-foreground/50" />
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="grid gap-3 animate-in fade-in duration-300">
                                                                {catItems.map(item => {
                                                                    const hasFlavors = item.flavors && item.flavors.length > 0;
                                                                    const qty = getTotalQuantity(item.id, displayName);
                                                                    const guestSelectionsForItem = selections.filter(s => s.menuItemId === item.id && s.guestName === displayName);

                                                                    // Determine image to display
                                                                    let displayImage = item.imageUrl;
                                                                    if (hasFlavors && guestSelectionsForItem.length > 0) {
                                                                        const lastSelection = guestSelectionsForItem[guestSelectionsForItem.length - 1];
                                                                        const flavorObj = item.flavors!.find(f => f.name === lastSelection.flavor);
                                                                        if (flavorObj?.imageUrl) displayImage = flavorObj.imageUrl;
                                                                    }

                                                                    return (
                                                                        <div key={item.id} className={cn("bg-card p-4 rounded-2xl border flex items-center justify-between gap-4 shadow-sm transition-all relative overflow-hidden", qty > 0 ? "border-primary/50" : "border-border hover:border-primary/30")}>
                                                                            {displayImage && (
                                                                                <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-secondary">
                                                                                    <img src={displayImage} alt={item.name} className="w-full h-full object-cover transition-all duration-300" />
                                                                                </div>
                                                                            )}
                                                                            <div className="flex-1 cursor-pointer" onClick={() => {
                                                                                if (hasFlavors) {
                                                                                    setPendingFlavorSelection({ categoryId: category.id, guestName: displayName, menuItem: item });
                                                                                } else if (qty === 0) {
                                                                                    addSelection(item.id, displayName);
                                                                                    const guestQty = selections.filter(s => s.guestName === displayName && catItems.some(i => i.id === s.menuItemId)).reduce((sum, s) => sum + s.quantity, 0) + 1;
                                                                                    if (guestQty >= (category.maxPerGuest || 1)) {
                                                                                        setTimeout(() => {
                                                                                            if (currentIdx < guestIdentifiers.length - 1) {
                                                                                                setCurrentGuestIdxPerCat(prev => ({ ...prev, [category.id]: currentIdx + 1 }));
                                                                                            }
                                                                                        }, 400);
                                                                                    }
                                                                                }
                                                                            }}>
                                                                                <h4 className="font-bold text-sm">{item.name}</h4>
                                                                                {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2 pr-4">{item.description}</p>}
                                                                                {item.price > 0 && <span className="text-primary font-bold text-xs mt-1 block">+{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}</span>}
                                                                            </div>

                                                                            <div className="shrink-0 pl-2 pr-1 flex flex-col items-end gap-2 z-10">
                                                                                {qty > 0 && !hasFlavors ? (
                                                                                    <div className="flex items-center gap-2 bg-secondary rounded-lg p-0.5 border border-border">
                                                                                        <button onClick={() => {
                                                                                            const sel = selections.find(s => s.menuItemId === item.id && s.guestName === displayName);
                                                                                            if (sel) removeSelection(sel.id);
                                                                                        }} className="w-8 h-8 flex items-center justify-center bg-background rounded-md shadow-sm text-foreground"><Minus size={14} /></button>
                                                                                        <span className="w-4 text-center font-bold text-sm">{qty}</span>
                                                                                        <button onClick={() => addSelection(item.id, displayName)} className="w-8 h-8 flex items-center justify-center text-primary bg-background rounded-md shadow-sm"><Plus size={14} /></button>
                                                                                    </div>
                                                                                ) : guestSelectionsForItem.length > 0 && hasFlavors ? (
                                                                                    <div className="flex flex-col gap-1 items-end">
                                                                                        {guestSelectionsForItem.map(sel => (
                                                                                            <div key={sel.id} className="flex items-center gap-2 bg-secondary rounded-lg border border-border px-2 py-1">
                                                                                                <span className="text-[10px] font-bold text-primary max-w-[80px] truncate" title={sel.flavor}>{sel.flavor}</span>
                                                                                                <button onClick={(e) => { e.stopPropagation(); removeSelection(sel.id); }} className="text-muted-foreground hover:text-red-500"><X size={12} /></button>
                                                                                            </div>
                                                                                        ))}
                                                                                        <button onClick={(e) => { e.stopPropagation(); setPendingFlavorSelection({ categoryId: category.id, guestName: guest, menuItem: item }); }} className="text-[10px] font-bold text-primary mt-1 flex items-center gap-1 uppercase bg-primary/10 px-2 py-1 rounded hover:bg-primary/20 transition-colors"><Plus size={10} /> Adicionar</button>
                                                                                    </div>
                                                                                ) : (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            if (hasFlavors) {
                                                                                                setPendingFlavorSelection({ categoryId: category.id, guestName: displayName, menuItem: item });
                                                                                            } else {
                                                                                                addSelection(item.id, displayName);
                                                                                                const guestQty = selections.filter(s => s.guestName === displayName && catItems.some(i => i.id === s.menuItemId)).reduce((sum, s) => sum + s.quantity, 0) + 1;
                                                                                                if (guestQty >= (category.maxPerGuest || 1)) {
                                                                                                    setTimeout(() => {
                                                                                                        if (currentIdx < guestIdentifiers.length - 1) {
                                                                                                            setCurrentGuestIdxPerCat(prev => ({ ...prev, [category.id]: currentIdx + 1 }));
                                                                                                        }
                                                                                                    }, 400);
                                                                                                }
                                                                                            }
                                                                                        }}
                                                                                        className="w-8 h-8 flex items-center justify-center text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors font-bold shadow-sm"
                                                                                    >
                                                                                        <Plus size={16} />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* Botão de Avançar dentro do Guest / Feedback para continuar */}
                                                        {currentIdx < guestIdentifiers.length - 1 && (
                                                            <div className="pt-4 mt-2 flex justify-end animate-in fade-in duration-300 border-t border-border">
                                                                <button
                                                                    onClick={() => setCurrentGuestIdxPerCat(prev => ({ ...prev, [category.id]: currentIdx + 1 }))}
                                                                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-black tracking-widest text-[10px] uppercase rounded-xl hover:opacity-90 transition-all shadow-md shadow-primary/20"
                                                                >
                                                                    Próximo Hóspede <ArrowRight size={14} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </section>
                            );
                        })}

                        {/* Observações gerais */}
                        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Info size={12} /> Observações / Pedidos Especiais
                            </p>
                            <textarea
                                value={observationsText}
                                onChange={e => setObservationsText(e.target.value)}
                                placeholder='Ex: "João não quer ervilhas" ou "Sem glúten para a Maria"'
                                rows={3}
                                className="w-full bg-secondary border border-border px-3 py-2 rounded-xl text-sm outline-none focus:border-primary/50 transition-all resize-none"
                            />
                        </div>

                        <div className="h-20"></div> {/* Spacing for sticky bottom bar */}
                    </div>
                )}

                {/* STEP 2: Resumo e Confirmar */}
                {step === 2 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
                            <h2 className="text-xl font-black uppercase tracking-tighter mb-4 border-b border-border pb-2">Resumo do Pedido</h2>
                            <div className="flex justify-between items-center mb-6 bg-secondary p-4 rounded-2xl">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Entrega agendada</p>
                                    <p className="font-black mt-1 text-foreground">{deliveryDate} às {deliveryTime}</p>
                                </div>
                                <button onClick={() => setStep(0)} className="text-primary font-bold text-xs uppercase underline">Alterar</button>
                            </div>

                            <div className="space-y-6">
                                {categories.map(cat => {
                                    const catItemsInCart = selections.filter(s => {
                                        const i = items.find(it => it.id === s.menuItemId);
                                        return i?.categoryId === cat.id;
                                    });

                                    if (catItemsInCart.length === 0) return null;

                                    return (
                                        <div key={cat.id} className="space-y-2">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground bg-secondary/50 px-3 py-1 rounded w-max">{cat.name}</h3>

                                            {cat.selectionTarget === 'group_unit' ? (
                                                <div className="bg-background border border-border/50 rounded-xl p-3">
                                                    <p className="text-sm font-medium">
                                                        {catItemsInCart.map(sel => {
                                                            const itemDef = items.find(i => i.id === sel.menuItemId);
                                                            return `${sel.quantity}x ${itemDef?.name}`;
                                                        }).join(' | ')}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {catItemsInCart.map(sel => {
                                                        const item = items.find(i => i.id === sel.menuItemId);
                                                        if (!item) return null;

                                                        return (
                                                            <div key={sel.id} className="flex justify-between items-start border-b border-border/50 pb-2 last:border-0 last:pb-0">
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="font-bold text-sm">
                                                                            {cat.selectionTarget === 'individual' ? (
                                                                                <>
                                                                                    {item.name}
                                                                                    {sel.flavor && <span className="text-muted-foreground font-normal"> de {sel.flavor}</span>}
                                                                                    {sel.guestName && <span className="text-primary font-black ml-1">para {sel.guestName}</span>}
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    {item.name} <span className="text-muted-foreground font-normal">para {sel.quantity} pessoa(s)</span>
                                                                                </>
                                                                            )}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {item.price > 0 ? (
                                                                    <span className="font-mono text-sm">{(item.price * sel.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                                ) : (
                                                                    <span className="font-mono text-xs text-green-500 font-bold uppercase mt-0.5">Incluso</span>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            {totalPrice > 0 && (
                                <div className="mt-6 pt-4 border-t border-border flex justify-between items-center">
                                    <span className="font-black uppercase tracking-widest text-muted-foreground">Total Extras</span>
                                    <span className="text-xl font-black text-primary">{totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                </div>
                            )}

                            {observationsText.trim() && (
                                <div className="mt-4 p-4 bg-secondary/50 border border-border rounded-2xl">
                                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1"><Info size={12} /> Observações</p>
                                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">{observationsText}</p>
                                </div>
                            )}

                        </div>
                    </div>
                )
                }
            </main >

            {/* Bottom Floating Bar */}
            {
                (step === 1 || step === 2) && (
                    <div className="fixed bottom-0 left-0 w-full bg-background/90 backdrop-blur-xl border-t border-border p-4 z-50 animate-in slide-in-from-bottom-12">
                        <div className="max-w-2xl mx-auto">
                            {step === 1 && (
                                <button
                                    onClick={() => setStep(2)}
                                    disabled={totalItems === 0}
                                    className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest flex items-center justify-between px-6 shadow-xl shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:shadow-none"
                                >
                                    <span>Revisar Pedido</span>
                                    <div className="flex items-center gap-2">
                                        <span className="bg-black/20 px-2 py-1 rounded-lg text-xs">{totalItems} itens</span>
                                        <ChevronRight size={18} />
                                    </div>
                                </button>
                            )}
                            {step === 2 && (
                                <button
                                    onClick={submitOrder}
                                    disabled={saving}
                                    className="w-full py-4 bg-green-500 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-green-500/20 hover:bg-green-600 transition-all disabled:opacity-50 disabled:shadow-none"
                                >
                                    {saving ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle2 size={24} />}
                                    <span>Confirmar Pedido Final</span>
                                </button>
                            )}
                        </div>
                    </div>
                )
            }
        </div >
    );
}

// Removed manual polyfill.

export default function GuestBreakfastPage() {
    return (
        <Suspense fallback={
            <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        }>
            <BreakfastWizard />
        </Suspense>
    );
}
