"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { SurveyService } from "@/services/survey-service";
import { PropertyService } from "@/services/property-service";
import { Stay, Property } from "@/types/aura";
import { Loader2, CheckCircle, FileText, Share, AlertCircle, Phone, Star, ArrowRight, Coffee, Calendar, BellRing, BookOpen, Wifi, Key, Ticket, MessageSquare, Menu, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// --- HELPERS DE TEMA ---
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


const hubTranslations = {
    pt: {
        welcome: 'Bem-vindo(a) à sua',
        checkout: 'Check-out',
        breakfast: 'Café da Manhã',
        breakfastSub: 'Agende seu delivery na cabana',
        scheduling: 'Agendamentos',
        schedulingSub: 'Reservar espaços',
        concierge: 'Concierge',
        comingSoon: 'Em breve',
        wifi: 'Wi-Fi',
        wifiSub: 'Ver senha',
        access: 'Acessos',
        accessSub: 'Senhas e portões',
        guides: 'Guias',
        guidesSub: 'Manuais e regras',
        events: 'Eventos',
        survey: 'Avaliar Estadia',
        surveySub: 'Compartilhe sua experiência',
        whatsapp: 'Falar com a Recepção',
        whatsappSub: 'Suporte via WhatsApp',
        termsTitle: 'Revisão de Termos',
        termsDesc: 'Por favor, leia e aceite nossas políticas para ter acesso ao portal.',
        policyGeneral: 'Política Geral',
        policyPrivacy: 'Privacidade (LGPD)',
        policyPet: 'Política Pet',
        agreedGeneral: 'Li e concordo com a Política Geral',
        agreedPrivacy: 'Li e concordo com a Privacidade (LGPD)',
        agreedPet: 'Li e concordo com a Política Pet',
        proceed: 'Prosseguir',
        checkoutTitle: 'Obrigado pela visita!',
        checkoutDesc: 'Agradecemos por nos escolher. Volte sempre e tenha uma ótima viagem!',
        needHelp: 'Precisou de algo?',
    },
    en: {
        welcome: 'Welcome to your',
        checkout: 'Check-out',
        breakfast: 'Breakfast',
        breakfastSub: 'Schedule delivery to your cabin',
        scheduling: 'Reservations',
        schedulingSub: 'Book spaces',
        concierge: 'Concierge',
        comingSoon: 'Coming soon',
        wifi: 'Wi-Fi',
        wifiSub: 'See password',
        access: 'Access',
        accessSub: 'Codes & gates',
        guides: 'Guides',
        guidesSub: 'Manuals & rules',
        events: 'Events',
        survey: 'Rate your stay',
        surveySub: 'Share your experience',
        whatsapp: 'Contact Reception',
        whatsappSub: 'WhatsApp support',
        termsTitle: 'Terms Review',
        termsDesc: 'Please read and accept our policies to access the portal.',
        policyGeneral: 'General Policy',
        policyPrivacy: 'Privacy (LGPD)',
        policyPet: 'Pet Policy',
        agreedGeneral: 'I have read and agree to the General Policy',
        agreedPrivacy: 'I have read and agree to Privacy (LGPD)',
        agreedPet: 'I have read and agree to the Pet Policy',
        proceed: 'Continue',
        checkoutTitle: 'Thank you for your visit!',
        checkoutDesc: 'We appreciate you choosing us. Come back soon and have a great trip!',
        needHelp: 'Need anything?',
    },
    es: {
        welcome: 'Bienvenido(a) a su',
        checkout: 'Check-out',
        breakfast: 'Desayuno',
        breakfastSub: 'Programa tu entrega en la cabaña',
        scheduling: 'Reservas',
        schedulingSub: 'Reservar espacios',
        concierge: 'Conserjería',
        comingSoon: 'Próximamente',
        wifi: 'Wi-Fi',
        wifiSub: 'Ver contraseña',
        access: 'Accesos',
        accessSub: 'Claves y portones',
        guides: 'Guías',
        guidesSub: 'Manuales y reglas',
        events: 'Eventos',
        survey: 'Evaluar estadía',
        surveySub: 'Comparte tu experiencia',
        whatsapp: 'Contactar Recepción',
        whatsappSub: 'Soporte por WhatsApp',
        termsTitle: 'Revisión de Términos',
        termsDesc: 'Por favor, lea y acepte nuestras políticas para acceder al portal.',
        policyGeneral: 'Política General',
        policyPrivacy: 'Privacidad (LGPD)',
        policyPet: 'Política de Mascotas',
        agreedGeneral: 'He leído y acepto la Política General',
        agreedPrivacy: 'He leído y acepto la Privacidad (LGPD)',
        agreedPet: 'He leído y acepto la Política de Mascotas',
        proceed: 'Continuar',
        checkoutTitle: '¡Gracias por su visita!',
        checkoutDesc: 'Gracias por elegirnos. ¡Vuelva pronto y que tenga un buen viaje!',
        needHelp: '¿Necesita algo?',
    },
};

function GuestHubContent() {
    const { code } = useParams();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lang, setLang] = useState<'pt' | 'en' | 'es'>('pt');
    const t = hubTranslations[lang];

    const [stays, setStays] = useState<Stay[]>([]);
    const [stay, setStay] = useState<Stay | null>(null);
    const [property, setProperty] = useState<Property | null>(null);

    // States para fluxos
    const [hasSurvey, setHasSurvey] = useState(false);

    // States para Aceite de Termos
    const [agreedGeneral, setAgreedGeneral] = useState(false);
    const [agreedPrivacy, setAgreedPrivacy] = useState(false);
    const [agreedPet, setAgreedPet] = useState(false);
    const [isSavingTerms, setIsSavingTerms] = useState(false);

    // Modals
    const [showWifiModal, setShowWifiModal] = useState(false);
    const [showGateModal, setShowGateModal] = useState(false);

    useEffect(() => {
        async function init() {
            try {
                if (!code) {
                    setError("Código não informado");
                    setLoading(false);
                    return;
                }

                const stays = await StayService.getStaysByAccessCode(code as string);
                if (!stays || stays.length === 0) {
                    setError("Nenhuma reserva encontrada com este código.");
                    setLoading(false);
                    return;
                }

                setStays(stays as Stay[]);
                const firstStay = stays[0] as Stay;
                setStay(firstStay);

                const prop = await PropertyService.getPropertyById(firstStay.propertyId);
                setProperty(prop as Property);

                // Ler idioma preferido do hóspede, fallback para idioma do browser
                try {
                    const stayData = await StayService.getStayWithGuestAndCabin(firstStay.propertyId, firstStay.id);
                    const savedLang = stayData?.guest?.preferredLanguage;
                    if (savedLang && ['pt', 'en', 'es'].includes(savedLang)) {
                        setLang(savedLang as 'pt' | 'en' | 'es');
                    } else {
                        const browserLang = navigator.language.slice(0, 2);
                        if (browserLang === 'es') setLang('es');
                        else if (browserLang === 'en') setLang('en');
                    }
                } catch { /* silently ignore — UI defaults to PT */ }

                if (stays.length === 1) {
                    if (firstStay.status === 'pending' || firstStay.status === 'pre_checkin_done') {
                        // Ainda não fez check-in, redirecionar para o formulário
                        router.replace(`/check-in/form/${firstStay.id}`);
                        return;
                    }

                    if (firstStay.status === 'finished') {
                        const surveyed = await SurveyService.hasSurveyForStay(firstStay.propertyId, firstStay.id);
                        setHasSurvey(surveyed);
                    }
                }

                setLoading(false);
            } catch (err: any) {
                console.error(err);
                setError("Erro ao carregar dados da reserva");
                setLoading(false);
            }
        }
        init();
    }, [code, router]);

    const handleTermsAccept = async () => {
        if (!stay) return;

        // Validate
        if (!agreedGeneral) { toast.error("Por favor, aceite a Política Geral"); return; }
        if (!agreedPrivacy) { toast.error("Por favor, aceite a Política de Privacidade"); return; }
        if (stay.hasPet && !agreedPet) { toast.error("Por favor, aceite a Política Pet"); return; }

        setIsSavingTerms(true);
        try {
            // Update automationFlags in Stay
            const newFlags = {
                ...(stay.automationFlags || { send48h: true, send24h: true, preCheckinSent: false, remindersCount: 0 }),
                termsAccepted: true
            };

            await StayService.updateStayData(stay.propertyId, stay.id, { automationFlags: newFlags }, stay.guestId || 'system', 'Guest');

            // Update local state to trigger the dashboard view
            setStay({ ...stay, automationFlags: newFlags });
            toast.success("Termos aceitos com sucesso!");
        } catch (e) {
            toast.error("Houve um erro ao registrar seu aceite.");
        } finally {
            setIsSavingTerms(false);
        }
    };


    if (error) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
                <div className="max-w-md w-full p-8 bg-white rounded-3xl shadow-xl space-y-4">
                    <AlertCircle size={64} className="mx-auto text-red-500 opacity-80" />
                    <h1 className="text-2xl font-black uppercase text-slate-800 tracking-tighter">Erro</h1>
                    <p className="text-slate-500">{error}</p>
                </div>
            </div>
        );
    }

    if (loading || !stay) {
        return (
            <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-50 text-slate-900">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                <p className="mt-4 text-slate-500 font-medium">Carregando seu portal...</p>
            </div>
        );
    }

    const themeStyles = getThemeStyles(property);

    // --- RENDER FUNCTIONS BY STATE ---

    if (stays.length > 1) {
        return (
            <div className="min-h-screen p-6 bg-background text-foreground flex flex-col items-center justify-center font-sans space-y-8" style={themeStyles}>
                <div className="text-center space-y-2 mt-8 animate-in fade-in duration-700">
                    <h1 className="text-3xl font-black uppercase tracking-tighter">Reserva de Grupo</h1>
                    <p className="text-muted-foreground italic">Existem acomodações vinculadas a este código aguardando a finalização da sua ficha.</p>
                </div>

                <div className="grid gap-4 w-full max-w-md animate-in slide-in-from-bottom-6 duration-700">
                    {stays.map((s: any) => {
                        return (
                            <button
                                key={s.id}
                                onClick={() => router.push(`/check-in/form/${s.id}`)}
                                className="p-6 bg-secondary/80 hover:bg-secondary rounded-[32px] border border-border border-l-4 border-l-primary/50 text-left transition-all flex justify-between items-center group shadow-sm hover:shadow-md"
                            >
                                <div>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Unidade</p>
                                    <p className="text-xl font-black text-foreground">{s.cabinName || "Acomodação"}</p>
                                    <span className="text-[9px] font-bold uppercase mt-2 inline-block px-2 py-1 rounded bg-orange-500/10 text-orange-600">
                                        Pendente
                                    </span>
                                </div>
                                <ArrowRight size={20} className="transition-transform group-hover:translate-x-1 text-primary" />
                            </button>
                        )
                    })}
                </div>
            </div>
        );
    }

    if (stay.status === 'finished') {
        if (!hasSurvey) {
            // CONVIDAR PARA AVALIAR
            return (
                <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background text-foreground" style={themeStyles}>
                    <div className="max-w-md w-full p-8 bg-card border border-border rounded-3xl shadow-xl space-y-8 animate-in zoom-in duration-500">
                        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary shadow-inner">
                            <Star size={40} className="fill-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter">O que achou da sua estadia?</h1>
                            <p className="text-muted-foreground mt-2">
                                Sua avaliação é muito importante para nós. Levará apenas alguns minutinhos.
                            </p>
                        </div>

                        <button
                            onClick={() => router.push(`/feedback/${stay.id}`)} // Assumindo que essa rota de feedback existe ou será criada em outro momento. Ou apenas avisar que não existe.
                            className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg"
                        >
                            Avaliar Estadia <ArrowRight size={20} />
                        </button>
                    </div>
                </div>
            );
        } else {
            // HOSPEDAGEM ENCERRADA
            return (
                <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background text-foreground" style={themeStyles}>
                    <div className="max-w-md w-full p-8 bg-card border border-border rounded-3xl shadow-xl space-y-8 animate-in zoom-in duration-500">
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto text-green-500 shadow-inner">
                            <CheckCircle size={40} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter">Hospedagem Encerrada</h1>
                            <p className="text-muted-foreground mt-2">
                                Agradecemos por nos escolher. Volte sempre e tenha uma ótima viagem!
                            </p>
                        </div>

                        <button
                            onClick={() => window.open(`https://wa.me/${property?.settings?.whatsappNumber?.replace(/\D/g, '') || ''}`, '_blank')}
                            className="w-full py-4 bg-green-600 text-white font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:bg-green-700 transition-all shadow-lg shadow-green-600/20"
                        >
                            <Phone size={20} /> Precisou de algo?
                        </button>
                    </div>
                </div>
            );
        }
    }

    // STATUS: ACTIVE
    if (stay.status === 'active') {
        // SE NÃO ACEITOU OS TERMOS
        if (!stay.automationFlags?.termsAccepted) {
            return (
                <div className="min-h-screen p-6 bg-background text-foreground" style={themeStyles}>
                    <div className="max-w-2xl mx-auto space-y-8 pb-32 animate-in fade-in duration-700">

                        <div className="text-center space-y-2 mt-8">
                            <FileText size={48} className="mx-auto text-primary" />
                            <h1 className="text-3xl font-black uppercase text-foreground tracking-tighter">Revisão de Termos</h1>
                            <p className="text-muted-foreground">Por favor, leia e aceite nossas políticas para ter acesso ao portal de sua hospedagem.</p>
                        </div>

                        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm overflow-hidden flex flex-col">
                            <h2 className="text-xl font-bold mb-4 uppercase text-primary">Política Geral</h2>
                            <div className="bg-secondary/30 p-4 rounded-xl text-sm/relaxed text-muted-foreground mb-4 max-h-48 overflow-y-auto whitespace-pre-line">
                                {property?.settings?.generalPolicyText?.pt || "Política não informada"}
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer p-4 bg-secondary rounded-xl hover:bg-accent transition-colors">
                                <input type="checkbox" checked={agreedGeneral} onChange={(e) => setAgreedGeneral(e.target.checked)} className="w-6 h-6 rounded text-primary focus:ring-primary/20 accent-primary" />
                                <span className="font-semibold text-foreground">Li e concordo com a Política Geral</span>
                            </label>
                        </div>

                        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm overflow-hidden flex flex-col">
                            <h2 className="text-xl font-bold mb-4 uppercase text-primary">Política de Privacidade</h2>
                            <div className="bg-secondary/30 p-4 rounded-xl text-sm/relaxed text-muted-foreground mb-4 max-h-48 overflow-y-auto whitespace-pre-line">
                                {property?.settings?.privacyPolicyText?.pt || "Política de privacidade não informada"}
                            </div>
                            <label className="flex items-center gap-3 cursor-pointer p-4 bg-secondary rounded-xl hover:bg-accent transition-colors">
                                <input type="checkbox" checked={agreedPrivacy} onChange={(e) => setAgreedPrivacy(e.target.checked)} className="w-6 h-6 rounded text-primary focus:ring-primary/20 accent-primary" />
                                <span className="font-semibold text-foreground">Li e concordo com a Privacidade (LGPD)</span>
                            </label>
                        </div>

                        {stay.hasPet && (
                            <div className="bg-orange-500/5 border border-orange-500/20 rounded-3xl p-6 shadow-sm overflow-hidden flex flex-col">
                                <h2 className="text-xl font-bold mb-4 uppercase text-orange-600">Política Pet</h2>
                                <div className="bg-white/50 dark:bg-black/20 p-4 rounded-xl text-sm/relaxed text-orange-900/80 dark:text-orange-200/80 mb-4 max-h-48 overflow-y-auto whitespace-pre-line">
                                    {property?.settings?.petPolicyText?.pt || "Política Pet não informada"}
                                </div>
                                <label className="flex items-center gap-3 cursor-pointer p-4 bg-white/50 dark:bg-black/50 rounded-xl hover:bg-orange-500/10 transition-colors">
                                    <input type="checkbox" checked={agreedPet} onChange={(e) => setAgreedPet(e.target.checked)} className="w-6 h-6 rounded text-orange-600 focus:ring-orange-600/20 accent-orange-600" />
                                    <span className="font-semibold text-orange-800 dark:text-orange-200">Li e concordo com a Política Pet</span>
                                </label>
                            </div>
                        )}

                        <div className="fixed bottom-0 left-0 w-full p-6 bg-background/80 backdrop-blur-md border-t border-border z-10 flex justify-center">
                            <button
                                onClick={handleTermsAccept}
                                disabled={isSavingTerms || (!agreedGeneral || !agreedPrivacy || (stay.hasPet && !agreedPet))}
                                className="max-w-md w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                            >
                                {isSavingTerms ? <Loader2 className="animate-spin w-6 h-6" /> : "Prosseguir"}
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        // DASHBOARD DO HOSPEDE
        const fbEnabled = property?.settings?.fbSettings?.breakfast?.enabled &&
            (property.settings.fbSettings.breakfast.modality === 'delivery' || property.settings.fbSettings.breakfast.modality === 'both');

        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col items-center relative overflow-hidden font-sans" style={themeStyles}>
                {/* Dynamic Background Element */}
                <div className="absolute top-0 left-0 w-full h-[40vh] bg-gradient-to-b from-primary/20 to-background pointer-events-none -z-10"></div>
                <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-50 pointer-events-none -z-10"></div>
                <div className="absolute top-20 -right-20 w-72 h-72 bg-secondary/30 rounded-full blur-3xl pointer-events-none -z-10"></div>

                <div className="w-full max-w-md p-6 space-y-8 animate-in slide-in-from-bottom-6 duration-700 pb-24">

                    {/* Header / Brand */}
                    <div className="flex items-center justify-between">
                        {property?.logoUrl ? (
                            <img src={property.logoUrl} alt={property.name} className="h-12 w-auto object-contain" />
                        ) : (
                            <h2 className="text-xl font-black uppercase tracking-widest text-primary">{property?.name || "Aura"}</h2>
                        )}
                        <div className="flex bg-secondary/80 backdrop-blur-md rounded-lg p-1 border border-border/50">
                            {(['pt', 'en', 'es'] as const).map(l => (
                                <button key={l} onClick={() => setLang(l)}
                                    className={cn("px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                                >{l}</button>
                            ))}
                        </div>
                    </div>

                    {/* Hero Section */}
                    <div className="space-y-1">
                        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t.welcome}</p>
                        <h1 className="text-4xl font-black tracking-tighter text-foreground leading-none">
                            {(stay as any).cabinName || "Cabana"}
                        </h1>
                        <p className="text-sm font-medium text-muted-foreground mt-2 flex items-center gap-2">
                            <Calendar size={14} className="opacity-50" /> {t.checkout}: {new Date(stay.checkOut).toLocaleDateString('pt-BR')}
                        </p>
                    </div>

                    {/* Quick Action Cards Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Breakfast */}
                        {fbEnabled && (
                            <button onClick={() => router.push(`/check-in/${code}/breakfast`)} className="col-span-2 relative overflow-hidden bg-card border border-border p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex items-center justify-between group">
                                <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full blur-xl group-hover:bg-primary/20 transition-all"></div>
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="w-12 h-12 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
                                        <Coffee size={24} />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-black text-lg tracking-tight uppercase">{t.breakfast}</h3>
                                        <p className="text-xs font-medium text-muted-foreground">{t.breakfastSub}</p>
                                    </div>
                                </div>
                                <ArrowRight size={20} className="text-primary opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all z-10" />
                            </button>
                        )}

                        {/* Scheduling */}
                        <button onClick={() => router.push(`/check-in/${code}/structures`)} className="col-span-2 sm:col-span-1 bg-card border border-border p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex flex-col gap-3 group">
                            <div className="w-10 h-10 bg-secondary rounded-2xl flex items-center justify-center text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <Calendar size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-sm uppercase tracking-wider">{t.scheduling}</h3>
                                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.schedulingSub}</p>
                            </div>
                        </button>

                        {/* Concierge */}
                        <button className="col-span-2 sm:col-span-1 bg-card border border-border p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex flex-col gap-3 group opacity-70">
                            <div className="w-10 h-10 bg-secondary rounded-2xl flex items-center justify-center text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <BellRing size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-sm uppercase tracking-wider">{t.concierge}</h3>
                                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.comingSoon}</p>
                            </div>
                        </button>

                        {/* Wi-Fi */}
                        <button onClick={() => setShowWifiModal(true)} className="col-span-1 bg-card border border-border p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex flex-col gap-3 group">
                            <div className="w-10 h-10 bg-secondary rounded-2xl flex items-center justify-center text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <Wifi size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-sm uppercase tracking-wider">{t.wifi}</h3>
                                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.wifiSub}</p>
                            </div>
                        </button>

                        {/* Gates/Access */}
                        <button onClick={() => setShowGateModal(true)} className="col-span-1 bg-card border border-border p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex flex-col gap-3 group">
                            <div className="w-10 h-10 bg-secondary rounded-2xl flex items-center justify-center text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <Key size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-sm uppercase tracking-wider">{t.access}</h3>
                                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.accessSub}</p>
                            </div>
                        </button>

                        {/* Guides */}
                        <button className="col-span-1 bg-card border border-border p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex flex-col gap-3 group">
                            <div className="w-10 h-10 bg-secondary rounded-2xl flex items-center justify-center text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <BookOpen size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-sm uppercase tracking-wider">{t.guides}</h3>
                                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.guidesSub}</p>
                            </div>
                        </button>

                        {/* Events */}
                        <button className="col-span-1 bg-card border border-border p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex flex-col gap-3 group opacity-70">
                            <div className="w-10 h-10 bg-secondary rounded-2xl flex items-center justify-center text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <Ticket size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-sm uppercase tracking-wider">{t.events}</h3>
                                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.comingSoon}</p>
                            </div>
                        </button>

                        {/* Surveys (Full Width) */}
                        <button onClick={() => router.push(`/feedback/${stay.id}`)} className="col-span-2 bg-secondary/50 border border-border/50 p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex items-center gap-4 group mt-2">
                            <div className="w-10 h-10 bg-card rounded-2xl flex items-center justify-center text-foreground group-hover:bg-yellow-500 group-hover:text-white transition-colors shadow-sm">
                                <Star size={20} />
                            </div>
                            <div className="text-left flex-1">
                                <h3 className="font-bold text-sm uppercase tracking-wider">{t.survey}</h3>
                                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.surveySub}</p>
                            </div>
                            <ArrowRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                        </button>
                    </div>

                    {/* Actions */}
                    <button onClick={() => window.open(`https://wa.me/${property?.settings?.whatsappNumber?.replace(/\D/g, '') || ''}`, '_blank')} className="w-full py-4 bg-foreground text-background font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 shadow-xl mt-8">
                        <MessageSquare size={18} /> {t.whatsapp}
                    </button>
                </div>

                {/* --- MODALS --- */}
                {/* Wi-Fi Modal */}
                {showWifiModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-card w-full max-w-sm rounded-3xl shadow-2xl p-6 relative border border-border animate-in zoom-in-95">
                            <button onClick={() => setShowWifiModal(false)} className="absolute top-4 right-4 p-2 bg-secondary rounded-full hover:bg-accent transition-colors">
                                <X size={20} />
                            </button>
                            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6">
                                <Wifi size={32} />
                            </div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Conexão Wi-Fi</h2>

                            {(stay as any).cabinWifi ? (
                                <div className="space-y-4 mt-6">
                                    <div className="bg-secondary p-4 rounded-2xl border border-border">
                                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Rede (SSID)</p>
                                        <p className="text-lg font-black mt-1">{(stay as any).cabinWifi.ssid}</p>
                                    </div>
                                    <div className="bg-secondary p-4 rounded-2xl border border-border">
                                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Senha</p>
                                        <p className="text-lg font-black mt-1">{(stay as any).cabinWifi.password || 'Sem senha'}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-secondary/50 p-6 rounded-2xl text-center mt-6 border border-border/50">
                                    <p className="text-sm font-medium text-muted-foreground">O Wi-Fi da acomodação não foi configurado.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Gates Modal */}
                {showGateModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-card w-full max-w-sm rounded-3xl shadow-2xl p-6 relative border border-border animate-in zoom-in-95">
                            <button onClick={() => setShowGateModal(false)} className="absolute top-4 right-4 p-2 bg-secondary rounded-full hover:bg-accent transition-colors">
                                <X size={20} />
                            </button>
                            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6">
                                <Lock size={32} />
                            </div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Seu Acesso</h2>
                            <p className="text-muted-foreground text-sm mb-6">Utilize o código abaixo para acessar a propriedade e a sua cabana/acomodação.</p>

                            <div className="bg-secondary p-6 rounded-2xl border border-border text-center">
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Código de Acesso</p>
                                <p className="text-4xl font-black text-primary tracking-widest">{stay.accessCode}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return null;
}

export default function GuestUnifiedAccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            </div>
        }>
            <GuestHubContent />
        </Suspense>
    );
}
