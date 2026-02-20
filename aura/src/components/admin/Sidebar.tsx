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
  Sparkles, Building, ChevronDown, LogOut 
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { deleteCookie } from "cookies-next";

export const Sidebar = () => {
  const router = useRouter();
  const { userData, isSuperAdmin } = useAuth();
  const { property, setProperty } = useProperty();
  const pathname = usePathname();
  const [allProperties, setAllProperties] = useState<Property[]>([]);

  useEffect(() => {
    if (isSuperAdmin) {
      PropertyService.getAllProperties().then(setAllProperties);
    }
  }, [isSuperAdmin]);

  const handleLogout = async () => {
    try {
        await auth.signOut();
        deleteCookie('aura-session'); // Remove o cookie do middleware
        router.push('/admin/login'); // Força o redirect
    } catch (error) {
        console.error("Erro ao sair", error);
    }
  };

  const menuItems = [
    { title: "Dashboard", icon: LayoutDashboard, href: "/admin/core/dashboard", roles: ["super_admin"] },
    { title: "Painel Operacional", icon: Home, href: "/admin/stays", roles: ["super_admin", "admin", "reception"] },
    { title: "Cabanas", icon: Building, href: "/admin/cabins", roles: ["super_admin", "admin"] },
    { title: "Manutenção", icon: Wrench, href: "/admin/maintenance", roles: ["super_admin", "admin", "maintenance"] },
    { title: "Governança", icon: Sparkles, href: "/admin/governance", roles: ["super_admin", "admin", "governance"] },
    { title: "Equipe", icon: Users, href: "/admin/staff", roles: ["super_admin", "admin"] },
    { title: "Propriedades", icon: Building, href: "/admin/core/properties", roles: ["super_admin"] },
  ];

  // Filtra itens baseados na role E se o item é permitido (alguns menus só aparecem se tiver propriedade selecionada)
  const filteredItems = menuItems.filter(item => {
    if (!userData?.role) return false;
    // Se for Super Admin, mostra tudo
    if (userData.role === 'super_admin') return true;
    // Se for outro cargo, verifica array de roles
    return item.roles.includes(userData.role);
  });

  return (
    <aside className="w-64 min-h-screen bg-card border-r border-white/5 flex flex-col p-4 animate-in slide-in-from-left duration-300">
      
      {/* HEADER SIDEBAR */}
      <div className="mb-8 px-2 flex items-center gap-2">
         <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-black text-black">A</div>
         <span className="font-bold text-foreground tracking-tight">Aura Engine</span>
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

      {/* MENU ITENS */}
      <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
        {filteredItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wide",
              pathname === item.href 
                ? "bg-primary text-black shadow-[0_0_20px_rgba(var(--primary),0.3)]" 
                : "text-foreground/40 hover:text-foreground hover:bg-white/5"
            )}
          >
            <item.icon size={18} />
            {item.title}
          </Link>
        ))}
      </div>

      {/* FOOTER */}
      <div className="pt-4 border-t border-white/5 mt-4">
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
  );
};