// src/components/admin/Sidebar.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Users, 
  Home, 
  Settings, 
  Wrench, 
  Sparkles, 
  BarChart3, 
  Utensils, 
  ShieldCheck,
  LogOut,
  Building
} from "lucide-react";
import { auth } from "@/lib/firebase";

export const Sidebar = () => {
  const { userData, isSuperAdmin, isAdmin } = useAuth();
  const pathname = usePathname();

  // Definição de permissões de menu
  const menuItems = [
    {
      title: "Dashboard",
      icon: LayoutDashboard,
      href: "/admin/dashboard",
      roles: ["super_admin", "admin", "reception", "marketing"]
    },
    {
      title: "Hospedagem",
      icon: Home,
      href: "/admin/stays",
      roles: ["super_admin", "admin", "reception"]
    },
    {
      title: "Manutenção",
      icon: Wrench,
      href: "/admin/maintenance",
      roles: ["super_admin", "admin", "maintenance"]
    },
    {
      title: "Governança",
      icon: Sparkles,
      href: "/admin/governance",
      roles: ["super_admin", "admin", "governance"]
    },
    {
      title: "Cozinha & Salão",
      icon: Utensils,
      href: "/admin/kitchen",
      roles: ["super_admin", "admin", "kitchen"]
    },
    {
      title: "Métricas & Marketing",
      icon: BarChart3,
      href: "/admin/marketing",
      roles: ["super_admin", "admin", "marketing"]
    },
    {
      title: "Equipe",
      icon: Users,
      href: "/admin/staff",
      roles: ["super_admin", "admin"]
    },
    {
      title: "Propriedades (CORE)",
      icon: Building,
      href: "/admin/core/properties",
      roles: ["super_admin"]
    },
    {
      title: "Configurações",
      icon: Settings,
      href: "/admin/settings",
      roles: ["super_admin", "admin"]
    },
  ];

  const filteredItems = menuItems.filter(item => 
    userData?.role && item.roles.includes(userData.role)
  );

  return (
    <aside className="w-64 min-h-screen bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h2 className="text-xl font-black tracking-tighter text-primary">AURA ENGINE</h2>
        <p className="text-[10px] uppercase font-bold text-muted-foreground mt-1">
          {userData?.role?.replace('_', ' ')}
        </p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {filteredItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
              pathname === item.href 
                ? "bg-primary text-primary-foreground shadow-md" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon size={20} />
            {item.title}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <button 
          onClick={() => auth.signOut()}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut size={20} />
          Sair do Sistema
        </button>
      </div>
    </aside>
  );
};