"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { SurveyService } from "@/services/survey-service";
import { PropertyService } from "@/services/property-service";
import { Stay, Property } from "@/types/aura";
import { Loader2, CheckCircle, FileText, AlertCircle, Phone, Star, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { PortalShell } from "./_portal/PortalShell";

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
        conciergeSub: 'Solicitar itens e serviços',
        comingSoon: 'Em breve',
        wifi: 'Wi-Fi',
        wifiSub: 'Ver senha',
        access: 'Acessos',
        accessSub: 'Senhas e portões',
        guides: 'Guias',
        guidesSub: 'Manuais e regras',
        events: 'Eventos',
        eventsSub: 'Na região e na pousada',
        resortMap: 'Mapa do Resort',
        resortMapSub: 'Áreas, GPS e reservas',
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
        dnd: 'Não Perturbe',
        dndSub: 'Suspender limpeza do quarto',
        dndActive: 'Modo Não Perturbe ativo',
        dndUntil: 'Retoma às',
        dndConfirmTitle: 'Suspender a limpeza?',
        dndOption1h: '1 hora',
        dndOption24h: '24 horas',
        dndOption48h: '48 horas',
        dndCancel: 'Cancelar',
        dndDisable: 'Retomar limpeza normal',
        reportProblem: 'Reportar Problema',
        reportProblemSub: 'Informe algo que precisa de atenção',
        cabinIssue: 'Problema na Cabana',
        commonAreaIssue: 'Área Comum',
        appBug: 'Bug no App',
        canEnterNow: 'Pode entrar agora?',
        submitReport: 'Enviar Relatório',
        reportSent: 'Relatório enviado! Obrigado.',
        describeIssue: 'Descreva o problema...',
        selectArea: 'Selecione a área afetada',
        back: 'Voltar',
    },
    en: {
        welcome: 'Welcome to your',
        checkout: 'Check-out',
        breakfast: 'Breakfast',
        breakfastSub: 'Schedule delivery to your cabin',
        scheduling: 'Reservations',
        schedulingSub: 'Book spaces',
        concierge: 'Concierge',
        conciergeSub: 'Request items & services',
        comingSoon: 'Coming soon',
        wifi: 'Wi-Fi',
        wifiSub: 'See password',
        access: 'Access',
        accessSub: 'Codes & gates',
        guides: 'Guides',
        guidesSub: 'Manuals & rules',
        events: 'Events',
        eventsSub: 'In the area & at the resort',
        resortMap: 'Resort Map',
        resortMapSub: 'Areas, GPS & bookings',
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
        dnd: 'Do Not Disturb',
        dndSub: 'Pause room cleaning',
        dndActive: 'Do Not Disturb is active',
        dndUntil: 'Resumes at',
        dndConfirmTitle: 'Pause cleaning?',
        dndOption1h: '1 hour',
        dndOption24h: '24 hours',
        dndOption48h: '48 hours',
        dndCancel: 'Cancel',
        dndDisable: 'Resume normal cleaning',
        reportProblem: 'Report a Problem',
        reportProblemSub: 'Let us know what needs attention',
        cabinIssue: 'Cabin Issue',
        commonAreaIssue: 'Common Area',
        appBug: 'App Bug',
        canEnterNow: 'Can staff enter now?',
        submitReport: 'Submit Report',
        reportSent: 'Report sent! Thank you.',
        describeIssue: 'Describe the problem...',
        selectArea: 'Select the affected area',
        back: 'Back',
    },
    es: {
        welcome: 'Bienvenido(a) a su',
        checkout: 'Check-out',
        breakfast: 'Desayuno',
        breakfastSub: 'Programa tu entrega en la cabaña',
        scheduling: 'Reservas',
        schedulingSub: 'Reservar espacios',
        concierge: 'Conserjería',
        conciergeSub: 'Solicitar artículos y servicios',
        comingSoon: 'Próximamente',
        wifi: 'Wi-Fi',
        wifiSub: 'Ver contraseña',
        access: 'Accesos',
        accessSub: 'Claves y portones',
        guides: 'Guías',
        guidesSub: 'Manuales y reglas',
        events: 'Eventos',
        eventsSub: 'En la zona y el hotel',
        resortMap: 'Mapa del Resort',
        resortMapSub: 'Áreas, GPS y reservas',
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
        dnd: 'No Molestar',
        dndSub: 'Pausar limpieza de habitación',
        dndActive: 'Modo No Molestar activo',
        dndUntil: 'Reanuda a las',
        dndConfirmTitle: '¿Pausar la limpieza?',
        dndOption1h: '1 hora',
        dndOption24h: '24 horas',
        dndOption48h: '48 horas',
        dndCancel: 'Cancelar',
        dndDisable: 'Reanudar limpieza normal',
        reportProblem: 'Reportar Problema',
        reportProblemSub: 'Infórmenos qué necesita atención',
        cabinIssue: 'Problema en la Cabaña',
        commonAreaIssue: 'Área Común',
        appBug: 'Error en la App',
        canEnterNow: '¿Puede entrar el personal ahora?',
        submitReport: 'Enviar Reporte',
        reportSent: '¡Reporte enviado! Gracias.',
        describeIssue: 'Describa el problema...',
        selectArea: 'Seleccione el área afectada',
        back: 'Volver',
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

                const firstStay = stays[0] as Stay;

                // Redireciona cedo para o formulário se ainda não fez check-in (reserva única),
                // antes de buscar property/idioma/survey — que seriam descartados no redirect.
                if (stays.length === 1 && (firstStay.status === 'pending' || firstStay.status === 'pre_checkin_done')) {
                    router.replace(`/check-in/form/${firstStay.id}`);
                    return;
                }

                setStays(stays as Stay[]);
                setStay(firstStay);

                const isFinished = stays.length === 1 && firstStay.status === 'finished';

                // Property, idioma e survey (quando aplicável) não dependem entre si:
                // busca em paralelo em vez de em cascata. As estruturas (usadas só no
                // modal de "Reportar Problema") são carregadas sob demanda — ver useEffect.
                const [prop, guestInfo, surveyed] = await Promise.all([
                    PropertyService.getPropertyById(firstStay.propertyId),
                    StayService.getGuestNameAndLang(firstStay.guestId).catch(() => null),
                    isFinished
                        ? SurveyService.hasSurveyForStay(firstStay.propertyId, firstStay.id).catch(() => false)
                        : Promise.resolve(false),
                ]);

                setProperty(prop as Property);

                // Nome do titular vem da tabela guests → injeta no stay p/ o portal (hero, café).
                if (guestInfo?.fullName) {
                    setStay({ ...firstStay, guestName: guestInfo.fullName } as Stay);
                }

                const savedLang = guestInfo?.preferredLanguage;
                if (savedLang && ['pt', 'en', 'es'].includes(savedLang)) {
                    setLang(savedLang as 'pt' | 'en' | 'es');
                } else {
                    const browserLang = navigator.language.slice(0, 2);
                    if (browserLang === 'es') setLang('es');
                    else if (browserLang === 'en') setLang('en');
                }

                if (isFinished) setHasSurvey(surveyed);

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

            await StayService.acceptGuestTerms(stay.propertyId, stay.id, stay.guestId || 'system', "Hóspede", stay.automationFlags || {});

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

        // DASHBOARD DO HÓSPEDE — Portal redesenhado (tab shell + tema "camaleão").
        // O PortalShell aplica os tokens do tema da propriedade e cuida das telas
        // Início/Explorar/Pedidos/Estadia + bottom-sheets.
        return (
            <PortalShell
                stay={stay}
                property={property}
                code={code as string}
                lang={lang}
                setLang={setLang}
            />
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
