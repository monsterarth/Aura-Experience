// src/components/admin/Sidebar.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Loader2, ChevronLeft, ChevronRight, BellRing, Coffee,
  Ticket, CalendarDays, ShoppingBag, Package, UserSearch, ContactRound
} from "lucide-react";
import { createClientBrowser } from "@/lib/supabase-browser";
import Image from "next/image";
import { NotificationCenter } from "@/components/admin/NotificationCenter";
import { StaffEditModal } from "@/components/admin/StaffEditModal";
import { useNotifications } from "@/context/NotificationContext";

export const Sidebar = () => {
  const { userData, isSuperAdmin } = useAuth();
  const { currentProperty: property, setProperty } = useProperty();
  const { counts: notifCounts } = useNotifications();
  const pathname = usePathname();
  const [allProperties, setAllProperties] = useState<Property[]>([]);

  // Estado para controle do menu no mobile
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (label: string) => {
    setCollapsedSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

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
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erro ao sair", error);
    } finally {
      window.location.href = '/admin/login';
    }
  };

  // ==========================================
  // BLINDAGEM MOBILE-FIRST (Impede o Sidebar de existir para a operação de campo)
  // ==========================================
  const mobileOnlyRoles = ['maid', 'technician', 'waiter', 'porter', 'houseman'];
  if (userData?.role && mobileOnlyRoles.includes(userData.role)) {
    return null; // Retorna vazio. A tela ocupará 100% do espaço sem menu lateral.
  }

  // ==========================================
  // BLOCO 1: PAINÉIS (dashboards por papel)
  // ==========================================
  const paineisItems = [
    { title: "Painel Aura", icon: LayoutDashboard, href: "/admin/core/dashboard", roles: ["super_admin"] },
    { title: "Recepção", icon: BellRing, href: "/admin/reception", roles: ["super_admin", "admin", "reception"] },
  ];

  // ==========================================
  // BLOCO 2: HOSPEDAGEM (ciclo de vida do hóspede)
  // ==========================================
  const hospedagemItems = [
    { title: "Estadias", icon: Home, href: "/admin/stays", roles: ["super_admin", "admin", "reception", "governance"] },
    { title: "Mapa de Reservas", icon: Calendar, href: "/admin/reservation-map", roles: ["super_admin", "admin", "reception"] },
    { title: "Hóspedes", icon: UserSearch, href: "/admin/guests", roles: ["super_admin", "admin", "reception"] },
    { title: "Comunicação", icon: MessageSquare, href: "/admin/comunicacao", roles: ["super_admin", "admin", "reception"], badge: notifCounts.messages },
  ];

  // ==========================================
  // BLOCO 3: AGENDA (o que acontece na propriedade)
  // ==========================================
  const agendaItems = [
    { title: "Calendário", icon: CalendarDays, href: "/admin/calendario", roles: ["super_admin", "admin", "reception"] },
    { title: "Eventos", icon: Ticket, href: "/admin/eventos", roles: ["super_admin", "admin", "reception"] },
    { title: "Agenda Estrut.", icon: Calendar, href: "/admin/core/structures/bookings", roles: ["super_admin", "admin", "reception"] },
    { title: "Governança", icon: Sparkles, href: "/admin/governance", roles: ["super_admin", "admin", "governance"] },
    { title: "Kanban", icon: LayoutDashboard, href: "/admin/governance/kanban", roles: ["super_admin", "admin", "governance"] },
    { title: "Manutenção", icon: Wrench, href: "/admin/maintenance", roles: ["super_admin", "admin", "maintenance"] },
  ];

  // ==========================================
  // BLOCO 4: SERVIÇOS (experiência e consumo)
  // ==========================================
  const servicosItems = [
    { title: "Concierge", icon: ShoppingBag, href: "/admin/concierge", roles: ["super_admin", "admin", "reception"] },
    { title: "Gastronomia", icon: Coffee, href: "/admin/food-and-beverage/menu", roles: ["super_admin", "admin", "reception", "kitchen", "waiter"] },
    { title: "Café Salão", icon: Coffee, href: "/admin/cafe-salao", roles: ["super_admin", "admin", "reception", "kitchen", "waiter"] },
    { title: "Avaliações", icon: Star, href: "/admin/surveys/responses", roles: ["super_admin", "admin", "reception"] },
  ];

  // ==========================================
  // BLOCO 5: SETUP & CONFIGURAÇÕES
  // ==========================================
  const setupItems = [
    {
      title: "Configurações",
      icon: Settings,
      href: property ? `/admin/core/properties/${property.id}` : "#",
      roles: ["super_admin", "admin"],
      requireProperty: true
    },
    { title: "Logs de Auditoria", icon: FileText, href: "/admin/logs", roles: ["super_admin", "admin"] },
    { title: "Pesquisas (NPS)", icon: ClipboardList, href: "/admin/surveys", roles: ["super_admin", "admin"] },
    { title: "Automações", icon: Bot, href: "/admin/comunicacao/automations/settings", roles: ["super_admin", "admin"] },
    { title: "Templates Aura", icon: FileText, href: "/admin/core/templates", roles: ["super_admin"] },
    { title: "Cabanas", icon: Building, href: "/admin/cabins", roles: ["super_admin", "admin", "governance"] },
    { title: "Frigobar", icon: Coffee, href: "/admin/cabins/minibar", roles: ["super_admin", "admin"] },
    { title: "Estruturas", icon: Home, href: "/admin/core/structures", roles: ["super_admin", "admin"] },
    { title: "Catálogo Concierge", icon: Package, href: "/admin/core/concierge", roles: ["super_admin", "admin"] },
    { title: "Equipe", icon: Users, href: "/admin/staff", roles: ["super_admin", "admin"] },
    { title: "Propriedades", icon: Globe, href: "/admin/core/properties", roles: ["super_admin"] },
  ];

  const filterItems = (items: any[]) => items.filter(item => {
    if (!userData?.role) return false;
    if (item.requireProperty && !property) return false;
    if (userData.role === 'super_admin') return true;
    return item.roles.includes(userData.role);
  });

  const filteredPaineis = filterItems(paineisItems);
  const filteredHospedagem = filterItems(hospedagemItems);
  const filteredAgenda = filterItems(agendaItems);
  const filteredServicos = filterItems(servicosItems);
  const filteredSetup = filterItems(setupItems);

  const NavSection = ({ label, items, exactRoutes = [] }: { label: string; items: any[]; exactRoutes?: string[] }) => {
    if (items.length === 0) return null;
    const sectionCollapsed = !isCollapsed && !!collapsedSections[label];
    const hasActiveItem = items.some(item =>
      exactRoutes.includes(item.href) ? pathname === item.href : (pathname === item.href || pathname.startsWith(item.href))
    );
    return (
      <div className="space-y-1 mb-4">
        {isCollapsed ? (
          <div className="w-full h-px bg-white/5 my-4" />
        ) : (
          <button
            onClick={() => toggleSection(label)}
            className="w-full flex items-center justify-between px-4 py-1 group"
          >
            <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${hasActiveItem ? 'text-[#E0FFFF]/80' : 'text-white/40 group-hover:text-white/60'}`}>
              {label}
            </span>
            <ChevronDown
              size={12}
              className={`transition-transform text-foreground/30 group-hover:text-white/50 ${sectionCollapsed ? '-rotate-90' : ''}`}
            />
          </button>
        )}
        {!sectionCollapsed && items.map((item) => {
          const isActive = exactRoutes.includes(item.href) ? pathname === item.href : (pathname === item.href || pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.title : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl text-xs font-bold transition-all uppercase tracking-wide relative overflow-hidden group mb-1",
                isCollapsed ? "justify-center p-3.5" : "px-4 py-3.5",
                isActive
                  ? "text-white"
                  : "text-white/40 hover:text-white hover:bg-white/5"
              )}
            >
              {isActive && (
                 <>
                   <div className="absolute inset-0 bg-gradient-to-r from-[#E0FFFF]/10 to-transparent opacity-100" />
                   <div className="absolute inset-0 rounded-2xl border flex pointer-events-none" style={{ borderImage: "linear-gradient(to right, #B0E0E6, transparent) 1", WebkitMaskImage: 'linear-gradient(white, white)' }} />
                   <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#E0FFFF]/80 to-transparent shadow-[0_0_8px_#E0FFFF]" />
                   <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-[#E0FFFF]/80 to-transparent shadow-[0_0_8px_#E0FFFF]" />
                   <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-[#E0FFFF]/80 to-transparent shadow-[0_0_8px_#E0FFFF]" />
                 </>
              )}
              <item.icon size={18} className={cn("shrink-0 relative z-10 transition-colors", isActive ? "text-[#E0FFFF] drop-shadow-[0_0_8px_rgba(224,255,255,0.8)]" : "")} />
              {!isCollapsed && <span className="truncate relative z-10 flex-1">{item.title}</span>}
              {!isCollapsed && item.badge > 0 && (
                <span className="relative z-10 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none shrink-0">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
              {isCollapsed && item.badge > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* BOTÃO FLUTUANTE PARA ABRIR O MENU NO MOBILE */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 z-40 p-4 bg-[#00BFFF] text-white rounded-full shadow-[0_0_15px_rgba(0,191,255,0.5)] hover:scale-105 transition-transform"
      >
        <Menu size={24} />
      </button>

      {/* OVERLAY ESCURO NO MOBILE */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={cn(
        "fixed lg:static top-0 left-0 z-50 h-[100dvh] bg-[#0c0c0c] border-r border-[#333] flex flex-col p-4 pt-8 transition-all duration-300 shadow-2xl lg:shadow-none flex-shrink-0 lg:relative group/sidebar",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        isCollapsed ? "w-[88px]" : "w-[280px]"
      )}>

        {/* BOTÃO COLLAPSE NO DESKTOP */}
        <button
          onClick={() => { const next = !isCollapsed; setIsCollapsed(next); localStorage.setItem('sidebar_collapsed', String(next)); }}
          className="hidden lg:flex items-center justify-center absolute -right-3.5 top-8 z-50 w-7 h-7 bg-[#1c1c1c] border border-white/10 text-white/40 hover:text-white rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-colors"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* HEADER SIDEBAR (Dinâmico pela Propriedade) */}
        <div className={cn("mb-6 mt-2 flex items-center", isCollapsed ? "justify-center px-0" : "justify-between px-2")}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0 group">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#B0E0E6] via-[#E6E6FA] to-[#E0FFFF] blur-md opacity-20 group-hover:opacity-60 transition-opacity rounded-xl" />
              {property?.logoUrl ? (
                <div
                  className="relative w-9 h-9 rounded-lg overflow-hidden bg-[#111] border border-white/10 flex-shrink-0 z-10 shadow-inner"
                  title={isCollapsed ? property.name : undefined}
                >
                  <Image src={property.logoUrl} alt={property.name} fill className="object-cover" />
                </div>
              ) : property ? (
                <div
                  className="relative w-9 h-9 bg-[#111] text-[#E0FFFF] rounded-lg flex items-center justify-center font-black flex-shrink-0 border border-white/10 z-10 shadow-[0_0_10px_rgba(224,255,255,0.05)] text-sm"
                  title={isCollapsed ? property.name : undefined}
                >
                  {property.name.charAt(0).toUpperCase()}
                </div>
              ) : (
                <div
                  className="relative w-10 h-10 flex-shrink-0 z-10"
                  title={isCollapsed ? "Aura Engine" : undefined}
                >
                  <Image src="/logo_flat.png" alt="Aura Engine" fill className="object-contain" priority />
                </div>
              )}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-black text-[#E0FFFF] tracking-widest uppercase text-[14px] truncate drop-shadow-md">
                  {property ? property.name : "AURA"}
                </span>
                <span className="text-[9px] text-[#E6E6FA]/60 uppercase tracking-[0.3em] font-bold truncate">
                  Workspace
                </span>
              </div>
            )}
          </div>
          {/* Notificações + Fechar Mobile */}
          {!isCollapsed && (
            <div className="flex items-center gap-1 shrink-0">
              <div className="opacity-80 hover:opacity-100 transition-opacity">
                 <NotificationCenter />
              </div>
              <button onClick={() => setIsOpen(false)} className="lg:hidden p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl">
                <X size={20} />
              </button>
            </div>
          )}
        </div>

        {/* SELETOR GLOBAL - Apenas para Super Admin */}
        {isSuperAdmin && !isCollapsed && (
          <div className="mb-6 p-4 bg-[#141414] rounded-2xl border border-white/5 space-y-2 animate-in fade-in duration-300 shadow-inner relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-[#E0FFFF]/5 to-[#E6E6FA]/5 pointer-events-none opacity-50 relative z-0" />
            <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] px-1 relative z-10">Alternar Propriedade</label>
            <div className="relative z-10">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B0E0E6]" size={14} />
              <select
                value={property?.id || ""}
                onChange={(e) => {
                  const selected = allProperties.find(p => p.id === e.target.value);
                  setProperty(selected || null);
                }}
                className="w-full bg-[#111] border border-white/10 p-3 pl-10 rounded-xl text-[10px] font-bold text-white/90 outline-none appearance-none hover:border-[#E0FFFF]/30 transition-all cursor-pointer uppercase truncate pr-8"
              >
                <option value="">Selecionar...</option>
                {allProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" size={12} />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2 pb-4">
          <NavSection label="Painéis" items={filteredPaineis} exactRoutes={["/admin/core/dashboard", "/admin/reception"]} />
          <NavSection label="Hospedagem" items={filteredHospedagem} />
          <NavSection label="Agenda" items={filteredAgenda} exactRoutes={["/admin/governance"]} />
          <NavSection label="Serviços" items={filteredServicos} />
          <NavSection label="Setup" items={filteredSetup} exactRoutes={["/admin/core/properties"]} />
        </div>

        {/* FOOTER */}
        <div className="pt-4 border-t border-[#333] shrink-0 mt-auto">
          {isCollapsed ? (
             <div className="flex flex-col items-center gap-3 w-full pb-2">
               <button
                 onClick={() => setShowEditProfile(true)}
                 className="relative w-8 h-8 rounded-full bg-[#1c1c1c] border border-white/10 flex items-center justify-center hover:ring-2 hover:ring-[#E0FFFF]/50 transition-all font-bold text-[#E0FFFF] text-[10px]"
                 title="Editar Perfil"
               >
                 {userData?.profilePictureUrl ? (
                   <img src={userData.profilePictureUrl} alt="" className="w-full h-full rounded-full object-cover" />
                 ) : (
                   (userData?.fullName?.charAt(0) || "U")
                 )}
               </button>
               <button
                 onClick={handleLogout}
                 disabled={isLoggingOut}
                 title="Sair"
                 className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-white/5 transition-all"
               >
                 {isLoggingOut ? <Loader2 size={14} className="animate-spin text-red-500" /> : <LogOut size={16} />}
               </button>
             </div>
          ) : (
             <div className="flex items-center justify-between w-full">
               <div className="flex items-center gap-3 min-w-0 flex-1">
                 <button
                   onClick={() => setShowEditProfile(true)}
                   title="Editar Perfil"
                   className="relative w-9 h-9 rounded-full bg-[#1c1c1c] border border-white/10 flex items-center justify-center hover:ring-2 hover:ring-[#00BFFF]/50 transition-all shrink-0 font-bold text-[#E0FFFF] text-[11px]"
                 >
                   {userData?.profilePictureUrl ? (
                      <img src={userData.profilePictureUrl} alt="" className="w-full h-full rounded-full object-cover" />
                   ) : (
                      (userData?.fullName?.charAt(0) || "U")
                   )}
                 </button>
                 <div className="flex flex-col truncate pr-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setShowEditProfile(true)}>
                    <p className="text-white/90 text-[12px] font-bold truncate">Olá, {(userData?.fullName || "Usuário").split(' ')[0]}</p>
                    <p className="text-[#00BFFF] text-[9px] uppercase font-bold tracking-[0.1em] mt-0.5 truncate">{userData?.role?.replace('_', ' ') || "Staff"}</p>
                 </div>
               </div>

               <button
                 onClick={handleLogout}
                 disabled={isLoggingOut}
                 title="Sair do Sistema"
                 className="shrink-0 p-2 text-white/40 hover:text-red-400 hover:bg-white/5 rounded-xl transition-all disabled:opacity-50"
               >
                 {isLoggingOut ? <Loader2 size={18} className="animate-spin text-red-500" /> : <LogOut size={18} />}
               </button>
             </div>
          )}

          {!isCollapsed && (
            <div className="text-center pt-3 pb-1">
              <p className="text-[9px] text-[#E0FFFF]/20 font-bold tracking-[0.3em] uppercase truncate">
                Aura {appVersion} • {shortHash}
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* MODAL DE EDIÇÃO DE PERFIL */}
      {showEditProfile && userData && (
        <StaffEditModal
          staff={userData as any}
          onClose={() => setShowEditProfile(false)}
          onSave={() => {
            setShowEditProfile(false);
            window.location.reload();
          }}
        />
      )}

      {/* OVERLAY DE LOGOUT */}
      {isLoggingOut && (
        <div className="fixed inset-0 bg-[#0c0c0c]/90 backdrop-blur-md z-[100] flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-[#E0FFFF]/10 border-t-[#00BFFF] rounded-full animate-spin shadow-[0_0_30px_rgba(0,191,255,0.2)]" />
              <LogOut className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#E0FFFF] w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-white uppercase tracking-widest">Saindo do Aura</h3>
              <p className="text-xs text-[#00BFFF] tracking-wider uppercase">Fechando sessão segura...</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
