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
  Star, ClipboardList, Bot, FileText,
  Loader2, ChevronLeft, ChevronRight, Coffee,
  CalendarDays, UserSearch,
  ClipboardCheck, Map, Gift, Flag, Phone,
  LayoutGrid, RefrigeratorIcon, LayoutTemplate,
  UserCircle2, Smartphone, Heart,
} from "lucide-react";
import { createClientBrowser } from "@/lib/supabase-browser";
import Image from "next/image";
import { StaffEditModal } from "@/components/admin/StaffEditModal";
import { ImpersonateModal } from "@/components/admin/ImpersonateModal";
import { useNotifications } from "@/context/NotificationContext";

// ─── Design tokens — harmonizados com AdminLayoutClient ───────────────────────
// bg/bg2 alinhados com --background (#141414) e --card (#1c1c1c) do admin
const T = {
  bg:    "#141414",
  bg2:   "#111111",
  bg3:   "#1c1c1c",
  glass:   "rgba(255,255,255,0.035)",
  glass2:  "rgba(255,255,255,0.055)",
  border:  "rgba(255,255,255,0.08)",
  border2: "rgba(255,255,255,0.13)",
  text:    "#ffffff",
  muted:   "rgba(255,255,255,0.42)",
  muted2:  "rgba(255,255,255,0.22)",
  // Gradiente purple→teal — identidade do nav ativo (aprovada no redesign)
  g1:    "#9b6dff",
  g2:    "#4ec9d4",
  grad:  "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
  gradSoft: "linear-gradient(135deg,rgba(155,109,255,0.15) 0%,rgba(78,201,212,0.15) 100%)",
  // Cores semânticas
  violet:       "#c084fc",
  violetBg:     "rgba(192,132,252,0.08)",
  violetBorder: "rgba(192,132,252,0.22)",
  amber:        "#f59e0b",
  amberBg:      "rgba(245,158,11,0.08)",
  amberBorder:  "rgba(245,158,11,0.22)",
  blue:         "#60a5fa",
  blueBg:       "rgba(96,165,250,0.08)",
  blueBorder:   "rgba(96,165,250,0.22)",
  green:        "#2dd4bf",
  greenBg:      "rgba(45,212,191,0.08)",
  greenBorder:  "rgba(45,212,191,0.22)",
  orange:       "#fb923c",
  orangeBg:     "rgba(251,146,60,0.08)",
  red:          "#f87171",
  sidebarW:   256,
  collapsedW: 64,
};

// ─── Role meta ────────────────────────────────────────────────────────────────
const ROLE_META: Record<string, { label: string; short: string; color: string; badge: string; badgeBg: string; badgeBorder: string }> = {
  super_admin: { label: "Super Admin",      short: "SA", color: T.g1,     badge: "Super Admin", badgeBg: "rgba(155,109,255,0.12)", badgeBorder: "rgba(155,109,255,0.28)" },
  admin:       { label: "Administrador",    short: "AD", color: T.g2,     badge: "Admin",       badgeBg: "rgba(78,201,212,0.12)",  badgeBorder: "rgba(78,201,212,0.28)"  },
  hr:          { label: "Recursos Humanos", short: "RH", color: T.blue,   badge: "RH",          badgeBg: T.blueBg,                 badgeBorder: T.blueBorder             },
  reception:   { label: "Recepção",         short: "RC", color: T.green,  badge: "Recepção",    badgeBg: T.greenBg,                badgeBorder: T.greenBorder            },
  governance:  { label: "Governança",       short: "GV", color: T.violet, badge: "Governança",  badgeBg: T.violetBg,               badgeBorder: T.violetBorder           },
  kitchen:     { label: "Cozinha",          short: "CZ", color: T.orange, badge: "Cozinha",     badgeBg: T.orangeBg,               badgeBorder: "rgba(251,146,60,0.25)"  },
  maintenance: { label: "Manutenção",       short: "MT", color: T.amber,  badge: "Manutenção",  badgeBg: T.amberBg,                badgeBorder: T.amberBorder            },
  marketing:   { label: "Marketing",        short: "MK", color: "#a3e635",badge: "Marketing",   badgeBg: "rgba(163,230,53,0.08)",  badgeBorder: "rgba(163,230,53,0.22)"  },
};

function getRoleMeta(role?: string | null) {
  return ROLE_META[role ?? ""] ?? { label: role ?? "Staff", short: "ST", color: T.g2, badge: role ?? "Staff", badgeBg: T.glass2, badgeBorder: T.border2 };
}

// ─── Nav types ────────────────────────────────────────────────────────────────
type SubItem = {
  id: string;
  label: string;
  href: string;
  roles: string[];
};

type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  roles: string[];
  badge?: number | null;
  tag?: string;
  requireProperty?: boolean;
  exactMatch?: boolean;
  children?: SubItem[];
};

type NavGroup = {
  id: string;
  label: string | null;
  collapsible?: boolean;
  items: NavItem[];
};

// ─── Painel sub-items (dropdowns por cargo) ───────────────────────────────────
const PAINEL_CHILDREN: SubItem[] = [
  { id: "painel_plataforma", label: "Plataforma",  href: "/admin/core/dashboard",      roles: ["super_admin"] },
  { id: "painel_recepcao",   label: "Recepção",    href: "/admin/reception",            roles: ["super_admin", "admin"] },
  { id: "painel_gov",        label: "Governança",  href: "/admin/governance",           roles: ["super_admin", "admin"] },
  { id: "painel_manut",      label: "Manutenção",  href: "/admin/maintenance",          roles: ["super_admin", "admin"] },
  { id: "painel_kds",        label: "Cozinha/KDS", href: "/admin/cafe-salao/kds",       roles: ["super_admin", "admin"] },
  { id: "painel_aval",       label: "Avaliações",  href: "/admin/surveys/responses",    roles: ["super_admin", "admin"] },
  { id: "painel_gerencia",   label: "Gerência",    href: "/admin/hr",                   roles: ["super_admin", "admin", "hr"] },
];

// ─── Nav groups ───────────────────────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    id: "principal",
    label: null,
    items: [
      {
        id: "painel", label: "Painel", icon: LayoutGrid,
        href: "/admin/dashboard", roles: ["super_admin","admin","hr","reception","governance","maintenance","kitchen","marketing"],
        children: PAINEL_CHILDREN,
      },
    ],
  },
  {
    id: "hospedagem",
    label: "Hospedagem",
    items: [
      { id: "stays",   label: "Estadias",     icon: Home,          href: "/admin/stays",           roles: ["super_admin","admin","reception","governance","hr"] },
      { id: "mapa",    label: "Mapa",          icon: Map,           href: "/admin/reservation-map", roles: ["super_admin","admin","reception","hr"] },
      { id: "hospedes",label: "Hóspedes",      icon: UserSearch,    href: "/admin/guests",          roles: ["super_admin","admin","reception","hr"] },
      { id: "comunic", label: "Comunicação",   icon: MessageSquare, href: "/admin/comunicacao",     roles: ["super_admin","admin","reception"] },
    ],
  },
  {
    id: "calendarios",
    label: "Calendários",
    items: [
      { id: "calendario", label: "Calendário Geral", icon: CalendarDays, href: "/admin/calendario",              roles: ["super_admin","admin","reception","hr"] },
      { id: "agenda",     label: "Agendamentos",      icon: ClipboardCheck, href: "/admin/core/structures/bookings", roles: ["super_admin","admin","reception"] },
      { id: "eventos",     label: "Eventos",     icon: Flag,  href: "/admin/eventos",     roles: ["super_admin","admin","reception"] },
      { id: "casamentos",  label: "Casamentos",  icon: Heart, href: "/admin/casamentos", roles: ["super_admin","admin","reception"] },
    ],
  },
  {
    id: "operacoes",
    label: "Operações",
    items: [
      { id: "manutencao", label: "Manutenção", icon: Wrench,   href: "/admin/maintenance/kanban", roles: ["super_admin","admin","maintenance"] },
      { id: "governanca", label: "Governança", icon: Sparkles, href: "/admin/governance/kanban",  roles: ["super_admin","admin","governance"] },
      { id: "concierge",  label: "Concierge",  icon: Gift,     href: "/admin/concierge",          roles: ["super_admin","admin","reception","hr"] },
    ],
  },
  {
    id: "mobile_apps",
    label: "Apps Mobile",
    items: [
      {
        id: "apps_mobile", label: "Apps Mobile", icon: Smartphone,
        href: "/admin/mobile-apps", roles: ["super_admin","admin","hr"],
        children: [
          { id: "app_governanta", label: "Governança", href: "/admin/mobile-apps/governanta", roles: ["super_admin","admin","hr"] },
          { id: "app_maid",       label: "Camareira",  href: "/admin/mobile-apps/maid",       roles: ["super_admin","admin","hr"] },
          { id: "app_manut",      label: "Manutenção", href: "/admin/mobile-apps/manutencao", roles: ["super_admin","admin","hr"] },
          { id: "app_houseman",   label: "Mensageiro", href: "/admin/mobile-apps/houseman",   roles: ["super_admin","admin","hr"] },
          { id: "app_garcom",     label: "Garçom",     href: "/admin/mobile-apps/garcom",     roles: ["super_admin","admin","hr"] },
        ],
      },
    ],
  },
  {
    id: "gerencia",
    label: "Gerência",
    collapsible: true,
    items: [
      { id: "cabanas",    label: "Cabanas",           icon: Building,         href: "/admin/cabins",          roles: ["super_admin","admin","governance"] },
      { id: "estruturas", label: "Estruturas",         icon: LayoutTemplate,   href: "/admin/core/structures", roles: ["super_admin","admin"] },
      { id: "frigobar",   label: "Frigobar",           icon: RefrigeratorIcon, href: "/admin/cabins/minibar",  roles: ["super_admin","admin"] },
      { id: "escalas",    label: "Escalas",            icon: ClipboardCheck,   href: "/admin/escalas",         roles: ["super_admin","admin","hr"] },
      { id: "logs",       label: "Logs de Auditoria",  icon: FileText,         href: "/admin/logs",            roles: ["super_admin","admin"] },
      { id: "avaliacoes", label: "Avaliações",         icon: Star,             href: "/admin/surveys/responses", roles: ["super_admin","admin","reception","marketing"] },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    collapsible: true,
    items: [
      { id: "gastro_main", label: "Gastronomia",      icon: Coffee,        href: "/admin/food-and-beverage/menu",           roles: ["super_admin","admin","kitchen"] },
      { id: "cafe",        label: "Café Salão (KDS)", icon: Phone,         href: "/admin/cafe-salao",                       roles: ["super_admin","admin","kitchen"] },
      { id: "equipe",      label: "Equipe",            icon: Users,         href: "/admin/staff",                            roles: ["super_admin","admin","hr"] },
      { id: "nps",         label: "Pesquisas (NPS)",   icon: ClipboardList, href: "/admin/surveys",                          roles: ["super_admin","admin"] },
      { id: "automacoes",  label: "Automações",        icon: Bot,           href: "/admin/comunicacao/automations/settings", roles: ["super_admin","admin"] },
      { id: "config",      label: "Configurações",     icon: Settings,      href: "/admin/core/properties",                  roles: ["super_admin","admin"], requireProperty: true },
      { id: "props",       label: "Propriedades",      icon: Globe,         href: "/admin/core/properties",                  roles: ["super_admin"], exactMatch: true },
    ],
  },
];

// ─── Inline styles ────────────────────────────────────────────────────────────
const S = {
  aside: (collapsed: boolean): React.CSSProperties => ({
    width: collapsed ? T.collapsedW : T.sidebarW,
    minWidth: collapsed ? T.collapsedW : T.sidebarW,
    background: T.bg2,
    borderRight: `1px solid ${T.border}`,
    display: "flex",
    flexDirection: "column",
    transition: "width .22s cubic-bezier(.4,0,.2,1), min-width .22s cubic-bezier(.4,0,.2,1)",
    overflow: "hidden",
    position: "relative",
    zIndex: 20,
    height: "100dvh",
    flexShrink: 0,
  }),
  gradText: {
    background: T.grad,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  } as React.CSSProperties,
  logoMonogram: {
    width: 32, height: 32, borderRadius: 10,
    background: "linear-gradient(135deg,rgba(155,109,255,0.15),rgba(78,201,212,0.15))",
    border: "1px solid rgba(155,109,255,0.3)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 900,
  } as React.CSSProperties,
  collapseBtn: {
    background: "none", border: "none", cursor: "pointer",
    color: T.muted, padding: 4, display: "flex", borderRadius: 6,
    transition: "color .15s",
  } as React.CSSProperties,
  avatar: (color: string, size = 36): React.CSSProperties => ({
    width: size, height: size, borderRadius: 10, flexShrink: 0,
    background: `linear-gradient(135deg,rgba(155,109,255,0.2),rgba(78,201,212,0.2))`,
    border: `1px solid ${color}44`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: size > 30 ? 12 : 11, fontWeight: 900, color,
    cursor: "pointer",
  }),
  badge: {
    minWidth: 18, height: 18, borderRadius: 999, padding: "0 5px",
    background: T.grad, color: "#fff",
    fontSize: 10, fontWeight: 900,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 2px 8px rgba(155,109,255,.4)",
    flexShrink: 0,
  } as React.CSSProperties,
  mobileTag: {
    fontSize: 9, fontWeight: 800, letterSpacing: ".06em",
    textTransform: "uppercase" as const,
    background: T.orangeBg, color: T.orange,
    border: `1px solid rgba(251,146,60,0.25)`,
    borderRadius: 4, padding: "1px 5px",
  } as React.CSSProperties,
  activeAccent: {
    position: "absolute" as const, left: 0, top: "50%",
    transform: "translateY(-50%)",
    width: 3, height: 18, borderRadius: 999,
    background: T.grad,
  } as React.CSSProperties,
};

// ─── NavItemRow ───────────────────────────────────────────────────────────────
function NavItemRow({
  item, isActive, collapsed, badgeCount, onClick, isSubItem = false,
}: {
  item: NavItem | SubItem;
  isActive: boolean;
  collapsed: boolean;
  badgeCount?: number | null;
  onClick?: () => void;
  isSubItem?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = "icon" in item ? item.icon : null;

  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: collapsed ? 0 : (isSubItem ? 8 : 10),
    padding: collapsed ? "9px 0" : (isSubItem ? "7px 10px 7px 28px" : "9px 10px"),
    justifyContent: collapsed ? "center" : "flex-start",
    width: "100%",
    border: "none",
    cursor: "pointer",
    borderRadius: 10,
    fontFamily: "inherit",
    background: isActive ? T.gradSoft : hovered ? T.glass2 : "transparent",
    color: isActive ? T.g1 : hovered ? T.text : T.muted,
    fontSize: isSubItem ? 12 : 13,
    fontWeight: isActive ? 700 : 500,
    transition: "background .15s, color .15s",
    position: "relative" as const,
    outline: "none",
    letterSpacing: ".01em",
    textDecoration: "none",
  };

  const inner = (
    <>
      {isActive && !collapsed && !isSubItem && <div style={S.activeAccent} />}
      {isSubItem && !collapsed && (
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: isActive ? T.g1 : T.muted2, flexShrink: 0 }} />
      )}
      {Icon && !isSubItem && (
        <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.75 }}>
          <Icon size={16} style={{ color: isActive ? T.g1 : "currentColor", strokeWidth: isActive ? 2.2 : 1.7 }} />
        </span>
      )}
      {!collapsed && (
        <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.label}
        </span>
      )}
      {!collapsed && "tag" in item && item.tag === "mobile" && <span style={S.mobileTag}>mobile</span>}
      {!collapsed && badgeCount != null && badgeCount > 0 && (
        <span style={S.badge}>{badgeCount > 99 ? "99+" : badgeCount}</span>
      )}
      {collapsed && badgeCount != null && badgeCount > 0 && (
        <span style={{
          position: "absolute", top: 4, right: 4,
          width: 14, height: 14, borderRadius: 999,
          background: T.grad, color: "#fff",
          fontSize: 8, fontWeight: 900,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{badgeCount > 9 ? "9+" : badgeCount}</span>
      )}
    </>
  );

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {inner}
    </Link>
  );
}

// ─── PainelNavItem — item com dropdown expansível ─────────────────────────────
function PainelNavItem({
  item, role, pathname, collapsed, badgeCount, onClick,
}: {
  item: NavItem;
  role: string | null | undefined;
  pathname: string;
  collapsed: boolean;
  badgeCount?: number | null;
  onClick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const visibleChildren = (item.children ?? []).filter(c =>
    role === "super_admin" || c.roles.includes(role ?? "")
  );
  const hasDropdown = !collapsed && visibleChildren.length > 1;

  const isItemActive = pathname === item.href || pathname.startsWith(item.href + "/");
  const isChildActive = visibleChildren.some(c => pathname === c.href || pathname.startsWith(c.href + "/"));
  const isActive = isItemActive && !isChildActive;

  // auto-open if a child is active
  useEffect(() => {
    if (isChildActive) setOpen(true);
  }, [isChildActive]);

  const mainStyle: React.CSSProperties = {
    display: "flex", alignItems: "center",
    gap: collapsed ? 0 : 10,
    padding: collapsed ? "9px 0" : "9px 10px",
    justifyContent: collapsed ? "center" : "flex-start",
    width: "100%", border: "none", cursor: "pointer",
    borderRadius: 10, fontFamily: "inherit",
    background: (isActive || isChildActive) ? T.gradSoft : hovered ? T.glass2 : "transparent",
    color: (isActive || isChildActive) ? T.g1 : hovered ? T.text : T.muted,
    fontSize: 13, fontWeight: (isActive || isChildActive) ? 700 : 500,
    transition: "background .15s, color .15s",
    position: "relative" as const,
    outline: "none", letterSpacing: ".01em",
  };

  const Icon = item.icon;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Link
          href={item.href}
          style={{ ...mainStyle, flex: 1 }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={onClick}
          title={collapsed ? item.label : undefined}
        >
          {(isActive || isChildActive) && !collapsed && <div style={S.activeAccent} />}
          <span style={{ flexShrink: 0, opacity: (isActive || isChildActive) ? 1 : 0.75 }}>
            <Icon size={16} style={{ color: (isActive || isChildActive) ? T.g1 : "currentColor", strokeWidth: (isActive || isChildActive) ? 2.2 : 1.7 }} />
          </span>
          {!collapsed && (
            <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.label}
            </span>
          )}
          {badgeCount != null && badgeCount > 0 && !hasDropdown && !collapsed && (
            <span style={S.badge}>{badgeCount > 99 ? "99+" : badgeCount}</span>
          )}
        </Link>

        {hasDropdown && (
          <button
            onClick={() => setOpen(p => !p)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "6px 6px", borderRadius: 8,
              color: (isActive || isChildActive) ? T.g1 : T.muted2,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color .15s",
              flexShrink: 0,
            }}
            title={open ? "Fechar" : "Mais painéis"}
          >
            <ChevronDown size={13} style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
        )}
      </div>

      {hasDropdown && open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 2 }}>
          {visibleChildren.map(child => {
            const childActive = pathname === child.href || pathname.startsWith(child.href + "/");
            return (
              <NavItemRow
                key={child.id}
                item={child}
                isActive={childActive}
                collapsed={false}
                onClick={onClick}
                isSubItem
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export const Sidebar = () => {
  const { userData, isSuperAdmin, loading: authLoading, userDataReady, impersonating } = useAuth();
  const { currentProperty: property, setProperty } = useProperty();
  const { counts: notifCounts } = useNotifications();
  const pathname = usePathname();
  const router = useRouter();
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar_collapsed") === "true";
  });
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [collapsibleOpen, setCollapsibleOpen] = useState<Record<string, boolean>>({ setup: true, gerencia: true });
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);

  const commitHash = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev";
  const shortHash = commitHash.substring(0, 7);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

  useEffect(() => { setIsOpen(false); }, [pathname]);

  useEffect(() => {
    if (isSuperAdmin) PropertyService.getAllProperties().then(setAllProperties);
  }, [isSuperAdmin]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClientBrowser();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Erro ao sair", e);
    } finally {
      window.location.href = "/admin/login";
    }
  };

  const isLoginPage = pathname === "/admin/login";
  if (!isLoginPage && !authLoading && userDataReady && !userData) {
    router.replace("/admin/login");
    return null;
  }

  const mobileOnlyRoles = ["maid", "technician", "waiter", "porter", "houseman"];
  if (userData?.role && mobileOnlyRoles.includes(userData.role)) {
    if (userData.role === "maid" && pathname !== "/maid") router.replace("/maid");
    else if (userData.role === "technician" && pathname !== "/maintenance") router.replace("/maintenance");
    else if (userData.role === "houseman" && pathname !== "/houseman") router.replace("/houseman");
    return null;
  }

  const role = userData?.role ?? null;
  const roleMeta = getRoleMeta(role);
  const isAdmin = ["super_admin", "admin", "hr"].includes(role ?? "");

  function canSee(item: NavItem) {
    if (!role) return false;
    if (item.requireProperty && !property) return false;
    if (role === "super_admin") return true;
    return item.roles.includes(role);
  }

  function isActive(item: NavItem) {
    if (item.exactMatch) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  const badgeFor: Record<string, number | undefined> = {
    comunic: notifCounts.messages,
  };

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  };

  const sidebarBg = T.bg2;

  return (
    <>
      {/* Mobile fab */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 z-40 p-4 rounded-full shadow-lg transition-transform hover:scale-105"
        style={{ background: T.grad, color: "#fff" }}
      >
        <Menu size={24} />
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static top-0 left-0 z-50 transition-transform duration-300 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          width: isCollapsed ? T.collapsedW : T.sidebarW,
          minWidth: isCollapsed ? T.collapsedW : T.sidebarW,
          background: sidebarBg,
          borderRight: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          transition: "width .22s cubic-bezier(.4,0,.2,1), min-width .22s cubic-bezier(.4,0,.2,1)",
          overflow: "hidden",
          height: "100dvh",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div style={{
          padding: isCollapsed ? "18px 0" : "18px 20px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center",
          justifyContent: isCollapsed ? "center" : "space-between",
          flexShrink: 0, gap: 8,
        }}>
          {!isCollapsed ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {property?.logoUrl ? (
                  <div style={{ width: 28, height: 28, borderRadius: 8, overflow: "hidden", flexShrink: 0, border: `1px solid ${T.border2}` }}>
                    <Image src={property.logoUrl} alt={property.name} width={28} height={28} style={{ objectFit: "cover" }} />
                  </div>
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: 8, overflow: "hidden", flexShrink: 0, position: "relative" }}>
                    <Image src="/logo_flat.png" alt="Aura" fill style={{ objectFit: "contain" }} />
                  </div>
                )}
                <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>
                  <span style={S.gradText}>{property?.name ?? "aaura"}</span>
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button className="lg:hidden" onClick={() => setIsOpen(false)} style={{ ...S.collapseBtn, padding: 6 }}>
                  <X size={16} />
                </button>
                <button onClick={toggleCollapse} style={S.collapseBtn} className="hidden lg:flex">
                  <ChevronLeft size={15} />
                </button>
              </div>
            </>
          ) : (
            <div style={S.logoMonogram}>
              <span style={S.gradText}>A</span>
            </div>
          )}
        </div>

        {/* User info */}
        <div style={{
          padding: isCollapsed ? "12px 0" : "14px 16px",
          borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
          display: "flex",
          justifyContent: isCollapsed ? "center" : "flex-start",
        }}>
          {!isCollapsed ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
              <button onClick={() => setShowEditProfile(true)} style={S.avatar(roleMeta.color, 36)} title="Editar perfil">
                {userData?.profilePictureUrl ? (
                  <img src={userData.profilePictureUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: 10, objectFit: "cover" }} />
                ) : (
                  <span>{roleMeta.short}</span>
                )}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: T.text }}>
                  {userData?.fullName ?? "Usuário"}
                </div>
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  fontSize: 10, fontWeight: 800, letterSpacing: ".04em",
                  textTransform: "uppercase", padding: "2px 8px",
                  borderRadius: 999, lineHeight: 1.6, marginTop: 3,
                  background: roleMeta.badgeBg, color: roleMeta.color,
                  border: `1px solid ${roleMeta.badgeBorder}`,
                }}>
                  {roleMeta.badge}
                </span>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowEditProfile(true)} style={S.avatar(roleMeta.color, 32)} title="Perfil">
              {userData?.profilePictureUrl ? (
                <img src={userData.profilePictureUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <span>{roleMeta.short}</span>
              )}
            </button>
          )}
        </div>

        {/* Super admin property switcher */}
        {isSuperAdmin && !isCollapsed && (
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <label style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".2em", color: T.muted2 }}>
              Propriedade
            </label>
            <div style={{ position: "relative", marginTop: 6 }}>
              <Building size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.g2 }} />
              <select
                value={property?.id ?? ""}
                onChange={(e) => {
                  const sel = allProperties.find((p) => p.id === e.target.value);
                  setProperty(sel ?? null);
                }}
                style={{
                  width: "100%",
                  background: T.bg3, border: `1px solid ${T.border2}`,
                  padding: "8px 32px 8px 32px", borderRadius: 10,
                  fontSize: 12, fontWeight: 700, color: T.text,
                  outline: "none", appearance: "none", cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <option value="">Selecionar…</option>
                {allProperties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: T.muted2, pointerEvents: "none" }} />
            </div>
          </div>
        )}

        {/* Nav */}
        <div style={{
          flex: 1, overflowY: "auto", overflowX: "hidden",
          padding: isCollapsed ? "10px 0" : "10px 10px",
          scrollbarWidth: "thin" as const,
          scrollbarColor: "rgba(255,255,255,0.08) transparent",
        }}>
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter(canSee);
            if (visibleItems.length === 0) return null;
            const isCollapsible = !!group.collapsible;
            const expanded = isCollapsible ? (collapsibleOpen[group.id] ?? true) : true;

            return (
              <div key={group.id} style={{ marginBottom: 4 }}>
                {group.label && !isCollapsed && (
                  <div
                    style={{
                      display: "flex", alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px 4px",
                      cursor: isCollapsible ? "pointer" : "default",
                    }}
                    onClick={isCollapsible ? () => setCollapsibleOpen(p => ({ ...p, [group.id]: !(p[group.id] ?? true) })) : undefined}
                  >
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: ".08em",
                      textTransform: "uppercase" as const, color: T.muted2,
                    }}>{group.label}</span>
                    {isCollapsible && (
                      <ChevronDown size={12} style={{
                        color: T.muted2, transition: "transform .2s",
                        transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                      }} />
                    )}
                  </div>
                )}
                {isCollapsed && group.label && (
                  <div style={{ width: "100%", height: 1, background: T.border, margin: "8px 0" }} />
                )}

                {expanded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {visibleItems.map((item) => {
                      if (item.children) {
                        return (
                          <PainelNavItem
                            key={item.id}
                            item={item}
                            role={role}
                            pathname={pathname}
                            collapsed={isCollapsed}
                            badgeCount={badgeFor[item.id]}
                            onClick={() => setIsOpen(false)}
                          />
                        );
                      }
                      return (
                        <NavItemRow
                          key={item.id}
                          item={item}
                          isActive={isActive(item)}
                          collapsed={isCollapsed}
                          badgeCount={badgeFor[item.id] ?? item.badge}
                          onClick={() => setIsOpen(false)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ height: 8 }} />
        </div>

        {/* Footer */}
        <div style={{
          borderTop: `1px solid ${T.border}`,
          padding: isCollapsed ? "10px 0" : "10px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          {/* Impersonar — apenas para admin/hr/super_admin (oculto durante impersonação ativa) */}
          {isAdmin && !impersonating && !isCollapsed && (
            <button
              onClick={() => setShowImpersonateModal(true)}
              style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "9px 10px",
                background: T.violetBg, border: `1px solid ${T.violetBorder}`,
                borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                color: T.violet, fontSize: 12, fontWeight: 700,
                letterSpacing: ".01em", transition: "background .15s", width: "100%",
              }}
            >
              <UserCircle2 size={15} color={T.violet} />
              Impersonar funcionário
            </button>
          )}
          {isAdmin && !impersonating && isCollapsed && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={() => setShowImpersonateModal(true)}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: `1px solid ${T.violetBorder}`,
                  background: T.violetBg, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                title="Impersonar funcionário"
              >
                <UserCircle2 size={16} color={T.violet} />
              </button>
            </div>
          )}

          <ImpersonateModal
            open={showImpersonateModal}
            onClose={() => setShowImpersonateModal(false)}
          />

          {/* Logout + version */}
          {!isCollapsed ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11, color: T.muted2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {appVersion} · {shortHash}
              </span>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                title="Sair"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: T.muted, padding: 6, borderRadius: 8,
                  display: "flex", transition: "color .15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.red)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.muted)}
              >
                {isLoggingOut ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite", color: T.red }} /> : <LogOut size={16} />}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                title="Sair"
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: `1px solid ${T.border2}`,
                  background: T.glass,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  color: T.muted,
                }}
              >
                {isLoggingOut ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: T.red }} /> : <LogOut size={15} />}
              </button>
              <button onClick={toggleCollapse} title="Expandir" style={{
                width: 36, height: 36, borderRadius: 10,
                border: `1px solid ${T.border2}`,
                background: T.glass2, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.muted,
              }}>
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Edit profile modal */}
      {showEditProfile && userData && (
        <StaffEditModal
          staff={userData as any}
          onClose={() => setShowEditProfile(false)}
          onSave={() => { setShowEditProfile(false); window.location.reload(); }}
        />
      )}

      {/* Logout overlay */}
      {isLoggingOut && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center backdrop-blur-md"
          style={{ background: "rgba(20,20,20,0.92)" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
            <div style={{ position: "relative" }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                border: `4px solid rgba(155,109,255,0.1)`,
                borderTop: `4px solid ${T.g1}`,
                animation: "spin 1s linear infinite",
                boxShadow: `0 0 30px rgba(155,109,255,0.2)`,
              }} />
              <LogOut style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%,-50%)", color: T.text, width: 22, height: 22,
              }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: T.text, letterSpacing: ".15em", textTransform: "uppercase" }}>
                Saindo do Aura
              </h3>
              <p style={{ fontSize: 11, color: T.g2, letterSpacing: ".1em", textTransform: "uppercase", marginTop: 6 }}>
                Fechando sessão segura…
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
};
