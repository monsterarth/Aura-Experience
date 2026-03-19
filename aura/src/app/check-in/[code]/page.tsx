"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { SurveyService } from "@/services/survey-service";
import { PropertyService } from "@/services/property-service";
import { StructureService } from "@/services/structure-service";
import { Stay, Property, Structure } from "@/types/aura";
import { Loader2, CheckCircle, FileText, Share, AlertCircle, Phone, Star, ArrowRight, Coffee, Calendar, BellRing, BookOpen, Wifi, Key, Ticket, MessageSquare, Menu, X, Lock, Moon, Clock, Flag } from "lucide-react";
import { toggleGuestDND } from "@/app/actions/dnd-actions";
import { reportCabinIssue, reportStructureIssue, reportAppBug } from "@/app/actions/issue-actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImageUpload } from "@/components/admin/ImageUpload";

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

    // Modals
    const [showWifiModal, setShowWifiModal] = useState(false);
    const [showGateModal, setShowGateModal] = useState(false);
    const [showDndModal, setShowDndModal] = useState(false);
    const [dndEnabled, setDndEnabled] = useState(false);
    const [dndUntil, setDndUntil] = useState<string | null>(null);
    const [dndLoading, setDndLoading] = useState(false);

    // Issue reporting
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [reportStep, setReportStep] = useState<'type' | 'cabin' | 'structure' | 'bug'>('type');
    const [reportDescription, setReportDescription] = useState('');
    const [canEnterNow, setCanEnterNow] = useState(false);
    const [reportStructureId, setReportStructureId] = useState('');
    const [reportImageUrl, setReportImageUrl] = useState<string>('');
    const [structures, setStructures] = useState<Structure[]>([]);
    const [reportLoading, setReportLoading] = useState(false);

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
                setDndEnabled(firstStay.dnd_enabled ?? false);
                setDndUntil(firstStay.dnd_until ?? null);

                const prop = await PropertyService.getPropertyById(firstStay.propertyId);
                setProperty(prop as Property);

                // Fetch structures for issue reporting flow
                try {
                    const structuresData = await StructureService.getStructures(firstStay.propertyId);
                    setStructures(structuresData as Structure[]);
                } catch { /* silently ignore */ }

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
        const handleDnd = async (durationHours: number | null) => {
            setDndLoading(true);
            setShowDndModal(false);
            try {
                const result = await toggleGuestDND(stay.id, stay.accessCode, durationHours);
                if (result.success) {
                    setDndEnabled(durationHours !== null);
                    setDndUntil(result.dnd_until ?? null);
                    toast.success(durationHours === null ? 'Limpeza retomada!' : 'Modo Não Perturbe ativado.');
                } else {
                    toast.error('Não foi possível atualizar o Não Perturbe.');
                }
            } catch {
                toast.error('Erro ao atualizar Não Perturbe.');
            } finally {
                setDndLoading(false);
            }
        };

        // 48h option is only shown if checkout is more than 48h away
        const hoursUntilCheckout = stay.checkOut
            ? (new Date(stay.checkOut).getTime() - Date.now()) / (1000 * 60 * 60)
            : 999;

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
                        <button onClick={() => router.push(`/check-in/${code}/concierge`)} className="col-span-2 sm:col-span-1 bg-card border border-border p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex flex-col gap-3 group">
                            <div className="w-10 h-10 bg-secondary rounded-2xl flex items-center justify-center text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <BellRing size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-sm uppercase tracking-wider">{t.concierge}</h3>
                                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.conciergeSub}</p>
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
                        <button onClick={() => router.push(`/check-in/${code}/events`)} className="col-span-1 bg-card border border-border p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-primary/50 transition-all flex flex-col gap-3 group">
                            <div className="w-10 h-10 bg-secondary rounded-2xl flex items-center justify-center text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <Ticket size={20} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-sm uppercase tracking-wider">{t.events}</h3>
                                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.eventsSub}</p>
                            </div>
                        </button>

                        {/* DND Card (Full Width) */}
                        <div className={cn(
                            "col-span-2 p-5 rounded-[2rem] border transition-all",
                            dndEnabled
                                ? "bg-yellow-500/5 border-yellow-500/50"
                                : "bg-card border-border shadow-sm"
                        )}>
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0",
                                        dndEnabled ? "bg-yellow-500 text-white" : "bg-secondary text-foreground"
                                    )}>
                                        <Moon size={20} />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-bold text-sm uppercase tracking-wider">
                                            {dndEnabled ? t.dndActive : t.dnd}
                                        </h3>
                                        {dndEnabled && dndUntil ? (
                                            <p className="text-[10px] font-medium text-yellow-600 mt-0.5 flex items-center gap-1">
                                                <Clock size={10} />
                                                {t.dndUntil} {new Date(dndUntil).toLocaleTimeString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        ) : (
                                            <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.dndSub}</p>
                                        )}
                                    </div>
                                </div>
                                {dndEnabled ? (
                                    <button
                                        onClick={() => handleDnd(null)}
                                        disabled={dndLoading}
                                        className="text-[10px] font-bold uppercase px-3 py-2 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500 hover:text-white rounded-xl transition-all disabled:opacity-50 shrink-0"
                                    >
                                        {dndLoading ? <Loader2 size={14} className="animate-spin" /> : t.dndDisable}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setShowDndModal(true)}
                                        disabled={dndLoading}
                                        className="text-[10px] font-bold uppercase px-3 py-2 bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground rounded-xl transition-all disabled:opacity-50 shrink-0"
                                    >
                                        {dndLoading ? <Loader2 size={14} className="animate-spin" /> : 'Ativar'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Report Problem (Full Width) */}
                        <button
                            onClick={() => { setReportStep('type'); setReportDescription(''); setCanEnterNow(false); setReportStructureId(''); setReportImageUrl(''); setIsReportOpen(true); }}
                            className="col-span-2 bg-card border border-border p-5 rounded-[2rem] shadow-sm hover:shadow-md hover:border-red-400/50 transition-all flex items-center gap-4 group"
                        >
                            <div className="w-10 h-10 bg-secondary rounded-2xl flex items-center justify-center text-foreground group-hover:bg-red-500 group-hover:text-white transition-colors shrink-0">
                                <Flag size={20} />
                            </div>
                            <div className="text-left flex-1">
                                <h3 className="font-bold text-sm uppercase tracking-wider">{t.reportProblem}</h3>
                                <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{t.reportProblemSub}</p>
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

                {/* DND Modal */}
                {showDndModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-card w-full max-w-sm rounded-3xl shadow-2xl p-6 relative border border-border animate-in zoom-in-95">
                            <button onClick={() => setShowDndModal(false)} className="absolute top-4 right-4 p-2 bg-secondary rounded-full hover:bg-accent transition-colors">
                                <X size={20} />
                            </button>
                            <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center text-yellow-500 mb-4">
                                <Moon size={32} />
                            </div>
                            <h2 className="text-2xl font-black uppercase tracking-tighter mb-1">{t.dndConfirmTitle}</h2>
                            <p className="text-sm text-muted-foreground mb-6">Faxinas de troca (check-out) nunca são suspensas.</p>
                            <div className="flex flex-col gap-3">
                                <button onClick={() => handleDnd(1)} className="w-full py-3 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500 hover:text-white font-bold uppercase rounded-2xl transition-all text-sm">
                                    {t.dndOption1h}
                                </button>
                                <button onClick={() => handleDnd(24)} className="w-full py-3 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500 hover:text-white font-bold uppercase rounded-2xl transition-all text-sm">
                                    {t.dndOption24h}
                                </button>
                                {hoursUntilCheckout >= 48 && (
                                    <button onClick={() => handleDnd(48)} className="w-full py-3 bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500 hover:text-white font-bold uppercase rounded-2xl transition-all text-sm">
                                        {t.dndOption48h}
                                    </button>
                                )}
                                <button onClick={() => setShowDndModal(false)} className="w-full py-3 bg-secondary text-muted-foreground hover:bg-accent font-bold uppercase rounded-2xl transition-all text-sm mt-1">
                                    {t.dndCancel}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Report Problem Modal */}
                {isReportOpen && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-card w-full max-w-sm rounded-3xl shadow-2xl relative border border-border animate-in slide-in-from-bottom-4 sm:zoom-in-95 overflow-hidden">
                            <header className="p-6 pb-4 flex items-center justify-between border-b border-border">
                                <div className="flex items-center gap-3">
                                    {reportStep !== 'type' && (
                                        <button onClick={() => setReportStep('type')} className="p-1.5 bg-secondary rounded-full hover:bg-accent transition-colors">
                                            <ArrowRight size={14} className="rotate-180" />
                                        </button>
                                    )}
                                    <div className="w-8 h-8 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                                        <Flag size={16} />
                                    </div>
                                    <h2 className="text-lg font-black uppercase tracking-tighter">{t.reportProblem}</h2>
                                </div>
                                <button onClick={() => setIsReportOpen(false)} className="p-2 bg-secondary rounded-full hover:bg-accent transition-colors">
                                    <X size={18} />
                                </button>
                            </header>

                            <div className="p-6 space-y-4">
                                {/* Step 1 — Type selection */}
                                {reportStep === 'type' && (
                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={() => setReportStep('cabin')}
                                            className="w-full py-4 bg-secondary hover:bg-primary hover:text-primary-foreground rounded-2xl font-bold text-sm uppercase tracking-wider transition-all flex items-center gap-3 px-4"
                                        >
                                            <Key size={18} className="shrink-0" /> {t.cabinIssue}
                                        </button>
                                        <button
                                            onClick={() => setReportStep('structure')}
                                            className="w-full py-4 bg-secondary hover:bg-primary hover:text-primary-foreground rounded-2xl font-bold text-sm uppercase tracking-wider transition-all flex items-center gap-3 px-4"
                                        >
                                            <BellRing size={18} className="shrink-0" /> {t.commonAreaIssue}
                                        </button>
                                        <button
                                            onClick={() => setReportStep('bug')}
                                            className="w-full py-4 bg-secondary hover:bg-primary hover:text-primary-foreground rounded-2xl font-bold text-sm uppercase tracking-wider transition-all flex items-center gap-3 px-4"
                                        >
                                            <AlertCircle size={18} className="shrink-0" /> {t.appBug}
                                        </button>
                                    </div>
                                )}

                                {/* Step 2a — Cabin issue */}
                                {reportStep === 'cabin' && (
                                    <div className="space-y-4">
                                        <textarea
                                            value={reportDescription}
                                            onChange={e => setReportDescription(e.target.value)}
                                            placeholder={t.describeIssue}
                                            rows={4}
                                            className="w-full bg-secondary border border-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:border-primary/50"
                                        />
                                        {dndEnabled && (
                                            <label className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-400/30 rounded-2xl cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={canEnterNow}
                                                    onChange={e => setCanEnterNow(e.target.checked)}
                                                    className="w-5 h-5 accent-yellow-500"
                                                />
                                                <span className="text-sm font-semibold text-yellow-700">{t.canEnterNow}</span>
                                            </label>
                                        )}
                                        <div className="h-40 border border-border bg-secondary rounded-2xl overflow-hidden overflow-hidden relative">
                                            <ImageUpload
                                                value={reportImageUrl}
                                                onUploadSuccess={(url) => setReportImageUrl(url)}
                                                stayId={stay.id}
                                                accessCode={stay.accessCode}
                                            />
                                            {!reportImageUrl && (
                                                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center opacity-50">
                                                    <span className="text-[10px] font-bold uppercase mt-2">Clique para anexar foto (opcional)</span>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={async () => {
                                                if (!reportDescription.trim()) return;
                                                setReportLoading(true);
                                                try {
                                                    const result = await reportCabinIssue(stay.id, stay.accessCode, reportDescription, canEnterNow, reportImageUrl);
                                                    if (result.success) {
                                                        toast.success(t.reportSent);
                                                        setIsReportOpen(false);
                                                        if (canEnterNow && dndEnabled) {
                                                            setDndEnabled(false);
                                                            setDndUntil(null);
                                                        }
                                                    } else {
                                                        toast.error(result.error || 'Erro ao enviar relatório.');
                                                    }
                                                } catch (e: any) { toast.error(e.message || 'Erro ao enviar relatório.'); }
                                                finally { setReportLoading(false); }
                                            }}
                                            disabled={reportLoading || !reportDescription.trim()}
                                            className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            {reportLoading ? <Loader2 size={18} className="animate-spin" /> : t.submitReport}
                                        </button>
                                    </div>
                                )}

                                {/* Step 2b — Structure issue */}
                                {reportStep === 'structure' && (
                                    <div className="space-y-4">
                                        <select
                                            value={reportStructureId}
                                            onChange={e => setReportStructureId(e.target.value)}
                                            className="w-full bg-secondary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary/50"
                                        >
                                            <option value="">{t.selectArea}</option>
                                            {structures.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                        <textarea
                                            value={reportDescription}
                                            onChange={e => setReportDescription(e.target.value)}
                                            placeholder={t.describeIssue}
                                            rows={4}
                                            className="w-full bg-secondary border border-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:border-primary/50"
                                        />
                                        <div className="h-40 border border-border bg-secondary rounded-2xl overflow-hidden overflow-hidden relative">
                                            <ImageUpload
                                                value={reportImageUrl}
                                                onUploadSuccess={(url) => setReportImageUrl(url)}
                                                stayId={stay.id}
                                                accessCode={stay.accessCode}
                                            />
                                            {!reportImageUrl && (
                                                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center opacity-50">
                                                    <span className="text-[10px] font-bold uppercase mt-2">Clique para anexar foto (opcional)</span>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={async () => {
                                                if (!reportDescription.trim() || !reportStructureId) return;
                                                setReportLoading(true);
                                                try {
                                                    const result = await reportStructureIssue(stay.id, stay.accessCode, reportStructureId, reportDescription, reportImageUrl);
                                                    if (result.success) {
                                                        toast.success(t.reportSent);
                                                        setIsReportOpen(false);
                                                    } else {
                                                        toast.error(result.error || 'Erro ao enviar relatório.');
                                                    }
                                                } catch (e: any) { toast.error(e.message || 'Erro ao enviar relatório.'); }
                                                finally { setReportLoading(false); }
                                            }}
                                            disabled={reportLoading || !reportDescription.trim() || !reportStructureId}
                                            className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            {reportLoading ? <Loader2 size={18} className="animate-spin" /> : t.submitReport}
                                        </button>
                                    </div>
                                )}

                                {/* Step 2c — App bug */}
                                {reportStep === 'bug' && (
                                    <div className="space-y-4">
                                        <textarea
                                            value={reportDescription}
                                            onChange={e => setReportDescription(e.target.value)}
                                            placeholder={t.describeIssue}
                                            rows={4}
                                            className="w-full bg-secondary border border-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:border-primary/50"
                                        />
                                        <div className="h-40 border border-border bg-secondary rounded-2xl overflow-hidden overflow-hidden relative">
                                            <ImageUpload
                                                value={reportImageUrl}
                                                onUploadSuccess={(url) => setReportImageUrl(url)}
                                                stayId={stay.id}
                                                accessCode={stay.accessCode}
                                            />
                                            {!reportImageUrl && (
                                                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center opacity-50">
                                                    <span className="text-[10px] font-bold uppercase mt-2">Screenshot do problema (opcional)</span>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={async () => {
                                                if (!reportDescription.trim()) return;
                                                setReportLoading(true);
                                                try {
                                                    const browserInfo = navigator.userAgent;
                                                    const result = await reportAppBug(stay.id, stay.accessCode, reportDescription, browserInfo, reportImageUrl);
                                                    if (result.success) {
                                                        toast.success(t.reportSent);
                                                        setIsReportOpen(false);
                                                    } else {
                                                        toast.error(result.error || 'Erro ao enviar relatório.');
                                                    }
                                                } catch (e: any) { toast.error(e.message || 'Erro ao enviar relatório.'); }
                                                finally { setReportLoading(false); }
                                            }}
                                            disabled={reportLoading || !reportDescription.trim()}
                                            className="w-full py-4 bg-primary text-primary-foreground font-black uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            {reportLoading ? <Loader2 size={18} className="animate-spin" /> : t.submitReport}
                                        </button>
                                    </div>
                                )}
                            </div>
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
