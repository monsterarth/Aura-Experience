import type React from "react";
import type { Property } from "@/types/aura";

// Helpers de tema compartilhados pelos componentes do mapa (Tailwind shadcn:
// --primary, --foreground, --card…). Usado tanto na rota /map quanto no
// Portal 2.0, que precisa aplicar as mesmas CSS vars no subtree do mapa.

export function hexToHSL(hex: string): string {
    if (!hex) return "0 0% 0%";
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) hex = hex.split("").map(x => x + x).join("");
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function getThemeStyles(p?: Property | null): React.CSSProperties {
    const c = p?.theme?.colors;
    if (!c) return {};
    return {
        "--primary": hexToHSL(c.primary), "--primary-foreground": hexToHSL(c.onPrimary),
        "--secondary": hexToHSL(c.secondary), "--secondary-foreground": hexToHSL(c.onSecondary),
        "--background": hexToHSL(c.background), "--card": hexToHSL(c.surface),
        "--card-foreground": hexToHSL(c.textMain), "--foreground": hexToHSL(c.textMain),
        "--muted": hexToHSL(c.secondary), "--muted-foreground": hexToHSL(c.textMuted),
        "--accent": hexToHSL(c.accent), "--border": hexToHSL(c.accent),
        "--radius": p?.theme?.shape?.radius || "0.5rem",
    } as React.CSSProperties;
}
