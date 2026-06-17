"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast as sonnerToast } from "sonner";
import type { Stay, Property } from "@/types/aura";
import { toggleGuestDND } from "@/app/actions/dnd-actions";
import { Icon } from "./ui";
import { getPortalThemeVars } from "./theme";
import { portalI18n } from "./i18n";
import {
    PortalContext, type Lang, type TabId, type SheetName, type DndState, type ToastObj,
} from "./context";
import { HomeScreen } from "./HomeScreen";
import { StayScreen } from "./StayScreen";
import { ExploreScreen } from "./ExploreScreen";
import { OrdersScreen } from "./OrdersScreen";
import { SheetHost } from "./sheets";

const TABS: { id: TabId; icon: string; key: "tabHome" | "tabExplore" | "tabOrders" | "tabStay" }[] = [
    { id: "home", icon: "home", key: "tabHome" },
    { id: "explore", icon: "compass", key: "tabExplore" },
    { id: "orders", icon: "bag", key: "tabOrders" },
    { id: "stay", icon: "user", key: "tabStay" },
];

function TabBar({ tab, onTab, labels }: { tab: TabId; onTab: (t: TabId) => void; labels: Record<string, string> }) {
    return (
        <div style={{ flexShrink: 0, background: "color-mix(in srgb, var(--surface) 92%, transparent)", backdropFilter: "blur(16px)", borderTop: "1px solid var(--line)", padding: "8px 12px calc(8px + env(safe-area-inset-bottom))", display: "flex", justifyContent: "space-around" }}>
            {TABS.map((it) => {
                const on = tab === it.id;
                return (
                    <button key={it.id} onClick={() => onTab(it.id)} style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "4px 14px", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 28 }}>
                            <Icon n={it.icon} s={on ? 25 : 23} c={on ? "var(--brand)" : "var(--faint)"} w={on ? 2.1 : 1.8} fill={on ? "var(--brand-soft)" : "none"} style={{ transition: "all .18s" }} />
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600, color: on ? "var(--brand)" : "var(--muted)", letterSpacing: ".01em" }}>{labels[it.key]}</span>
                    </button>
                );
            })}
        </div>
    );
}

function Toast({ toast }: { toast: ToastObj | null }) {
    if (!toast) return null;
    return (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: "calc(86px + env(safe-area-inset-bottom))", zIndex: 70, display: "flex", justifyContent: "center", padding: "0 18px", pointerEvents: "none" }}>
            <div className="portal-toast-pop" style={{ width: "100%", maxWidth: 412, display: "flex", alignItems: "center", gap: 11, background: "var(--ink)", color: "#fff", borderRadius: 16, padding: "13px 16px", boxShadow: "0 16px 36px -12px rgba(43,38,32,.6)" }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(255,255,255,.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon n={toast.icon || "checkcircle"} s={17} c="#fff" /></div>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>{toast.msg}</span>
            </div>
        </div>
    );
}

export function PortalShell({ stay, property, code, lang, setLang }: {
    stay: Stay; property: Property | null; code: string; lang: Lang; setLang: (l: Lang) => void;
}) {
    const router = useRouter();
    const t = portalI18n[lang] || portalI18n.pt;

    const [tab, setTab] = React.useState<TabId>("home");
    const [sheet, setSheet] = React.useState<{ name: SheetName; payload?: unknown } | null>(null);
    const [toastObj, setToastObj] = React.useState<ToastObj | null>(null);
    const [dnd, setDnd] = React.useState<DndState>({ on: stay.dnd_enabled ?? false, until: stay.dnd_until ?? null });
    const [dndLoading, setDndLoading] = React.useState(false);

    const scrollRef = React.useRef<HTMLDivElement>(null);
    const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const toast = React.useCallback((msg: string, icon?: string) => {
        setToastObj({ msg, icon });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastObj(null), 2600);
    }, []);

    React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

    const go = React.useCallback((next: TabId) => {
        setTab(next);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, []);

    const push = React.useCallback((path: string) => { router.push(path); }, [router]);
    const openSheet = React.useCallback((name: SheetName, payload?: unknown) => setSheet({ name, payload }), []);
    const closeSheet = React.useCallback(() => setSheet(null), []);

    const handleDnd = React.useCallback(async (hours: number | null) => {
        setDndLoading(true);
        try {
            const result = await toggleGuestDND(stay.id, stay.accessCode, hours);
            if (result.success) {
                setDnd({ on: hours !== null, until: result.dnd_until ?? null });
                toast(hours === null ? t.cleaningResumed : t.dndEnabledToast, hours === null ? "checkcircle" : "moon");
            } else {
                sonnerToast.error("Não foi possível atualizar o Não Perturbe.");
            }
        } catch {
            sonnerToast.error("Erro ao atualizar Não Perturbe.");
        } finally {
            setDndLoading(false);
        }
    }, [stay.id, stay.accessCode, t.cleaningResumed, t.dndEnabledToast, toast]);

    const ctx = {
        stay, property, code, lang, setLang, t,
        tab, go, push, openSheet, closeSheet, toast,
        dnd, setDnd, handleDnd, dndLoading,
    };

    return (
        <PortalContext.Provider value={ctx}>
            <div style={{ ...getPortalThemeVars(property), fontFamily: "var(--font-portal-body), system-ui, sans-serif" }}>
                <div style={{ maxWidth: 448, margin: "0 auto", height: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--ink)", position: "relative", overflow: "hidden" }}>
                    <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingTop: "env(safe-area-inset-top)" }}>
                        <div key={tab} className="portal-screen-fade">
                            {tab === "home" && <HomeScreen />}
                            {tab === "explore" && <ExploreScreen />}
                            {tab === "orders" && <OrdersScreen />}
                            {tab === "stay" && <StayScreen />}
                        </div>
                    </div>
                    <TabBar tab={tab} onTab={go} labels={t as unknown as Record<string, string>} />
                </div>
                <Toast toast={toastObj} />
                <SheetHost sheet={sheet} />
            </div>
        </PortalContext.Provider>
    );
}
