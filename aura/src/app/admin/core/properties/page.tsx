// src/app/admin/core/properties/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { PropertyService } from "@/services/property-service";
import { Property } from "@/types/aura";
import { Loader2, Plus, Building2, Palette, Settings2, Globe } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function CorePropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    primaryColor: "221.2 83.2% 53.3%",
    secondaryColor: "24.6 95% 53.1%",
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
    try {
      await PropertyService.createProperty({
        name: formData.name,
        slug: formData.slug,
        primaryColor: formData.primaryColor,
        secondaryColor: formData.secondaryColor,
        logoUrl: formData.logoUrl,
        settings: {
          hasBreakfast: true,
          hasKDS: false,
          whatsappEnabled: false
        }
      }, "super-admin-id", "Aura Core Admin");
      
      toast.success("Propriedade criada com sucesso!");
      setFormData({ name: "", slug: "", primaryColor: "221.2 83.2% 53.3%", secondaryColor: "24.6 95% 53.1%", logoUrl: "" });
      loadProperties();
    } catch (error) {
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
                  <Palette size={12}/> Primária (HSL)
                </label>
                <input 
                  value={formData.primaryColor}
                  onChange={e => setFormData({...formData, primaryColor: e.target.value})}
                  className="w-full p-2 bg-background border rounded-lg text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1">
                  <Palette size={12}/> Secundária
                </label>
                <input 
                  value={formData.secondaryColor}
                  onChange={e => setFormData({...formData, secondaryColor: e.target.value})}
                  className="w-full p-2 bg-background border rounded-lg text-xs"
                />
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
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: `hsl(${p.primaryColor})` }}
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
                    <button className="text-[10px] uppercase font-bold px-2 py-1 bg-muted rounded">Configurações</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}