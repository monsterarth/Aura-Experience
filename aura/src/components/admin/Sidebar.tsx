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
  LayoutDashboard, Users, Home, Settings, Wrench, 
  Sparkles, BarChart3, Utensils, LogOut, Building, ChevronDown
} from "lucide-react";
import { auth } from "@/lib/firebase";

export const Sidebar = () => {
  const { userData, isSuperAdmin } = useAuth();
  const { property, setProperty } = useProperty();
  const pathname = usePathname();
  const [allProperties, setAllProperties] = useState<Property[]>([]);

  useEffect(() => {
    if (isSuperAdmin) {
      PropertyService.getAllProperties().then(setAllProperties);
    }
  }, [isSuperAdmin]);

  const menuItems = [
    { title: "Dashboard", icon: LayoutDashboard, href: "/admin/dashboard", roles: ["super_admin", "admin", "reception", "marketing"] },
    { title: "Hospedagem", icon: Home, href: "/admin/stays", roles: ["super_admin", "admin", "reception"] },
    { title: "Cabanas", icon: Building, href: "/admin/cabins", roles: ["super_admin", "admin"] },
    { title: "Manutenção", icon: Wrench, href: "/admin/maintenance", roles: ["super_admin", "admin", "maintenance"] },
    { title: "Governança", icon: Sparkles, href: "/admin/governance", roles: ["super_admin", "admin", "governance"] },
    { title: "Equipe", icon: Users, href: "/admin/staff", roles: ["super_admin", "admin"] },
    { title: "Propriedades (CORE)", icon: Building, href: "/admin/core/properties", roles: ["super_admin"] },
  ];

  const filteredItems = menuItems.filter(item => userData?.role && item.roles.includes(userData.role));

  return (
    <aside className="w-64 min-h-screen bg-card border-r border-border flex flex-col p-4">
      {/* SELETOR GLOBAL - Apenas para Super Admin */}
      {isSuperAdmin && (
        <div className="mb-6 p-2 space-y-2">
          <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1">Foco da Instância</label>
          <div className="relative group">
            <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" size={16} />
            <select 
              value={property?.id || ""}
              onChange={(e) => {
                const selected = allProperties.find(p => p.id === e.target.value);
                setProperty(selected || null);
              }}
              className="w-full bg-muted/50 border border-border p-3 pl-10 rounded-2xl text-xs font-bold outline-none appearance-none hover:border-primary/50 transition-all cursor-pointer"
            >
              <option value="">Selecionar...</option>
              {allProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          </div>
        </div>
      )}

      <div className="flex-1 space-y-1">
        {filteredItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
              pathname === item.href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <item.icon size={20} />
            {item.title}
          </Link>
        ))}
      </div>

      <div className="pt-4 border-t border-border">
        <button onClick={() => auth.signOut()} className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10">
          <LogOut size={20} /> Sair
        </button>
      </div>
    </aside>
  );
};