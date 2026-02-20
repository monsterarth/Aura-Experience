// src/app/admin/core/properties/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { PropertyService } from "@/services/property-service";
import { Property, PropertyTheme } from "@/types/aura";
import { Loader2, Plus, Building2, Palette, Settings2, Globe } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function CorePropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Form State - Agora usando HEX por padrão para facilitar a edição
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    primaryColor: "#D4A373", // Bege Dourado (Padrão Fazenda)
    secondaryColor: "#FAFAFA", // Off-white
    logoUrl: ""
  });

  useEffect(() => {
    loadProperties();
  }, []);

  async function loadProperties() {
    try {
      const data = await PropertyService.getAllProperties();
      setProperties(data);
    } catch (error) {
      toast.error("Erro ao carregar propriedades.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);

    // Montamos o tema padrão com as cores escolhidas
    const defaultTheme: PropertyTheme = {
        colors: {
            primary: formData.primaryColor,
            onPrimary: "#FFFFFF",
            secondary: formData.secondaryColor,
            onSecondary: "#1A1A1A",
            accent: "#CCD5AE",      // Verde suave padrão
            background: "#FEFAE0",  // Creme padrão
            surface: "#FFFFFF",
            textMain: "#283618",    // Verde escuro
            textMuted: "#606C38",
            success: "#2e7d32",
            error: "#d32f2f"
        },
        typography: {
            fontFamilyHeading: "Playfair Display",
            fontFamilyBody: "Inter",
            baseSize: 16
        },
        shape: {
            radius: "0.5rem"
        }
    };

    try {
      await PropertyService.createProperty({
        name: formData.name,
        slug: formData.slug,
        // Removemos primaryColor/secondaryColor da raiz e injetamos o theme
        theme: defaultTheme, 
        logoUrl: formData.logoUrl,
        settings: {
          hasBreakfast: true,
          hasKDS: false,
          whatsappEnabled: false
        }
      }, "super-admin-id", "Aura Core Admin");
      
      toast.success("Propriedade criada com sucesso!");
      // Reset form
      setFormData({ 
        name: "", 
        slug: "", 
        primaryColor: "#D4A373", 
        secondaryColor: "#FAFAFA", 
        logoUrl: "" 
      });
      loadProperties();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao criar propriedade. Verifique se o slug é único.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
            <Building2 className="text-primary" size={36} /> Aura Core
          </h1>
          <p className="text-muted-foreground">Gestão global de instâncias e multi-tenancy.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário de Criação */}
        <section className="bg-card border border-border p-6 rounded-2xl shadow-sm space-y-6">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Plus className="text-primary" /> Nova Propriedade
          </div>
          
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-muted-foreground">Nome da Propriedade</label>
              <input 
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Ex: Pousada Vale Verde"
                className="w-full p-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
                <Globe size={12}/> Slug (URL)
              </label>
              <input 
                required
                value={formData.slug}
                onChange={e => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                placeholder="ex: pousada-vale-verde"
                className="w-full p-2 bg-background border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
                  <Palette size={12}/> Primária (Hex)
                </label>
                <div className="flex gap-2">
                    <input 
                      type="color"
                      value={formData.primaryColor}
                      onChange={e => setFormData({...formData, primaryColor: e.target.value})}
                      className="h-9 w-9 cursor-pointer border rounded"
                    />
                    <input 
                      value={formData.primaryColor}
                      onChange={e => setFormData({...formData, primaryColor: e.target.value})}
                      className="w-full p-2 bg-background border rounded-lg text-xs uppercase"
                    />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
                  <Palette size={12}/> Secundária (Hex)
                </label>
                <div className="flex gap-2">
                    <input 
                      type="color"
                      value={formData.secondaryColor}
                      onChange={e => setFormData({...formData, secondaryColor: e.target.value})}
                      className="h-9 w-9 cursor-pointer border rounded"
                    />
                    <input 
                      value={formData.secondaryColor}
                      onChange={e => setFormData({...formData, secondaryColor: e.target.value})}
                      className="w-full p-2 bg-background border rounded-lg text-xs uppercase"
                    />
                </div>
              </div>
            </div>

            <button 
              disabled={isCreating}
              className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              {isCreating ? <Loader2 className="animate-spin" /> : "Criar Instância Aura"}
            </button>
          </form>
        </section>

        {/* Lista de Propriedades */}
        <section className="lg:col-span-2 space-y-4">
          <h2 className="font-bold text-xl flex items-center gap-2">
            <Settings2 size={20} /> Propriedades Ativas
          </h2>
          
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {properties.map(p => (
                <div key={p.id} className="group bg-card border border-border p-4 rounded-xl hover:border-primary/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-foreground font-bold shadow-sm"
                      style={{ backgroundColor: p.theme?.colors?.primary || '#000' }}
                    >
                      {p.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold leading-none">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">/{p.slug}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <a 
                      href={`/check-in/${p.slug}`}
                      target="_blank"
                      className="text-[10px] uppercase font-bold px-2 py-1 bg-muted rounded hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      Ver Check-in
                    </a>
<Link 
    href={`/admin/core/properties/${p.id}`} // Link para a nova página
    className="text-[10px] uppercase font-bold px-2 py-1 bg-muted rounded hover:bg-secondary-foreground hover:text-secondary transition-colors"
  >
    Configurações
  </Link>                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}