// src/components/admin/Sidebar.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useProperty } from "@/context/PropertyContext";
import { PropertyService } from "@/services/property-service";
import { Property } from "@/types/aura";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, Users, Home, Wrench, 
  Sparkles, Building, ChevronDown, LogOut,
  MessageSquare, Settings, Globe, Menu, X
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { deleteCookie } from "cookies-next";

export const Sidebar = () => {
  const router = useRouter();
  const { userData, isSuperAdmin } = useAuth();
  const { property, setProperty } = useProperty();
  const pathname = usePathname();
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  
  // Estado para controle do menu no mobile
  const [isOpen, setIsOpen] = useState(false);

  // Fecha o menu no mobile sempre que a rota mudar
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isSuperAdmin) {
      PropertyService.getAllProperties().then(setAllProperties);
    }
  }, [isSuperAdmin]);

  const handleLogout = async () => {
    try {
        await auth.signOut();
        deleteCookie('aura-session'); 
        router.push('/admin/login'); 
    } catch (error) {
        console.error("Erro ao sair", error);
    }
  };

  // ==========================================
  // BLINDAGEM MOBILE-FIRST (Impede o Sidebar de existir para a operação de campo)
  // ==========================================
  const mobileOnlyRoles = ['maid', 'technician', 'waiter', 'porter'];
  if (userData?.role && mobileOnlyRoles.includes(userData.role)) {
    return null; // Retorna vazio. A tela ocupará 100% do espaço sem menu lateral.
  }

  // ==========================================
  // BLOCO 1: OPERAÇÃO DIÁRIA
  // ==========================================
  const operacaoItems = [
    { title: "Dashboard", icon: LayoutDashboard, href: "/admin/core/dashboard", roles: ["super_admin"] },
{ title: "Estadias", icon: Home, href: "/admin/stays", roles: ["super_admin", "admin", "reception", "governance"] },    { title: "Comunicação", icon: MessageSquare, href: "/admin/comunicacao", roles: ["super_admin", "admin", "reception"] },
    { title: "Governança", icon: Sparkles, href: "/admin/governance", roles: ["super_admin", "admin", "governance"] },
    { title: "Manutenção", icon: Wrench, href: "/admin/maintenance", roles: ["super_admin", "admin", "maintenance"] },
  ];

  // ==========================================
  // BLOCO 2: SETUP & CONFIGURAÇÕES
  // ==========================================
  const setupItems = [
    { 
      title: "Configurações", 
      icon: Settings, 
      href: property ? `/admin/core/properties/${property.id}` : "#", 
      roles: ["super_admin", "admin"], 
      requireProperty: true 
    },
{ title: "Cabanas", icon: Building, href: "/admin/cabins", roles: ["super_admin", "admin", "governance"] },    { title: "Equipe", icon: Users, href: "/admin/staff", roles: ["super_admin", "admin"] },
    { title: "Propriedades", icon: Globe, href: "/admin/core/properties", roles: ["super_admin"] },
  ];

  const filterItems = (items: any[]) => items.filter(item => {
    if (!userData?.role) return false;
    if (item.requireProperty && !property) return false;
    if (userData.role === 'super_admin') return true;
    return item.roles.includes(userData.role);
  });

  const filteredOperacao = filterItems(operacaoItems);
  const filteredSetup = filterItems(setupItems);

  return (
    <>
      {/* BOTÃO FLUTUANTE PARA ABRIR O MENU NO MOBILE */}
      <button 
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 z-40 p-4 bg-primary text-primary-foreground rounded-full shadow-2xl hover:scale-105 transition-transform"
      >
        <Menu size={24} />
      </button>

      {/* OVERLAY ESCURO NO MOBILE */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={cn(
        "fixed lg:static top-0 left-0 z-50 h-[100dvh] w-72 bg-card border-r border-white/5 flex flex-col p-4 transition-transform duration-300 shadow-2xl lg:shadow-none",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        
        {/* HEADER SIDEBAR */}
        <div className="mb-8 px-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black text-black">A</div>
            <span className="font-bold text-foreground tracking-tight">Aura Engine</span>
          </div>
          {/* BOTÃO FECHAR NO MOBILE */}
          <button onClick={() => setIsOpen(false)} className="lg:hidden p-2 text-muted-foreground hover:bg-secondary rounded-xl">
            <X size={20}/>
          </button>
        </div>

        {/* SELETOR GLOBAL - Apenas para Super Admin */}
        {isSuperAdmin && (
          <div className="mb-6 p-3 bg-white/5 rounded-2xl border border-white/5 space-y-2">
            <label className="text-[9px] font-black text-foreground/40 uppercase tracking-widest px-1">Foco da Instância</label>
            <div className="relative group">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" size={14} />
              <select 
                value={property?.id || ""}
                onChange={(e) => {
                  const selected = allProperties.find(p => p.id === e.target.value);
                  setProperty(selected || null);
                }}
                className="w-full bg-secondary border border-white/10 p-2.5 pl-9 rounded-xl text-[10px] font-bold text-foreground outline-none appearance-none hover:border-primary/50 transition-all cursor-pointer uppercase"
              >
                <option value="">Selecionar...</option>
                {allProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/20" size={12} />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* BLOCO: OPERAÇÃO */}
          {filteredOperacao.length > 0 && (
            <div className="space-y-1 mb-8">
              <p className="px-4 text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-2">Operação</p>
              {filteredOperacao.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wide",
                    pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/admin/core/dashboard")
                      ? "bg-primary text-black shadow-[0_0_20px_rgba(var(--primary),0.3)]" 
                      : "text-foreground/40 hover:text-foreground hover:bg-white/5"
                  )}
                >
                  <item.icon size={18} />
                  {item.title}
                </Link>
              ))}
            </div>
          )}

          {/* BLOCO: SETUP */}
          {filteredSetup.length > 0 && (
            <div className="space-y-1 pb-4">
              <p className="px-4 text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-2">Setup</p>
              {filteredSetup.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wide",
                    pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/admin/core/properties")
                      ? "bg-primary text-black shadow-[0_0_20px_rgba(var(--primary),0.3)]" 
                      : "text-foreground/40 hover:text-foreground hover:bg-white/5"
                  )}
                >
                  <item.icon size={18} />
                  {item.title}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="pt-4 border-t border-white/5 mt-4 shrink-0">
          {property && !isSuperAdmin && (
              <div className="mb-4 px-2">
                  <p className="text-[9px] font-bold text-foreground/20 uppercase">Propriedade</p>
                  <p className="text-xs font-bold text-foreground">{property.name}</p>
              </div>
          )}

          <button 
              onClick={handleLogout} 
              className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-xs font-bold text-destructive hover:bg-destructive/10 uppercase tracking-wide transition-all"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>
    </>
  );
};