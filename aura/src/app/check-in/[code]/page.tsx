"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { StayService } from "@/services/stay-service";
import { SurveyService } from "@/services/survey-service";
import { PropertyService } from "@/services/property-service";
import { Stay, Property } from "@/types/aura";
import { Loader2, CheckCircle, FileText, Share, AlertCircle, Phone, Star, ArrowRight } from "lucide-react";
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


function GuestHubContent() {
    const { code } = useParams();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

                setStays(stays as Stay[]);
                const firstStay = stays[0] as Stay;
                setStay(firstStay);

                const prop = await PropertyService.getPropertyById(firstStay.propertyId);
                setProperty(prop as Property);

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

        // DASHBOARD DO HOSPEDE (ainda não existe, renderizar mock / placeholder)
        return (
            <div className="min-h-screen bg-background text-foreground flex flex-col p-6 items-center" style={themeStyles}>
                {/* Falso Dashboard Skeleton / Placeholder Premium */}
                <div className="w-full max-w-md space-y-6 mt-8 animate-in slide-in-from-bottom-6 duration-700">

                    {/* Saudação */}
                    <div className="flex items-center gap-4 bg-card border border-border p-6 rounded-3xl shadow-sm">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary text-xl font-black uppercase">
                            {(property?.name?.charAt(0) || "A")}
                        </div>
                        <div>
                            <p className="text-muted-foreground text-sm font-semibold uppercase tracking-widest">Bem-vindo(a)</p>
                            <h1 className="text-2xl font-black text-foreground">{property?.name || "Acomodação"}</h1>
                        </div>
                    </div>

                    {/* Estado da Reserva */}
                    <div className="bg-primary text-primary-foreground rounded-3xl p-6 shadow-xl shadow-primary/20 relative overflow-hidden">
                        {/* Efeitos Decorativos */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>

                        <div className="relative z-10">
                            <p className="opacity-80 text-sm font-semibold uppercase tracking-wider mb-2">Hospedagem Ativa</p>
                            <p className="text-3xl font-black tracking-tighter">Cabana {property?.name ? "01" : ""}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button className="bg-secondary p-6 rounded-3xl border border-border flex flex-col items-center justify-center gap-3 hover:bg-accent transition-colors">
                            <Share className="text-primary w-8 h-8" />
                            <p className="font-black uppercase tracking-tight text-sm text-foreground">Compartilhar Wi-Fi</p>
                        </button>
                        <button onClick={() => window.open(`https://wa.me/${property?.settings?.whatsappNumber?.replace(/\D/g, '') || ''}`, '_blank')} className="bg-secondary p-6 rounded-3xl border border-border flex flex-col items-center justify-center gap-3 hover:bg-accent transition-colors">
                            <Phone className="text-primary w-8 h-8" />
                            <p className="font-black uppercase tracking-tight text-sm text-foreground">Falar com Recepção</p>
                        </button>
                    </div>

                    <div className="p-8 border-2 border-dashed border-border rounded-3xl text-center flex flex-col items-center justify-center space-y-3 opacity-60">
                        <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-2">
                            <AlertCircle className="text-muted-foreground w-6 h-6" />
                        </div>
                        <p className="font-black text-lg text-foreground uppercase tracking-tight">Em Construção</p>
                        <p className="text-sm text-muted-foreground">O painel completo com pedidos de serviço, consumo e mais estará disponível em breve.</p>
                    </div>

                </div>
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
