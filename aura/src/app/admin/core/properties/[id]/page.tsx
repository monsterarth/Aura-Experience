// src/app/admin/core/properties/[id]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PropertyService } from "@/services/property-service";
import { Property, PropertyTheme } from "@/types/aura";
import {
    Save, ArrowLeft, Smartphone, Palette,
    Type, Layout, Loader2, Clock, MessageSquare,
    Phone, ShieldCheck, Coffee, Sparkles, Wrench, FileText, Image as ImageIcon,
    CheckCircle2, Globe, AlertTriangle, Trash2, RefreshCcw, Database
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

// Função auxiliar para converter HEX -> HSL (Para o Preview)
function hexToHSL(hex: string): string {
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    r /= 255; g /= 255; b /= 255;
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

type TabType = 'visual' | 'operational' | 'policies' | 'danger';
type MultiLangObj = { pt: string, en: string, es: string };

// Helper para converter strings antigas do banco em objetos Multilíngues
function parseMultiLang(val: any, fallbackObj: MultiLangObj): MultiLangObj {
    if (!val) return fallbackObj;
    if (typeof val === 'string') return { pt: val, en: "", es: "" };
    return {
        pt: val.pt || fallbackObj.pt,
        en: val.en || fallbackObj.en,
        es: val.es || fallbackObj.es
    };
}

export default function PropertySettingsPage() {
    const { id } = useParams();
    const router = useRouter();
    const { isSuperAdmin, userData } = useAuth();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('visual');

    // Danger Zone States
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmName, setDeleteConfirmName] = useState("");
    const [purgeTargets, setPurgeTargets] = useState<string[]>([]);

    const [property, setProperty] = useState<Property | null>(null);
    const [theme, setTheme] = useState<PropertyTheme | null>(null);

    // Informações Básicas da Marca
    const [basicInfo, setBasicInfo] = useState({
        name: "",
        slogan: "",
        logoUrl: ""
    });

    // Configurações Operacionais & Políticas (Agora preparadas para Multi-idioma)
    const [settings, setSettings] = useState({
        whatsappNumber: "",
        checkInTime: "14:00",
        checkOutTime: "12:00",
        receptionStartTime: "08:00",
        receptionEndTime: "20:00",
        govStartTime: "08:00",
        govEndTime: "16:00",
        maintenanceStartTime: "08:00",
        maintenanceEndTime: "17:00",
        breakfastModality: "buffet",
        buffetStartTime: "07:30",
        buffetEndTime: "10:30",
        deliveryStartTime: "07:00",
        deliveryEndTime: "11:00",

        // Mensagens Check-in (Multilíngue)
        earlyCheckInMessage: {
            pt: "Prezado(a) Hospede. Vimos que sua chegada está prevista para [expectedArrivalTime]. Por padrão nosso check in é sempre a partir das [checkintime], porém fazemos sempre o possível para liberar a sua acomodação antecipadamente. Para garantir um Early Check in entre em contato com a recepção.",
            en: "Dear Guest. We noticed your arrival is scheduled for [expectedArrivalTime]. Standard check-in starts at [checkintime]. Please contact the reception to arrange an early check-in.",
            es: "Estimado huésped. Vemos que su llegada está prevista para las [expectedArrivalTime]. El check-in estándar comienza a las [checkintime]. Contacte a la recepción para coordinar un early check-in."
        },
        lateCheckInMessage: {
            pt: "Prezado(a) Hospede. Vimos que sua chegada está prevista para [expectedArrivalTime]. O horário de funcionamento da recepção encerra as [receptionendtime], mas não se preocupe.\nNossa guarita funciona 24 horas e um de nossos porteiros estará a disposição para recebê-los acompanhá-los até a sua acomodação. Avise a recepção caso necessite de arranjos especiais.",
            en: "Dear Guest. Your arrival is scheduled for [expectedArrivalTime]. The reception closes at [receptionendtime], but our security gate is open 24/7. Let the reception know if you need special arrangements.",
            es: "Estimado huésped. Su llegada está prevista para las [expectedArrivalTime]. La recepción cierra a las [receptionendtime], pero nuestra portería funciona 24h. Avise a la recepción si requiere arreglos especiales."
        },
        petPolicyAlert: {
            pt: "A pousada é Pet Friendly e teremos o maior prazer em receber seu pet! Porém temos algumas regrinhas que devem ser respeitadas. Aceitamos pets de micro e pequeno porte até 15kg (um por cabana). Para aceitarmos é necessário ler e concordar com a nossa Política Pet.",
            en: "We are Pet Friendly! However, we have rules. We accept small pets up to 15kg (one per cabin). You must read and agree to our Pet Policy.",
            es: "¡Somos Pet Friendly! Sin embargo, tenemos reglas. Aceptamos mascotas pequeñas de hasta 15kg (una por cabaña). Es necesario leer y aceptar nuestra Política de Mascotas."
        },

        // Políticas Completas (Multilíngue)
        petPolicyText: {
            pt: "1. O tutor é inteiramente responsável pelo comportamento do animal.\n2. O animal não deve circular nas áreas de piscina e restaurante.\n3. É obrigatória a apresentação da carteira de vacinação atualizada no check-in.",
            en: "1. The owner is fully responsible for the animal's behavior.\n2. The animal is not allowed in pool and restaurant areas.\n3. An updated vaccination card must be presented at check-in.",
            es: "1. El tutor es enteramente responsable del comportamiento del animal.\n2. El animal no debe circular en zonas de piscina y restaurante.\n3. Es obligatorio presentar la cartilla de vacunación actualizada al hacer el check-in."
        },
        privacyPolicyText: {
            pt: "Sua privacidade é importante para nós. Coletamos seus dados exclusivamente para o cumprimento da FNRH (Ficha Nacional de Registro de Hóspedes) exigida pelo Ministério do Turismo, e para melhorar sua experiência conosco.",
            en: "Your privacy is important to us. We collect your data exclusively to comply with the National Guest Registration Form (FNRH) required by the Ministry of Tourism, and to improve your experience.",
            es: "Su privacidad es importante para nosotros. Recopilamos sus datos exclusivamente para cumplir con la Ficha Nacional de Registro de Huéspedes (FNRH) exigida por el Ministerio de Turismo."
        },
        generalPolicyText: {
            pt: "Bem-vindo à nossa propriedade. Solicitamos respeito aos horários de silêncio (22h às 08h) e cuidado com os itens da cabana. Danos ao patrimônio estarão sujeitos a cobranças e multas aplicáveis.",
            en: "Welcome to our property. We kindly ask you to respect quiet hours (10 PM to 8 AM) and take care of cabin items. Damages are subject to charges.",
            es: "Bienvenido a nuestra propiedad. Solicitamos respetar el horario de silencio (22h a 08h) y cuidar los artículos de la cabaña. Los daños estarán sujetos a cargos."
        }
    });

    useEffect(() => {
        loadProperty();
    }, [id]);

    async function loadProperty() {
        try {
            const data = await PropertyService.getPropertyById(id as string);
            if (!data) throw new Error("Propriedade não encontrada");
            setProperty(data);

            // Uso de (data as any) para contornar TS strict em campos novos como slogan
            setBasicInfo({
                name: data.name || "",
                slogan: (data as any).slogan || "",
                logoUrl: data.logoUrl || ""
            });

            setTheme(data.theme || {
                colors: {
                    primary: "#000000", onPrimary: "#ffffff",
                    secondary: "#f4f4f5", onSecondary: "#09090b",
                    background: "#ffffff", surface: "#ffffff",
                    textMain: "#09090b", textMuted: "#71717a",
                    accent: "#f4f4f5", success: "#22c55e", error: "#ef4444"
                },
                shape: { radius: "0.5rem" },
                typography: { fontFamilyHeading: "Inter", fontFamilyBody: "Inter", baseSize: 16 }
            });

            // Carrega settings garantindo backward compatibility com strings antigas
            if (data.settings) {
                const s = data.settings as any;
                setSettings(prev => ({
                    ...prev,
                    ...s,
                    earlyCheckInMessage: parseMultiLang(s.earlyCheckInMessage, prev.earlyCheckInMessage),
                    lateCheckInMessage: parseMultiLang(s.lateCheckInMessage, prev.lateCheckInMessage),
                    petPolicyAlert: parseMultiLang(s.petPolicyAlert, prev.petPolicyAlert),
                    petPolicyText: parseMultiLang(s.petPolicyText, prev.petPolicyText),
                    privacyPolicyText: parseMultiLang(s.privacyPolicyText, prev.privacyPolicyText),
                    generalPolicyText: parseMultiLang(s.generalPolicyText, prev.generalPolicyText)
                }));
            }

        } catch (error) {
            toast.error("Erro ao carregar propriedade");
            router.push("/admin/core/properties");
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        if (!property || !theme) return;
        setSaving(true);
        try {
            // Usa (as any) para aceitar os campos extras mesclados com o settings original
            const updatedPayload: any = {
                name: basicInfo.name,
                slogan: basicInfo.slogan,
                logoUrl: basicInfo.logoUrl,
                theme: theme,
                settings: {
                    ...property.settings,
                    ...settings
                }
            };

            await PropertyService.updateProperty(property.id, updatedPayload);
            toast.success("Configurações atualizadas com sucesso!");
        } catch (error) {
            toast.error("Erro ao salvar alterações.");
        } finally {
            setSaving(false);
        }
    }

    // --- DANGER ZONE ACTIONS ---
    async function handlePurge() {
        if (purgeTargets.length === 0) {
            toast.error("Selecione pelo menos um tipo de dado para limpar.");
            return;
        }
        const confirmMsg = `Tem certeza que deseja apagar os dados selecionados? Esta ação é irreversível.`;
        if (!window.confirm(confirmMsg)) return;

        setSaving(true);
        try {
            const res = await fetch(`/api/admin/properties/${id}/manage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actorId: userData?.id,
                    actorName: userData?.fullName,
                    action: 'purge',
                    targets: purgeTargets
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            toast.success("Dados limpos com sucesso!");
            setPurgeTargets([]);
        } catch (err: any) {
            toast.error(err.message || "Erro ao limpar dados");
        } finally {
            setSaving(false);
        }
    }

    async function handleResetDefaults() {
        if (!window.confirm("Isso apagará todas as automações, checklists e templates atuais desta propriedade e irá clonar os dados da SYSTEM_DEFAULTS. Tem certeza?")) return;

        setSaving(true);
        try {
            const res = await fetch(`/api/admin/properties/${id}/manage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actorId: userData?.id,
                    actorName: userData?.fullName,
                    action: 'reset_defaults'
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            toast.success("Padrões Aura restaurados com sucesso!");
        } catch (err: any) {
            toast.error(err.message || "Erro ao restaurar padrões");
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteProperty() {
        if (deleteConfirmName !== basicInfo.name) {
            toast.error("O nome digitado não confere.");
            return;
        }
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/admin/properties/${id}/manage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actorId: userData?.id,
                    actorName: userData?.fullName,
                    action: 'delete_property'
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            toast.success("Propriedade apagada sumariamente.");
            router.push('/admin/core/properties');
        } catch (err: any) {
            toast.error(err.message || "Erro ao apagar");
            setIsDeleting(false);
            setShowDeleteModal(false);
        }
    }

    const togglePurgeTarget = (target: string) => {
        setPurgeTargets(prev =>
            prev.includes(target) ? prev.filter(t => t !== target) : [...prev, target]
        );
    };

    const updateColor = (key: keyof PropertyTheme['colors'], value: string) => {
        if (!theme) return;
        setTheme({
            ...theme,
            colors: { ...theme.colors, [key]: value }
        });
    };

    const getPreviewStyles = () => {
        if (!theme) return {};
        const c = theme.colors;
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
            '--radius': theme.shape.radius
        } as React.CSSProperties;
    };

    if (loading) return <div className="flex justify-center p-24"><Loader2 className="animate-spin text-primary" size={40} /></div>;

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8 min-h-screen">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-3 bg-secondary text-muted-foreground hover:text-foreground rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                            {basicInfo.name || property?.name}
                        </h1>
                        <p className="text-muted-foreground text-sm font-medium mt-1">Gerencie a identidade, regras e políticas globais.</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    Salvar Alterações
                </button>
            </header>

            {/* Navegação por Abas */}
            <div className="flex border-b border-border gap-8 overflow-x-auto custom-scrollbar">
                <button
                    onClick={() => setActiveTab('visual')}
                    className={cn("pb-4 font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all border-b-2 whitespace-nowrap", activeTab === 'visual' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
                >
                    <Palette size={16} /> Branding & Visual
                </button>
                <button
                    onClick={() => setActiveTab('operational')}
                    className={cn("pb-4 font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all border-b-2 whitespace-nowrap", activeTab === 'operational' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
                >
                    <Clock size={16} /> Operacional & Horários
                </button>
                <button
                    onClick={() => setActiveTab('policies')}
                    className={cn("pb-4 font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all border-b-2 whitespace-nowrap", activeTab === 'policies' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
                >
                    <ShieldCheck size={16} /> Políticas & Termos
                </button>
                {isSuperAdmin && (
                    <button
                        onClick={() => setActiveTab('danger')}
                        className={cn("pb-4 font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all border-b-2 whitespace-nowrap", activeTab === 'danger' ? "border-red-500 text-red-500" : "border-transparent text-red-500/50 hover:text-red-500")}
                    >
                        <AlertTriangle size={16} /> Danger Zone
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

                {/* COLUNA ESQUERDA: EDITOR */}
                <div className="lg:col-span-7 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">

                    {activeTab === 'visual' && (
                        <>
                            <section className="bg-card border border-border p-8 rounded-[32px] space-y-6">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <ImageIcon className="text-primary" size={20} /> Identidade da Marca
                                </h3>

                                <div className="grid grid-cols-1 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Nome da Propriedade</label>
                                        <input
                                            value={basicInfo.name}
                                            onChange={e => setBasicInfo({ ...basicInfo, name: e.target.value })}
                                            className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Slogan / Frase de Efeito</label>
                                        <input
                                            value={basicInfo.slogan}
                                            onChange={e => setBasicInfo({ ...basicInfo, slogan: e.target.value })}
                                            placeholder="Sua experiência em contato com a natureza..."
                                            className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">URL da Logo (PNG, SVG, JPG)</label>
                                        <input
                                            value={basicInfo.logoUrl}
                                            onChange={e => setBasicInfo({ ...basicInfo, logoUrl: e.target.value })}
                                            placeholder="https://..."
                                            className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground font-mono text-sm"
                                        />
                                    </div>
                                </div>
                            </section>

                            <section className="bg-card border border-border p-8 rounded-[32px] space-y-6">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <Palette className="text-primary" size={20} /> Cores do Sistema
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <ColorInput label="Cor Primária" desc="Botões principais, destaques e ícones." value={theme?.colors.primary} onChange={(v) => updateColor('primary', v)} />
                                    <ColorInput label="Texto na Primária" desc="Cor do texto DENTRO do botão primário." value={theme?.colors.onPrimary} onChange={(v) => updateColor('onPrimary', v)} />
                                    <ColorInput label="Cor Secundária" desc="Elementos de apoio, fundos alternativos." value={theme?.colors.secondary} onChange={(v) => updateColor('secondary', v)} />
                                    <ColorInput label="Detalhes (Accent)" desc="Bordas sutis, linhas divisórias." value={theme?.colors.accent} onChange={(v) => updateColor('accent', v)} />
                                </div>
                            </section>

                            <section className="bg-card border border-border p-8 rounded-[32px] space-y-6">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <Layout className="text-primary" size={20} /> Superfícies & Fundo
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <ColorInput label="Background da Página" desc="A cor de fundo geral da aplicação." value={theme?.colors.background} onChange={(v) => updateColor('background', v)} />
                                    <ColorInput label="Superfície (Cards)" desc="Fundo de cartões, modais e painéis." value={theme?.colors.surface} onChange={(v) => updateColor('surface', v)} />
                                    <ColorInput label="Texto Principal" desc="Títulos e corpo de texto padrão." value={theme?.colors.textMain} onChange={(v) => updateColor('textMain', v)} />
                                    <ColorInput label="Texto Secundário" desc="Legendas e textos menos importantes." value={theme?.colors.textMuted} onChange={(v) => updateColor('textMuted', v)} />
                                </div>
                            </section>

                            <section className="bg-card border border-border p-8 rounded-[32px] space-y-6">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <Type className="text-primary" size={20} /> Forma & Estilo
                                </h3>
                                <div className="space-y-3">
                                    <label className="text-sm font-bold uppercase text-muted-foreground tracking-widest">Arredondamento (Radius)</label>
                                    <div className="flex gap-3">
                                        {['0rem', '0.25rem', '0.5rem', '1rem', '9999px'].map((r) => (
                                            <button
                                                key={r} type="button"
                                                onClick={() => setTheme(prev => prev ? ({ ...prev, shape: { ...prev.shape, radius: r as any } }) : null)}
                                                className={cn(
                                                    "w-12 h-12 border border-border bg-background flex items-center justify-center transition-all",
                                                    theme?.shape.radius === r ? "ring-2 ring-primary ring-offset-2 ring-offset-card border-transparent bg-primary/10" : "hover:bg-accent"
                                                )}
                                                style={{ borderRadius: r }}
                                            >
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </>
                    )}

                    {activeTab === 'operational' && (
                        <>
                            {/* Contato Principal */}
                            <section className="bg-card border border-border p-8 rounded-[32px] space-y-6">
                                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                                    <Phone size={20} /> Contato Principal
                                </h3>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">WhatsApp da Recepção (DDI+DDD+Número)</label>
                                    <input
                                        value={settings.whatsappNumber}
                                        onChange={e => setSettings({ ...settings, whatsappNumber: e.target.value })}
                                        placeholder="5548999999999"
                                        className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground"
                                    />
                                    <p className="text-xs text-muted-foreground">Usado para direcionar o hóspede após o check-in.</p>
                                </div>
                            </section>

                            {/* Horários: Hospedagem */}
                            <section className="bg-card border border-border p-8 rounded-[32px] space-y-6">
                                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                                    <Clock size={20} /> Recepção & Check-in
                                </h3>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Início do Check-in</label>
                                        <input type="time" value={settings.checkInTime} onChange={e => setSettings({ ...settings, checkInTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Limite do Check-out</label>
                                        <input type="time" value={settings.checkOutTime} onChange={e => setSettings({ ...settings, checkOutTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Abertura da Recepção</label>
                                        <input type="time" value={settings.receptionStartTime} onChange={e => setSettings({ ...settings, receptionStartTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Fechamento da Recepção</label>
                                        <input type="time" value={settings.receptionEndTime} onChange={e => setSettings({ ...settings, receptionEndTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                    </div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-border">
                                    <MultiLangTextarea
                                        label="Aviso de Early Check-in (Chegada Antecipada)"
                                        desc="Exibido quando o hóspede insere um horário anterior ao Início do Check-in. Variáveis: [expectedArrivalTime], [checkintime]"
                                        value={settings.earlyCheckInMessage}
                                        onChange={(val: any) => setSettings({ ...settings, earlyCheckInMessage: val })}
                                    />

                                    <div className="pt-2 border-t border-border"></div>

                                    <MultiLangTextarea
                                        label="Aviso de Late Check-in (Recepção Fechada)"
                                        desc="Exibido quando o hóspede insere um horário após o Fechamento da Recepção. Variáveis: [expectedArrivalTime], [receptionendtime]"
                                        value={settings.lateCheckInMessage}
                                        onChange={(val: any) => setSettings({ ...settings, lateCheckInMessage: val })}
                                    />

                                    <div className="pt-2 border-t border-border"></div>

                                    <MultiLangTextarea
                                        label="Aviso Resumido: Pet Friendly (Alert no Check-in)"
                                        desc="Um aviso curto para quando a pessoa marca a checkbox do Pet na ficha."
                                        rows={2}
                                        value={settings.petPolicyAlert}
                                        onChange={(val: any) => setSettings({ ...settings, petPolicyAlert: val })}
                                    />
                                </div>
                            </section>

                            {/* Horários: Café da Manhã */}
                            <section className="bg-card border border-border p-8 rounded-[32px] space-y-6">
                                <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                                    <Coffee size={20} /> Café da Manhã
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Modalidade Padrão</label>
                                        <select
                                            value={settings.breakfastModality}
                                            onChange={e => setSettings({ ...settings, breakfastModality: e.target.value })}
                                            className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground appearance-none"
                                        >
                                            <option value="buffet">Buffet Livre (Presencial)</option>
                                            <option value="delivery">Delivery (Na Cabana)</option>
                                        </select>
                                        <p className="text-xs text-muted-foreground">Esta opção define o que o hóspede visualiza primeiro no portal.</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Início do Buffet</label>
                                            <input type="time" value={settings.buffetStartTime} onChange={e => setSettings({ ...settings, buffetStartTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Fim do Buffet</label>
                                            <input type="time" value={settings.buffetEndTime} onChange={e => setSettings({ ...settings, buffetEndTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Início Pedidos Delivery</label>
                                            <input type="time" value={settings.deliveryStartTime} onChange={e => setSettings({ ...settings, deliveryStartTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Fim Pedidos Delivery</label>
                                            <input type="time" value={settings.deliveryEndTime} onChange={e => setSettings({ ...settings, deliveryEndTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Horários: Governança e Manutenção */}
                            <section className="bg-card border border-border p-8 rounded-[32px] space-y-6">
                                <div className="flex flex-col md:flex-row gap-8">
                                    <div className="flex-1 space-y-4">
                                        <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                                            <Sparkles size={20} /> Governança
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Início do Turno</label>
                                                <input type="time" value={settings.govStartTime} onChange={e => setSettings({ ...settings, govStartTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Fim do Turno</label>
                                                <input type="time" value={settings.govEndTime} onChange={e => setSettings({ ...settings, govEndTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 space-y-4">
                                        <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                                            <Wrench size={20} /> Manutenção
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Início do Turno</label>
                                                <input type="time" value={settings.maintenanceStartTime} onChange={e => setSettings({ ...settings, maintenanceStartTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Fim do Turno</label>
                                                <input type="time" value={settings.maintenanceEndTime} onChange={e => setSettings({ ...settings, maintenanceEndTime: e.target.value })} className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground [color-scheme:light] dark:[color-scheme:dark]" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </>
                    )}

                    {activeTab === 'policies' && (
                        <section className="bg-card border border-border p-8 rounded-[32px] space-y-8 animate-in fade-in">
                            <h3 className="font-bold text-lg flex items-center gap-2 text-primary">
                                <FileText size={20} /> Documentos & Termos Completos
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                Os textos aqui definidos exigirão o consentimento (&quot;Li e Concordo&quot;) obrigatório do hóspede antes de finalizar o check-in.
                            </p>

                            <MultiLangTextarea
                                label="Política Geral da Propriedade"
                                desc="Regras de silêncio, uso da piscina, horários, multas, etc."
                                rows={6}
                                value={settings.generalPolicyText}
                                onChange={(val: any) => setSettings({ ...settings, generalPolicyText: val })}
                            />

                            <div className="pt-2 border-t border-border"></div>

                            <MultiLangTextarea
                                label="Política de Privacidade (LGPD)"
                                desc="Termo legal de como os dados são manipulados para a FNRH."
                                rows={6}
                                value={settings.privacyPolicyText}
                                onChange={(val: any) => setSettings({ ...settings, privacyPolicyText: val })}
                            />

                            <div className="pt-2 border-t border-border"></div>

                            <MultiLangTextarea
                                label="Política Pet Completa"
                                desc="Termo completo com obrigações do dono, vacinação, circulação na pousada."
                                rows={6}
                                value={settings.petPolicyText}
                                onChange={(val: any) => setSettings({ ...settings, petPolicyText: val })}
                            />

                        </section>
                    )}

                    {activeTab === 'danger' && isSuperAdmin && (
                        <div className="space-y-8 animate-in fade-in">

                            {/* RESTAURAR PADRÕES */}
                            <section className="bg-orange-500/10 border border-orange-500/20 p-8 rounded-[32px] space-y-4">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-orange-500/20 rounded-xl text-orange-600 shrink-0">
                                        <RefreshCcw size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-orange-600">Restaurar Padrões Aura Engine</h3>
                                        <p className="text-sm text-orange-600/80 mt-1">
                                            Esta ação apagará todas as <b>Automações</b>, <b>Templates de Mensagem</b> e <b>Checklists</b> atuais desta propriedade, substituindo-os pelos modelos originais pré-aprovados pela matriz do Aura Experience.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-end pt-4">
                                    <button
                                        onClick={handleResetDefaults}
                                        disabled={saving}
                                        className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold tracking-wider uppercase text-xs rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <RefreshCcw size={16} /> Sobrescrever e Restaurar Padrões
                                    </button>
                                </div>
                            </section>

                            {/* PURGE SELECTIVO */}
                            <section className="bg-red-500/5 border border-red-500/10 p-8 rounded-[32px] space-y-6">
                                <div className="flex items-start gap-4 mb-4">
                                    <div className="p-3 bg-red-500/10 rounded-xl text-red-500 shrink-0">
                                        <Database size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-red-500">Limpeza Parcial em Massa (Purge)</h3>
                                        <p className="text-sm text-red-500/80 mt-1">
                                            Selecione módulos operacionais para limpar. <b>Atenção:</b> Isso apagará permanentemente os registros da categoria selecionada (ex: se escolher Estadias, apagará todas do banco de dados).
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {[
                                        { id: 'stays', label: 'Estadias' },
                                        { id: 'guests', label: 'Hóspedes' },
                                        { id: 'messages', label: 'Histórico de Mensagens' },
                                        { id: 'housekeeping_tasks', label: 'Tarefas de Faxina' },
                                        { id: 'maintenance_tasks', label: 'Tickets de Manutenção' },
                                        { id: 'survey_responses', label: 'Avaliações Respondidas' },
                                        { id: 'structure_bookings', label: 'Agendamentos de Estruturas' },
                                        { id: 'structures', label: 'Estruturas Cadastradas' },
                                        { id: 'cabins', label: 'Cabanas Cadastradas' }
                                    ].map(item => (
                                        <label key={item.id} className="flex items-center gap-3 p-4 bg-background border border-border rounded-xl cursor-pointer hover:border-red-500/30 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={purgeTargets.includes(item.id)}
                                                onChange={() => togglePurgeTarget(item.id)}
                                                className="w-5 h-5 accent-red-500 cursor-pointer"
                                            />
                                            <span className="text-sm font-bold text-foreground">{item.label}</span>
                                        </label>
                                    ))}
                                </div>

                                <div className="flex justify-end pt-4 border-t border-red-500/10 mt-6">
                                    <button
                                        onClick={handlePurge}
                                        disabled={saving || purgeTargets.length === 0}
                                        className="px-6 py-3 bg-red-500/20 hover:bg-red-500 hover:text-white text-red-500 font-bold tracking-wider uppercase text-xs rounded-xl transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Trash2 size={16} /> Limpar Dados Selecionados (Purge)
                                    </button>
                                </div>
                            </section>

                            {/* DELETAR PROPRIEDADE */}
                            <section className="bg-red-600/10 border-2 border-red-600/30 p-8 rounded-[32px] space-y-4">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-red-600 text-white rounded-xl shadow-lg shrink-0">
                                        <AlertTriangle size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-xl text-red-600">Excluir Workspace (Propriedade)</h3>
                                        <p className="text-sm text-red-600/80 mt-1 font-medium">
                                            Esta é uma ação destrutiva de nível máximo. Apagará o Workspace desta pousada inteira, deslogará toda a equipe vinculada a ela, e apagará tudo em cascata. Não poderá ser desfeito.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-end pt-4">
                                    <button
                                        onClick={() => setShowDeleteModal(true)}
                                        className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-black tracking-widest uppercase text-sm rounded-xl shadow-xl shadow-red-600/20 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <Trash2 size={18} /> Excluir Propriedade Definitivamente
                                    </button>
                                </div>
                            </section>

                        </div>
                    )}
                </div>

                {/* COLUNA DIREITA: PREVIEW INTERATIVO (Fixa) */}
                <div className="lg:col-span-5 relative hidden lg:block">
                    <div className="sticky top-8">
                        <div className="flex items-center gap-2 mb-6 text-muted-foreground text-sm font-bold uppercase tracking-widest">
                            <Smartphone size={16} /> {activeTab === 'visual' ? 'Live Preview (Visual)' : 'Visão do Hóspede (Simulação PT)'}
                        </div>

                        {/* O MOCKUP DO CELULAR */}
                        <div
                            className="mx-auto w-[340px] h-[700px] rounded-[3rem] border-[8px] border-[#1a1a1a] bg-background shadow-2xl overflow-hidden relative flex flex-col transition-all duration-500"
                            style={getPreviewStyles()}
                        >
                            {/* Ilha dinâmica / Notch */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#1a1a1a] rounded-b-2xl z-50"></div>

                            <div className="pt-10 pb-4 px-6 flex justify-between items-center bg-background z-10 border-b border-border/50">
                                {basicInfo.logoUrl ? (
                                    <img src={basicInfo.logoUrl} alt="Logo" className="h-8 object-contain" />
                                ) : (
                                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-xs">
                                        {basicInfo.name.charAt(0) || "A"}
                                    </div>
                                )}
                                <div className="w-8 h-8 rounded-full bg-secondary"></div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-background custom-scrollbar">

                                {activeTab === 'visual' && (
                                    <div className="animate-in fade-in">
                                        <div className="space-y-2 mb-6">
                                            <h2 className="text-3xl font-black text-foreground leading-tight">{basicInfo.name || 'Nome da Propriedade'}</h2>
                                            <p className="text-muted-foreground text-sm">{basicInfo.slogan || 'Slogan ou frase de efeito.'}</p>
                                        </div>

                                        <div className="bg-card p-6 border border-border space-y-4 shadow-sm mb-6" style={{ borderRadius: theme?.shape.radius }}>
                                            <div className="flex justify-between items-start">
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Sua Cabana</p>
                                                    <h3 className="text-xl font-bold text-card-foreground">Bangalô 01</h3>
                                                </div>
                                                <div className="px-2 py-1 bg-secondary rounded text-[10px] font-bold text-secondary-foreground">ATIVO</div>
                                            </div>
                                            <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                                                <div className="h-full w-2/3 bg-primary"></div>
                                            </div>
                                            <button className="w-full py-3 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest hover:opacity-90" style={{ borderRadius: `calc(${theme?.shape.radius} - 4px)` }}>
                                                Ver Detalhes
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-secondary p-4 flex flex-col items-center justify-center gap-2 text-center aspect-square" style={{ borderRadius: theme?.shape.radius }}>
                                                <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-primary shadow-sm"><CheckCircle2 size={16} /></div>
                                                <span className="text-xs font-bold text-secondary-foreground">Check-in</span>
                                            </div>
                                            <div className="bg-secondary p-4 flex flex-col items-center justify-center gap-2 text-center aspect-square opacity-50" style={{ borderRadius: theme?.shape.radius }}>
                                                <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-muted-foreground shadow-sm"><Layout size={16} /></div>
                                                <span className="text-xs font-bold text-muted-foreground">Serviços</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'operational' && (
                                    <div className="space-y-6 animate-in fade-in">
                                        <div className="space-y-2">
                                            <h2 className="text-xl font-black text-foreground">Regras Operacionais</h2>
                                        </div>

                                        <div className="bg-orange-500/10 border border-orange-500/20 p-4 space-y-3" style={{ borderRadius: theme?.shape.radius }}>
                                            <div className="flex items-center gap-2 text-orange-600 font-bold text-sm">
                                                <Clock size={16} /> Aviso de Horário
                                            </div>
                                            <p className="text-xs text-orange-600/90 leading-relaxed font-medium">
                                                {settings.lateCheckInMessage?.pt?.replace(/\[expectedArrivalTime\]/g, '22:00').replace(/\[receptionendtime\]/g, settings.receptionEndTime) || "Preencha o campo à esquerda para visualizar."}
                                            </p>
                                        </div>

                                        <div className="bg-card border border-border p-4 space-y-3 shadow-sm" style={{ borderRadius: theme?.shape.radius }}>
                                            <div className="flex items-center gap-2 text-primary font-bold text-sm">
                                                <Coffee size={16} /> Horário do Café
                                            </div>
                                            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                                                {settings.breakfastModality === 'buffet'
                                                    ? `O buffet é servido das ${settings.buffetStartTime} às ${settings.buffetEndTime}.`
                                                    : `Os pedidos na cabana podem ser feitos das ${settings.deliveryStartTime} às ${settings.deliveryEndTime}.`
                                                }
                                            </p>
                                        </div>

                                        <div className="bg-secondary border border-border p-4 space-y-3" style={{ borderRadius: theme?.shape.radius }}>
                                            <div className="flex items-center gap-2 text-primary font-bold text-sm">
                                                <ImageIcon size={16} /> Pet Friendly (Alerta)
                                            </div>
                                            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                                                {settings.petPolicyAlert?.pt || "Preencha o campo à esquerda."}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'policies' && (
                                    <div className="space-y-4 animate-in fade-in">
                                        <h2 className="text-xl font-black text-foreground mb-4">Políticas (Aceite)</h2>

                                        <div className="p-4 bg-card border border-border space-y-2" style={{ borderRadius: theme?.shape.radius }}>
                                            <h4 className="text-xs font-bold uppercase text-primary flex items-center gap-2"><ShieldCheck size={14} /> Geral</h4>
                                            <p className="text-[10px] text-muted-foreground line-clamp-3">{settings.generalPolicyText?.pt || "Pendente..."}</p>
                                            <button className="text-[10px] text-primary font-bold uppercase mt-2">Ler Mais</button>
                                        </div>

                                        <div className="p-4 bg-card border border-border space-y-2" style={{ borderRadius: theme?.shape.radius }}>
                                            <h4 className="text-xs font-bold uppercase text-primary flex items-center gap-2"><FileText size={14} /> Privacidade</h4>
                                            <p className="text-[10px] text-muted-foreground line-clamp-3">{settings.privacyPolicyText?.pt || "Pendente..."}</p>
                                            <button className="text-[10px] text-primary font-bold uppercase mt-2">Ler Mais</button>
                                        </div>

                                        <div className="p-4 bg-card border border-border space-y-2" style={{ borderRadius: theme?.shape.radius }}>
                                            <h4 className="text-xs font-bold uppercase text-primary flex items-center gap-2"><ImageIcon size={14} /> Política Pet</h4>
                                            <p className="text-[10px] text-muted-foreground line-clamp-3">{settings.petPolicyText?.pt || "Pendente..."}</p>
                                            <button className="text-[10px] text-primary font-bold uppercase mt-2">Ler Mais</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Bottom Nav Mockado */}
                            <div className="p-4 bg-card border-t border-border flex justify-around items-center z-10">
                                <div className="p-2 text-primary"><Layout size={20} /></div>
                                <div className="p-2 text-muted-foreground"><Layout size={20} /></div>
                                <div className="p-2 text-muted-foreground"><Layout size={20} /></div>
                            </div>

                        </div>
                    </div>
                </div>

            </div>

            {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                    <div className="bg-zinc-950 border border-red-500/30 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col scale-in-center">
                        <div className="p-6 bg-red-500/10 border-b border-red-500/20 flex flex-col items-center justify-center text-center gap-3">
                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 mb-2">
                                <AlertTriangle size={32} />
                            </div>
                            <h2 className="text-xl font-black text-red-500 uppercase tracking-widest">Aviso Crítico</h2>
                            <p className="text-sm text-red-400 font-medium">Você está prestes a excluir este Workspace por completo.</p>
                        </div>

                        <div className="p-6 space-y-6">
                            <p className="text-sm text-muted-foreground text-center">
                                Para confirmar a exclusão permanente de <b>{basicInfo.name}</b>, digite o nome exato da propriedade abaixo:
                            </p>
                            <input
                                type="text"
                                placeholder={basicInfo.name}
                                value={deleteConfirmName}
                                onChange={(e) => setDeleteConfirmName(e.target.value)}
                                className="w-full bg-background border border-red-500/30 p-4 rounded-xl outline-none focus:border-red-500 text-center font-black text-foreground"
                            />

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => { setShowDeleteModal(false); setDeleteConfirmName(""); }}
                                    disabled={isDeleting}
                                    className="flex-1 py-3 text-muted-foreground font-bold hover:bg-white/5 rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDeleteProperty}
                                    disabled={isDeleting || deleteConfirmName !== basicInfo.name}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                    Confirmar Exclusão
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

// Componente simples de input de cor
const ColorInput = ({ label, desc, value, onChange }: { label: string, desc: string, value?: string, onChange: (v: string) => void }) => (
    <div className="space-y-2">
        <div className="flex justify-between items-end">
            <label className="text-sm font-bold text-foreground">{label}</label>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{value}</span>
        </div>
        <div className="flex gap-4 items-center">
            <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden border-2 border-border shadow-inner">
                <input
                    type="color"
                    value={value || '#000000'}
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute inset-0 w-[150%] h-[150%] -top-[25%] -left-[25%] cursor-pointer p-0 border-0"
                />
            </div>
            <div className="flex-1">
                <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
            </div>
        </div>
    </div>
);

// Novo Componente para Input de Texto Multi-idioma
const MultiLangTextarea = ({ label, desc, value, onChange, rows = 3 }: { label: string, desc?: string, value: MultiLangObj, onChange: (v: MultiLangObj) => void, rows?: number }) => {
    const [lang, setLang] = useState<'pt' | 'en' | 'es'>('pt');

    return (
        <div className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
                <div className="flex-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1.5"><Globe size={12} /> {label}</label>
                    {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
                </div>
                <div className="flex bg-background rounded-lg p-1 border border-border shadow-sm shrink-0">
                    {(['pt', 'en', 'es'] as const).map(l => (
                        <button
                            key={l}
                            type="button"
                            onClick={() => setLang(l)}
                            className={cn(
                                "px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all",
                                lang === l ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </div>
            <textarea
                value={value?.[lang] || ""}
                onChange={e => onChange({ ...value, [lang]: e.target.value })}
                rows={rows}
                placeholder={`Digite o texto em ${lang.toUpperCase()}...`}
                className="w-full bg-background border border-border p-4 rounded-xl outline-none focus:border-primary/50 text-foreground text-sm resize-none custom-scrollbar"
            />
        </div>
    );
};