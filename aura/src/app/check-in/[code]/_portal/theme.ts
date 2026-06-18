import type React from "react";
import type { Property } from "@/types/aura";

/* ============================================================
   Portal do Hóspede — camada de tema "camaleão"
   Deriva os tokens do design (paleta terrosa) a partir do
   property.theme, com fallback para a baseline quente. Os átomos
   em ui.tsx consomem essas CSS vars (var(--brand), var(--ink)…).
   ============================================================ */

// Baseline quente (Fazenda do Rosa) — usada quando a propriedade não
// define uma cor equivalente. É a "pele" padrão do portal Aura.
const BASE = {
    bg: "#EFE7DA",
    bg2: "#E7DCC9",
    surface: "#FBF7F0",
    surfaceAlt: "#F3EADC",
    ink: "#2B2620",
    inkSoft: "#5C5347",
    muted: "#938775",
    faint: "#B3A892",
    line: "#E3D8C6",
    lineSoft: "#EDE4D6",
    brand: "#8A5A2B",
    brandDeep: "#6E4621",
    brandSoft: "#EAD9C2",
    gold: "#C9962F",
    goldSoft: "#F2E2BD",
    green: "#3F7D74",
    greenSoft: "#D2E5E0",
    clay: "#B5562F",
    claySoft: "#F3DBCD",
    plum: "#8A6A86",
    shXs: "0 2px 8px -4px rgba(63,44,20,0.18)",
    shSm: "0 8px 22px -12px rgba(63,44,20,0.30)",
} as const;

// ---- helpers de cor (hex) ----
function clean(hex?: string): string | null {
    if (!hex) return null;
    let h = hex.trim().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
    return "#" + h.toLowerCase();
}

function toRgb(hex: string): [number, number, number] {
    const h = hex.replace(/^#/, "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
    const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
}

// Mistura linear de duas cores. amount = 0 → a; 1 → b.
function mix(a: string, b: string, amount: number): string {
    const [r1, g1, b1] = toRgb(a);
    const [r2, g2, b2] = toRgb(b);
    return toHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
}

const lighten = (hex: string, amt: number) => mix(hex, "#ffffff", amt);
const darken = (hex: string, amt: number) => mix(hex, "#000000", amt);
// Pastel suave (fundos *-soft) — bem perto do branco.
const soft = (hex: string, amt = 0.78) => mix(hex, "#ffffff", amt);

/**
 * Retorna as CSS custom properties do portal a partir do tema da
 * propriedade. Aplicar no wrapper raiz do portal — escopo isolado,
 * não interfere nos tokens shadcn do restante do app.
 */
export function getPortalThemeVars(property?: Property | null): React.CSSProperties {
    const c = property?.theme?.colors;

    const brand = clean(c?.primary) ?? BASE.brand;
    const ink = clean(c?.textMain) ?? BASE.ink;
    const muted = clean(c?.textMuted) ?? BASE.muted;
    const bg = clean(c?.background) ?? BASE.bg;
    const surface = clean(c?.surface) ?? BASE.surface;
    const line = clean(c?.accent) ?? BASE.line;
    const green = clean(c?.success) ?? BASE.green;
    const clay = clean(c?.error) ?? BASE.clay;

    // Quando a propriedade traz a cor base, derivamos as variações;
    // caso contrário usamos exatamente o token da baseline.
    const brandDeep = c?.primary ? darken(brand, 0.18) : BASE.brandDeep;
    const brandSoft = c?.primary ? soft(brand, 0.74) : BASE.brandSoft;
    const inkSoft = c?.textMain ? lighten(ink, 0.22) : BASE.inkSoft;
    const faint = c?.textMuted ? lighten(muted, 0.28) : BASE.faint;
    const bg2 = c?.background ? darken(bg, 0.05) : BASE.bg2;
    const surfaceAlt = c?.surface ? mix(surface, bg, 0.55) : BASE.surfaceAlt;
    const lineSoft = c?.accent ? lighten(line, 0.4) : BASE.lineSoft;
    const greenSoft = c?.success ? soft(green, 0.8) : BASE.greenSoft;
    const claySoft = c?.error ? soft(clay, 0.8) : BASE.claySoft;

    const vars: Record<string, string> = {
        "--bg": bg,
        "--bg2": bg2,
        "--surface": surface,
        "--surface-alt": surfaceAlt,
        "--ink": ink,
        "--ink-soft": inkSoft,
        "--muted": muted,
        "--faint": faint,
        "--line": line,
        "--line-soft": lineSoft,
        "--brand": brand,
        "--brand-deep": brandDeep,
        "--brand-soft": brandSoft,
        // Acentos semânticos: gold/plum não têm equivalente no tema da
        // propriedade — mantêm a baseline quente (TODO: expor no schema
        // de tema se quisermos torná-los configuráveis por propriedade).
        "--gold": BASE.gold,
        "--gold-soft": BASE.goldSoft,
        "--green": green,
        "--green-soft": greenSoft,
        "--clay": clay,
        "--clay-soft": claySoft,
        "--plum": BASE.plum,
        "--sh-xs": BASE.shXs,
        "--sh-sm": BASE.shSm,
    };

    return vars as unknown as React.CSSProperties;
}
