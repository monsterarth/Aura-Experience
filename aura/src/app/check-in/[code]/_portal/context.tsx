"use client";

import { createContext, useContext } from "react";
import type { Stay, Property } from "@/types/aura";
import type { PortalStrings } from "./i18n";

export type Lang = "pt" | "en" | "es";
export type TabId = "home" | "explore" | "orders" | "stay";
export type SheetName =
    | "access" | "wifi" | "contact" | "dnd" | "report" | "guide" | "latecheckout" | "event";

export interface DndState { on: boolean; until: string | null }
export interface ToastObj { msg: string; icon?: string }

/** Estrutura marcada como salão do café (horário + localização no mapa). */
export interface CafeVenue {
    id: string;
    name: string;
    openTime?: string;
    closeTime?: string;
    mapPin?: { lat: number; lng: number } | null;
}

export interface PortalCtxValue {
    stay: Stay;
    property: Property | null;
    code: string;
    lang: Lang;
    setLang: (l: Lang) => void;
    t: PortalStrings;
    tab: TabId;
    go: (tab: TabId) => void;
    /** Deep-link para as rotas existentes do portal (ex.: breakfast, structures). */
    push: (path: string) => void;
    openSheet: (name: SheetName, payload?: unknown) => void;
    closeSheet: () => void;
    toast: (msg: string, icon?: string) => void;
    dnd: DndState;
    setDnd: (d: DndState) => void;
    /** Liga/desliga o Não Perturbe via server action. hours=null retoma a limpeza. */
    handleDnd: (hours: number | null) => void;
    dndLoading: boolean;
    /** Salão do café (estrutura marcada) — horário e "como chegar". */
    cafeVenue: CafeVenue | null;
    /** Alvo de foco do mapa (ex.: "como chegar" ao café). Explorar consome e limpa. */
    mapFocus: { lat: number; lng: number } | null;
    setMapFocus: (f: { lat: number; lng: number } | null) => void;
}

export const PortalContext = createContext<PortalCtxValue | null>(null);

export function usePortal(): PortalCtxValue {
    const ctx = useContext(PortalContext);
    if (!ctx) throw new Error("usePortal deve ser usado dentro de <PortalShell>");
    return ctx;
}
