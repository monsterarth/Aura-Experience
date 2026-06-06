"use client";

import React, { useMemo } from "react";
import { X, MapPin } from "lucide-react";
import { MapLang } from "../types";

interface GpsPermissionHelpProps {
    lang: MapLang;
    onClose: () => void;
}

// Detecta plataforma/browser para exibir as instruções corretas.
function detectPlatform(): "ios-safari" | "ios-chrome" | "android-chrome" | "android-other" | "desktop" {
    if (typeof navigator === "undefined") return "desktop";
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isChrome = /Chrome/i.test(ua) && !/Edg/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !isChrome;

    if (isIOS && isSafari) return "ios-safari";
    if (isIOS && isChrome) return "ios-chrome";
    if (isAndroid && isChrome) return "android-chrome";
    if (isAndroid) return "android-other";
    return "desktop";
}

const CONTENT: Record<string, Record<MapLang, { title: string; steps: string[]; note?: string }>> = {
    "ios-safari": {
        pt: {
            title: "Ativar localização no Safari (iOS)",
            steps: [
                "Abra o app Ajustes do iPhone",
                "Role e toque em Safari",
                "Toque em Localização",
                'Escolha "Enquanto Usando o App" ou "Perguntar"',
                "Volte aqui e toque em Me Localizar novamente",
            ],
        },
        en: {
            title: "Enable location in Safari (iOS)",
            steps: [
                "Open the iPhone Settings app",
                "Scroll and tap Safari",
                "Tap Location",
                'Choose "While Using the App" or "Ask"',
                "Come back here and tap Locate me again",
            ],
        },
        es: {
            title: "Activar ubicación en Safari (iOS)",
            steps: [
                "Abre la app Ajustes del iPhone",
                "Desplázate y toca Safari",
                "Toca Ubicación",
                'Elige "Mientras se usa la app" o "Preguntar"',
                "Vuelve aquí y toca Ubicarme de nuevo",
            ],
        },
    },
    "ios-chrome": {
        pt: {
            title: "Ativar localização no Chrome (iOS)",
            steps: [
                "Abra o app Ajustes do iPhone",
                "Role e toque em Chrome",
                "Toque em Localização",
                'Escolha "Enquanto Usando o App"',
                "Volte aqui e toque em Me Localizar novamente",
            ],
        },
        en: {
            title: "Enable location in Chrome (iOS)",
            steps: [
                "Open the iPhone Settings app",
                "Scroll and tap Chrome",
                "Tap Location",
                'Choose "While Using the App"',
                "Come back here and tap Locate me again",
            ],
        },
        es: {
            title: "Activar ubicación en Chrome (iOS)",
            steps: [
                "Abre la app Ajustes del iPhone",
                "Desplázate y toca Chrome",
                "Toca Ubicación",
                'Elige "Mientras se usa la app"',
                "Vuelve aquí y toca Ubicarme de nuevo",
            ],
        },
    },
    "android-chrome": {
        pt: {
            title: "Ativar localização no Chrome (Android)",
            steps: [
                "Toque no ícone de cadeado 🔒 na barra de endereços",
                'Toque em "Permissões"',
                'Em Localização, selecione "Permitir"',
                "Recarregue a página",
            ],
            note: 'Se não aparecer o cadeado, toque nos três pontos ⋮ > Configurações do site > Localização > "Permitir".',
        },
        en: {
            title: "Enable location in Chrome (Android)",
            steps: [
                "Tap the padlock 🔒 icon in the address bar",
                'Tap "Permissions"',
                'Under Location, select "Allow"',
                "Reload the page",
            ],
            note: "If you don't see the padlock, tap ⋮ > Site settings > Location > Allow.",
        },
        es: {
            title: "Activar ubicación en Chrome (Android)",
            steps: [
                "Toca el ícono de candado 🔒 en la barra de direcciones",
                'Toca "Permisos"',
                'En Ubicación, selecciona "Permitir"',
                "Recarga la página",
            ],
            note: 'Si no aparece el candado, toca ⋮ > Configuración del sitio > Ubicación > "Permitir".',
        },
    },
    "android-other": {
        pt: {
            title: "Ativar localização no navegador",
            steps: [
                "Toque no ícone de cadeado ou ⓘ na barra de endereços",
                "Procure por Permissões ou Localização",
                'Selecione "Permitir"',
                "Recarregue a página",
            ],
        },
        en: {
            title: "Enable location in browser",
            steps: [
                "Tap the padlock or ⓘ icon in the address bar",
                "Look for Permissions or Location",
                'Select "Allow"',
                "Reload the page",
            ],
        },
        es: {
            title: "Activar ubicación en el navegador",
            steps: [
                "Toca el candado o ⓘ en la barra de direcciones",
                "Busca Permisos o Ubicación",
                'Selecciona "Permitir"',
                "Recarga la página",
            ],
        },
    },
    "desktop": {
        pt: {
            title: "Ativar localização no navegador",
            steps: [
                "Clique no ícone de cadeado 🔒 na barra de endereços",
                'Clique em "Permissões do site"',
                'Em Localização, selecione "Permitir"',
                "Recarregue a página",
            ],
        },
        en: {
            title: "Enable location in browser",
            steps: [
                "Click the padlock 🔒 in the address bar",
                'Click "Site settings"',
                'Under Location, select "Allow"',
                "Reload the page",
            ],
        },
        es: {
            title: "Activar ubicación en el navegador",
            steps: [
                "Haz clic en el candado 🔒 de la barra de direcciones",
                'Haz clic en "Configuración del sitio"',
                'En Ubicación, selecciona "Permitir"',
                "Recarga la página",
            ],
        },
    },
};

export function GpsPermissionHelp({ lang, onClose }: GpsPermissionHelpProps) {
    const platform = useMemo(detectPlatform, []);
    const content = CONTENT[platform]?.[lang] ?? CONTENT["android-chrome"][lang];

    return (
        <div className="fixed inset-0 z-[2100] flex items-end justify-center" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50 animate-in fade-in" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-background rounded-t-3xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-300 space-y-5">
                {/* Handle */}
                <div className="w-10 h-1 rounded-full bg-border mx-auto absolute left-1/2 -translate-x-1/2 top-2" />

                <div className="flex items-start justify-between gap-3 pt-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                            <MapPin size={20} className="text-amber-500" />
                        </div>
                        <h2 className="font-black text-base leading-snug">{content.title}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary shrink-0">
                        <X size={18} />
                    </button>
                </div>

                <ol className="space-y-3">
                    {content.steps.map((step, i) => (
                        <li key={i} className="flex gap-3 items-start">
                            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                                {i + 1}
                            </span>
                            <span className="text-sm text-foreground/90 leading-snug">{step}</span>
                        </li>
                    ))}
                </ol>

                {content.note && (
                    <p className="text-xs text-muted-foreground bg-secondary rounded-xl px-3 py-2.5 leading-relaxed">
                        {content.note}
                    </p>
                )}

                <button
                    onClick={onClose}
                    className="w-full py-3.5 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest text-sm"
                >
                    OK, entendi
                </button>
            </div>
        </div>
    );
}
