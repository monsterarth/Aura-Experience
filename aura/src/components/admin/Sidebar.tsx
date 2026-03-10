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
  MessageSquare, Settings, Globe, Menu, X,
  Star, ClipboardList, Calendar, Bot, FileText,
  Loader2, ChevronLeft, ChevronRight, BellRing, Coffee
} from "lucide-react";
import { createClientBrowser } from "@/lib/supabase-browser";
import Image from "next/image";

export const Sidebar = () => {
  const router = useRouter();
  const { userData, isSuperAdmin } = useAuth();
  const { currentProperty: property, setProperty } = useProperty();
  const pathname = usePathname();
  const [allProperties, setAllProperties] = useState<Property[]>([]);

  // Estado para controle do menu no mobile
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Variáveis da Vercel para o rodapé de versão
  const commitHash = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev";
  const shortHash = commitHash.substring(0, 7);
  const appVersion = "v0";

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
    setIsLoggingOut(true);
    try {
      const supabase = createClientBrowser();
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
      await Promise.race([supabase.auth.signOut(), timeout]);
    } catch (error) {
      console.error("Erro ao sair", error);
    } finally {
      window.location.href = '/admin/login';
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
    { title: "Painel Aura", icon: LayoutDashboard, href: "/admin/core/dashboard", roles: ["super_admin"] },
    { title: "Recepção", icon: BellRing, href: "/admin/reception", roles: ["super_admin", "admin", "reception"] },
    { title: "Estadias", icon: Home, href: "/admin/stays", roles: ["super_admin", "admin", "reception", "governance"] },
    { title: "Mapa de Reservas", icon: Calendar, href: "/admin/reservation-map", roles: ["super_admin", "admin", "reception"] },
    { title: "Comunicação", icon: MessageSquare, href: "/admin/comunicacao", roles: ["super_admin", "admin", "reception"] },
    { title: "Governança", icon: Sparkles, href: "/admin/governance", roles: ["super_admin", "admin", "governance"] },
    { title: "Agenda Estrut.", icon: Calendar, href: "/admin/core/structures/bookings", roles: ["super_admin", "admin", "reception"] },
    { title: "Manutenção", icon: Wrench, href: "/admin/maintenance", roles: ["super_admin", "admin", "maintenance"] },
    { title: "Gastronomia", icon: Coffee, href: "/admin/food-and-beverage/menu", roles: ["super_admin", "admin", "reception", "kitchen", "waiter"] },
    { title: "Avaliações", icon: Star, href: "/admin/surveys/responses", roles: ["super_admin", "admin", "reception"] },
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
    { title: "Pesquisas (NPS)", icon: ClipboardList, href: "/admin/surveys", roles: ["super_admin", "admin"] },
    { title: "Automações", icon: Bot, href: "/admin/comunicacao/automations/settings", roles: ["super_admin", "admin"] },
    { title: "Templates Aura", icon: FileText, href: "/admin/core/templates", roles: ["super_admin"] },
    { title: "Cabanas", icon: Building, href: "/admin/cabins", roles: ["super_admin", "admin", "governance"] },
    { title: "Estruturas", icon: Home, href: "/admin/core/structures", roles: ["super_admin", "admin"] },
    { title: "Equipe", icon: Users, href: "/admin/staff", roles: ["super_admin", "admin"] },
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
        "fixed lg:static top-0 left-0 z-50 h-[100dvh] bg-card border-r border-white/5 flex flex-col p-4 transition-all duration-300 shadow-2xl lg:shadow-none flex-shrink-0 lg:relative group/sidebar",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        isCollapsed ? "w-[88px]" : "w-72"
      )}>

        {/* BOTÃO COLLAPSE NO DESKTOP */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex items-center justify-center absolute -right-3.5 top-8 z-50 w-7 h-7 bg-card border border-white/10 text-muted-foreground hover:text-primary rounded-full shadow-md transition-colors"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* HEADER SIDEBAR (Dinâmico pela Propriedade) */}
        <div className={cn("mb-8 flex items-center", isCollapsed ? "justify-center px-0" : "justify-between px-2")}>
          <div className="flex items-center gap-3 min-w-0">
            {property?.logoUrl ? (
              <div
                className="relative w-10 h-10 rounded-lg overflow-hidden bg-white/5 border border-white/10 flex-shrink-0"
                title={isCollapsed ? property.name : undefined}
              >
                <Image src={property.logoUrl} alt={property.name} fill className="object-cover" />
              </div>
            ) : (
              <div
                className="w-10 h-10 bg-primary/20 text-primary rounded-lg flex items-center justify-center font-black flex-shrink-0 border border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                title={isCollapsed ? (property ? property.name : "Aura Engine") : undefined}
              >
                {property ? property.name.charAt(0).toUpperCase() : "A"}
              </div>
            )}
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-foreground tracking-tight truncate text-sm">
                  {property ? property.name : "Aura Engine"}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold truncate">
                  Workspace
                </span>
              </div>
            )}
          </div>
          {/* BOTÃO FECHAR NO MOBILE */}
          <button onClick={() => setIsOpen(false)} className="lg:hidden p-2 text-muted-foreground hover:bg-secondary rounded-xl flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* SELETOR GLOBAL - Apenas para Super Admin */}
        {isSuperAdmin && !isCollapsed && (
          <div className="mb-6 p-3 bg-white/5 rounded-2xl border border-white/5 space-y-2 animate-in fade-in duration-300">
            <label className="text-[9px] font-black text-foreground/40 uppercase tracking-widest px-1">Alternar Propriedade</label>
            <div className="relative group">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" size={14} />
              <select
                value={property?.id || ""}
                onChange={(e) => {
                  const selected = allProperties.find(p => p.id === e.target.value);
                  setProperty(selected || null);
                }}
                className="w-full bg-secondary border border-white/10 p-2.5 pl-9 rounded-xl text-[10px] font-bold text-foreground outline-none appearance-none hover:border-primary/50 transition-all cursor-pointer uppercase truncate pr-8"
              >
                <option value="">Selecionar...</option>
                {allProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/20 pointer-events-none" size={12} />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
          {/* BLOCO: OPERAÇÃO */}
          {filteredOperacao.length > 0 && (
            <div className="space-y-1 mb-8">
              {isCollapsed ? (
                <div className="w-full h-px bg-white/5 my-4" />
              ) : (
                <p className="px-4 text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-2">Operação</p>
              )}
              {filteredOperacao.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  title={isCollapsed ? item.title : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl text-xs font-bold transition-all uppercase tracking-wide",
                    isCollapsed ? "justify-center p-3.5" : "px-4 py-3.5",
                    pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/admin/core/dashboard")
                      ? "bg-primary text-black shadow-[0_0_20px_rgba(var(--primary),0.3)]"
                      : "text-foreground/40 hover:text-foreground hover:bg-white/5"
                  )}
                >
                  <item.icon size={18} className="shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.title}</span>}
                </Link>
              ))}
            </div>
          )}

          {/* BLOCO: SETUP */}
          {filteredSetup.length > 0 && (
            <div className="space-y-1 pb-4">
              {isCollapsed ? (
                <div className="w-full h-px bg-white/5 my-4" />
              ) : (
                <p className="px-4 text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-2">Setup</p>
              )}
              {filteredSetup.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  title={isCollapsed ? item.title : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl text-xs font-bold transition-all uppercase tracking-wide",
                    isCollapsed ? "justify-center p-3.5" : "px-4 py-3.5",
                    pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/admin/core/properties")
                      ? "bg-primary text-black shadow-[0_0_20px_rgba(var(--primary),0.3)]"
                      : "text-foreground/40 hover:text-foreground hover:bg-white/5"
                  )}
                >
                  <item.icon size={18} className="shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.title}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="pt-4 border-t border-white/5 mt-4 shrink-0 flex flex-col gap-2">
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            title={isCollapsed ? "Sair" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl text-xs font-bold text-destructive hover:bg-destructive/10 uppercase tracking-wide transition-all disabled:opacity-50",
              isCollapsed ? "justify-center p-3.5" : "px-4 py-3 w-full"
            )}
          >
            {isLoggingOut ? (
              <Loader2 className="w-[18px] h-[18px] animate-spin shrink-0" />
            ) : (
              <LogOut size={18} className="shrink-0" />
            )}
            {!isCollapsed && <span className="truncate">{isLoggingOut ? "Encerrando..." : "Sair"}</span>}
          </button>

          {!isCollapsed && (
            <div className="text-center pt-2">
              <p className="text-[9px] text-foreground/30 font-mono tracking-widest uppercase truncate">
                Aura {appVersion} • {shortHash}
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* OVERLAY DE LOGOUT */}
      {isLoggingOut && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <LogOut className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-foreground">Saindo do Aura...</h3>
              <p className="text-sm text-muted-foreground">Limpando sua sessão com segurança</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
