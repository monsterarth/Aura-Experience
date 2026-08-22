"use client";

// Shell do admin (revamp 08/2026): tokens por tema (data-theme), provedores do
// kit (motion / overlays / confirm), ÚNICO container de scroll (`.aura-scroll`,
// data-scroll-root — o PullToRefresh lê daqui), moldura de página com padding
// responsivo (--page-pad), tab bar inferior por cargo no celular, toasts dentro
// do root (herdam tema) e raiz de overlays para os Dialogs (portal).
import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import {
  LayoutGrid, Home, Sparkles, Gift, ConciergeBell, UserSearch, Wrench, Phone, Coffee,
  UtensilsCrossed, Star, ClipboardList, Megaphone, MessageSquare, Warehouse, Package,
  ShoppingCart, ArrowLeftRight, Building, Menu, type LucideIcon,
} from "lucide-react";
import { Sidebar } from "@/components/admin/Sidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { PropertyProvider } from "@/context/PropertyContext";
import { NotificationProvider, useNotifications } from "@/context/NotificationContext";
import { ImpersonateBanner } from "@/components/admin/ImpersonateBanner";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import { NOTIFICATION_ALERT_ROLES, hasAnyRole } from "@/lib/notifications";
import { roleTabs, type RoleTabIcon } from "@/lib/role-routes";
import { AuraMotionProvider } from "@/components/aura/motion";
import { OverlayProvider } from "@/components/aura/OverlayProvider";
import { ConfirmProvider } from "@/components/aura/ConfirmDialog";
import { BottomTabBar, type TabBarItem } from "@/components/aura/BottomTabBar";
import { useIsMobile } from "@/components/aura/hooks";

const TAB_ICONS: Record<RoleTabIcon, LucideIcon> = {
  panel: LayoutGrid, stays: Home, governance: Sparkles, concierge: Gift, reception: ConciergeBell,
  guests: UserSearch, maintenance: Wrench, kds: Phone, orders: UtensilsCrossed, menu: Coffee, cafe: Coffee,
  reviews: Star, surveys: ClipboardList, marketing: Megaphone, messages: MessageSquare,
  stock: Warehouse, products: Package, purchases: ShoppingCart, movements: ArrowLeftRight, cabins: Building,
};

type Palette = "warm" | "cool";
const PALETTE_KEY = "aura-light-palette";
export const PALETTE_EVENT = "aura-palette-change";

function AdminLayoutInner({ children, initialTheme }: { children: React.ReactNode; initialTheme: "dark" | "light" }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";
  const { impersonating, userData } = useAuth();
  const { counts } = useNotifications();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = useIsMobile();

  const theme: "dark" | "light" = (userData?.uiTheme ?? initialTheme) === "light" ? "light" : "dark";

  // Paleta clara alternativa (quente × fria) — só para comparar no piloto.
  const [palette, setPalette] = useState<Palette>("warm");
  useEffect(() => {
    const read = () => setPalette(localStorage.getItem(PALETTE_KEY) === "cool" ? "cool" : "warm");
    read();
    window.addEventListener(PALETTE_EVENT, read);
    return () => window.removeEventListener(PALETTE_EVENT, read);
  }, []);

  // Web Push no desktop do balcão: mesmo com a aba fechada, pedido de concierge chega.
  // Restrito aos cargos do canal interruptivo (hoje: recepção).
  const canPush = hasAnyRole(userData?.role, userData?.secondaryRoles, NOTIFICATION_ALERT_ROLES);

  const tabs = useMemo<TabBarItem[]>(() => {
    const base = roleTabs(userData?.role).map<TabBarItem>(t => ({
      id: t.id,
      label: t.label,
      href: t.href,
      icon: TAB_ICONS[t.icon],
      match: t.exact ? (p: string) => p === t.href : undefined,
      badge: t.id === "concierge" ? counts.concierge : t.id === "messages" ? counts.messages : undefined,
    }));
    return [...base, { id: "more", label: "Mais", icon: Menu, onClick: () => setMobileNavOpen(true) }];
  }, [userData?.role, counts.concierge, counts.messages]);

  return (
    <div
      className="aura-admin-root aura-shell"
      data-theme={theme}
      data-palette={theme === "light" && palette === "cool" ? "cool" : undefined}
      data-impersonating={impersonating ? "true" : undefined}
    >
      <AuraMotionProvider>
        <OverlayProvider>
          <ConfirmProvider>
            {!isLoginPage && <Sidebar isOpen={mobileNavOpen} setIsOpen={setMobileNavOpen} />}
            {!isLoginPage && canPush && <PushNotificationManager role="reception" />}

            <main className="aura-shell-main" data-inert-when-overlay>
              {!isLoginPage && <ImpersonateBanner />}
              {!isLoginPage && <AdminTopbar onMenuClick={() => setMobileNavOpen(true)} />}
              <div className="aura-scroll custom-scrollbar" data-scroll-root>
                <div className="aura-page-frame">{children}</div>
              </div>
              {!isLoginPage && userData && <BottomTabBar items={tabs} />}
            </main>

            <Toaster
              position={isMobile ? "bottom-center" : "top-right"}
              duration={isMobile ? 4000 : 5000}
              closeButton={!isMobile}
              theme={theme}
              mobileOffset={{ bottom: "calc(var(--tabbar-h) + 12px)" }}
              toastOptions={{ classNames: { toast: "ak-toast", title: "ak-toast-title", description: "ak-toast-desc", actionButton: "ak-toast-action" } }}
            />
          </ConfirmProvider>
        </OverlayProvider>
      </AuraMotionProvider>
    </div>
  );
}

export default function AdminLayoutClient({ children, initialTheme = "dark" }: { children: React.ReactNode; initialTheme?: "dark" | "light" }) {
  return (
    <AuthProvider>
      <PropertyProvider>
        <NotificationProvider>
          <AdminLayoutInner initialTheme={initialTheme}>{children}</AdminLayoutInner>
        </NotificationProvider>
      </PropertyProvider>
    </AuthProvider>
  );
}
