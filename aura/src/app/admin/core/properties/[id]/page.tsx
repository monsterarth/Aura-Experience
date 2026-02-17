"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PropertyService } from "@/services/property-service";
import { Property, PropertyTheme } from "@/types/aura";
import { 
  Save, ArrowLeft, Smartphone, Palette, 
  Type, Layout, Loader2, CheckCircle2 
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Função auxiliar para converter HEX -> HSL (Para o Preview funcionar com Tailwind)
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

export default function PropertySettingsPage() {
  const { id } = useParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [property, setProperty] = useState<Property | null>(null);

  // Estado local do Tema para edição em tempo real
  const [theme, setTheme] = useState<PropertyTheme | null>(null);

  useEffect(() => {
    loadProperty();
  }, [id]);

  async function loadProperty() {
    try {
        const data = await PropertyService.getPropertyById(id as string);
        if (!data) throw new Error("Propriedade não encontrada");
        setProperty(data);
        
        // Se já tiver tema, usa. Se não, usa um fallback básico para não quebrar.
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
        await PropertyService.updateProperty(property.id, {
            theme: theme
        });
        toast.success("Tema atualizado com sucesso!");
    } catch (error) {
        toast.error("Erro ao salvar alterações.");
    } finally {
        setSaving(false);
    }
  }

  // Atualiza uma cor específica no estado do tema
  const updateColor = (key: keyof PropertyTheme['colors'], value: string) => {
    if (!theme) return;
    setTheme({
        ...theme,
        colors: { ...theme.colors, [key]: value }
    });
  };

  // Gera o objeto de estilos CSS Variables para o PREVIEW
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
        '--muted': hexToHSL(c.secondary), // usando secondary como base para muted
        '--muted-foreground': hexToHSL(c.textMuted),
        '--accent': hexToHSL(c.accent),
        '--border': hexToHSL(c.accent),
        '--radius': theme.shape.radius
    } as React.CSSProperties;
  };

  if (loading) return <div className="flex justify-center p-24"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <ArrowLeft />
            </button>
            <div>
                <h1 className="text-3xl font-black tracking-tight">{property?.name}</h1>
                <p className="text-muted-foreground text-sm">Personalização Visual e Branding</p>
            </div>
        </div>
        <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all active:scale-95"
        >
            {saving ? <Loader2 className="animate-spin"/> : <Save size={18} />}
            Salvar Alterações
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* COLUNA ESQUERDA: EDITOR */}
        <div className="lg:col-span-7 space-y-8">
            
            {/* Seção de Cores da Marca */}
            <section className="bg-card border border-border p-6 rounded-2xl space-y-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <Palette className="text-primary" size={20}/> Cores da Marca
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ColorInput 
                        label="Cor Primária" 
                        desc="Botões principais, destaques e ícones ativos."
                        value={theme?.colors.primary} 
                        onChange={(v) => updateColor('primary', v)} 
                    />
                    <ColorInput 
                        label="Texto na Primária" 
                        desc="Cor do texto DENTRO do botão primário (Contraste)."
                        value={theme?.colors.onPrimary} 
                        onChange={(v) => updateColor('onPrimary', v)} 
                    />
                    <ColorInput 
                        label="Cor Secundária" 
                        desc="Elementos de apoio, fundos alternativos."
                        value={theme?.colors.secondary} 
                        onChange={(v) => updateColor('secondary', v)} 
                    />
                     <ColorInput 
                        label="Detalhes (Accent)" 
                        desc="Bordas sutis, linhas divisórias."
                        value={theme?.colors.accent} 
                        onChange={(v) => updateColor('accent', v)} 
                    />
                </div>
            </section>

            {/* Seção de Superfícies e Textos */}
            <section className="bg-card border border-border p-6 rounded-2xl space-y-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <Layout className="text-primary" size={20}/> Superfícies & Fundo
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ColorInput 
                        label="Background da Página" 
                        desc="A cor de fundo geral da aplicação."
                        value={theme?.colors.background} 
                        onChange={(v) => updateColor('background', v)} 
                    />
                    <ColorInput 
                        label="Superfície (Cards)" 
                        desc="Fundo de cartões, modais e painéis."
                        value={theme?.colors.surface} 
                        onChange={(v) => updateColor('surface', v)} 
                    />
                    <ColorInput 
                        label="Texto Principal" 
                        desc="Títulos e corpo de texto padrão."
                        value={theme?.colors.textMain} 
                        onChange={(v) => updateColor('textMain', v)} 
                    />
                    <ColorInput 
                        label="Texto Secundário" 
                        desc="Legendas e textos menos importantes."
                        value={theme?.colors.textMuted} 
                        onChange={(v) => updateColor('textMuted', v)} 
                    />
                </div>
            </section>

            {/* Seção de Forma e Tipografia */}
            <section className="bg-card border border-border p-6 rounded-2xl space-y-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <Type className="text-primary" size={20}/> Forma & Estilo
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-3">
                        <label className="text-sm font-bold uppercase text-muted-foreground">Arredondamento (Radius)</label>
                        <div className="flex gap-2">
                            {['0rem', '0.25rem', '0.5rem', '1rem', '9999px'].map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setTheme(prev => prev ? ({...prev, shape: {...prev.shape, radius: r as any}}) : null)}
                                    className={cn(
                                        "w-10 h-10 border border-border bg-card flex items-center justify-center transition-all",
                                        theme?.shape.radius === r ? "ring-2 ring-primary border-transparent" : "hover:bg-accent"
                                    )}
                                    style={{ borderRadius: r }}
                                >
                                </button>
                            ))}
                        </div>
                   </div>
                </div>
            </section>
        </div>

        {/* COLUNA DIREITA: PREVIEW INTERATIVO */}
        <div className="lg:col-span-5 relative">
            <div className="sticky top-8">
                <div className="flex items-center gap-2 mb-4 text-muted-foreground text-sm font-bold uppercase tracking-widest">
                    <Smartphone size={16}/> Live Preview
                </div>
                
                {/* O MOCKUP DO CELULAR */}
                <div 
                    className="mx-auto w-[340px] h-[700px] rounded-[3rem] border-[8px] border-[#1a1a1a] bg-background shadow-2xl overflow-hidden relative flex flex-col"
                    style={getPreviewStyles()} // AQUI A MÁGICA ACONTECE
                >
                    {/* Ilha dinâmica / Notch */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#1a1a1a] rounded-b-2xl z-50"></div>

                    {/* Header do App Mockado */}
                    <div className="pt-10 pb-4 px-6 flex justify-between items-center bg-background z-10">
                        <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-xs">A</div>
                        <div className="text-sm font-bold text-foreground opacity-80">{property?.name}</div>
                        <div className="w-8 h-8 rounded-full bg-secondary"></div>
                    </div>

                    {/* Conteúdo do App Mockado */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-background">
                        
                        <div className="space-y-2">
                            <h2 className="text-3xl font-black text-foreground leading-tight">Olá, Hóspede</h2>
                            <p className="text-muted-foreground text-sm">Bem-vindo à sua experiência.</p>
                        </div>

                        {/* Card Principal */}
                        <div className="bg-card p-6 rounded-lg shadow-sm border border-border space-y-4">
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
                            <button className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-lg text-xs uppercase tracking-widest hover:opacity-90">
                                Ver Detalhes
                            </button>
                        </div>

                         {/* Grid de Ações */}
                         <div className="grid grid-cols-2 gap-3">
                            <div className="bg-secondary p-4 rounded-lg flex flex-col items-center justify-center gap-2 text-center aspect-square">
                                <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-primary">
                                    <CheckCircle2 size={16}/>
                                </div>
                                <span className="text-xs font-bold text-secondary-foreground">Check-in</span>
                            </div>
                            <div className="bg-secondary p-4 rounded-lg flex flex-col items-center justify-center gap-2 text-center aspect-square opacity-50">
                                <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-muted-foreground">
                                    <Layout size={16}/>
                                </div>
                                <span className="text-xs font-bold text-muted-foreground">Serviços</span>
                            </div>
                         </div>
                    </div>

                    {/* Bottom Nav Mockado */}
                    <div className="p-4 bg-card border-t border-border flex justify-around items-center">
                        <div className="p-2 text-primary"><Layout size={20}/></div>
                        <div className="p-2 text-muted-foreground"><Layout size={20}/></div>
                        <div className="p-2 text-muted-foreground"><Layout size={20}/></div>
                    </div>

                </div>
            </div>
        </div>

      </div>
    </div>
  );
}

// Componente simples de input de cor
const ColorInput = ({ label, desc, value, onChange }: { label: string, desc: string, value?: string, onChange: (v: string) => void }) => (
    <div className="space-y-2">
        <div className="flex justify-between">
            <label className="text-sm font-bold text-foreground">{label}</label>
            <span className="text-xs font-mono text-muted-foreground">{value}</span>
        </div>
        <div className="flex gap-3">
            <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-border shadow-sm">
                <input 
                    type="color" 
                    value={value || '#000000'}
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute inset-0 w-[150%] h-[150%] -top-[25%] -left-[25%] cursor-pointer p-0 border-0"
                />
            </div>
            <div className="flex-1 space-y-1">
                <input 
                    type="text"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full p-2 bg-secondary border border-border rounded-md text-sm font-mono uppercase"
                    maxLength={7}
                />
                <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
            </div>
        </div>
    </div>
);