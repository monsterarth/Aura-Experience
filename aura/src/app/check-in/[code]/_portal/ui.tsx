"use client";

import React from "react";

/* ============================================================
   Portal do Hóspede — ícones (stroke, grid 24) + átomos de UI.
   Portado do protótipo de design (theme.jsx). Estilos inline que
   consomem as CSS vars de _portal/theme.ts (var(--brand)…).
   ============================================================ */

type IconName = string;

interface IconProps {
    n: IconName;
    s?: number;
    c?: string;
    w?: number;
    fill?: string;
    style?: React.CSSProperties;
}

export function Icon({ n, s = 20, c = "currentColor", w = 1.8, fill = "none", style }: IconProps) {
    const P: Record<string, React.ReactNode> = {
        arrowleft: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
        arrowright: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
        chevright: <polyline points="9 6 15 12 9 18" />,
        chevleft: <polyline points="15 6 9 12 15 18" />,
        chevdown: <polyline points="6 9 12 15 18 9" />,
        chevup: <polyline points="6 15 12 9 18 15" />,
        x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
        plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
        minus: <line x1="5" y1="12" x2="19" y2="12" />,
        check: <polyline points="20 6 9 17 4 12" />,
        checkcircle: <><circle cx="12" cy="12" r="9" /><polyline points="8.5 12 11 14.5 15.5 9.5" /></>,
        home: <><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
        compass: <><circle cx="12" cy="12" r="9" /><polygon points="16 8 13.5 13.5 8 16 10.5 10.5 16 8" /></>,
        bag: <><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></>,
        user: <><path d="M20 21v-1a6 6 0 00-12 0v1" /><circle cx="12" cy="8" r="4" /></>,
        coffee: <><path d="M4 9h12v5a4 4 0 01-4 4H8a4 4 0 01-4-4z" /><path d="M16 10h2a2 2 0 010 4h-2" /><path d="M7 4c0 1-1 1-1 2M11 4c0 1-1 1-1 2" /></>,
        calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M3 9.5h18" /><path d="M8 2.5v4M16 2.5v4" /></>,
        pin: <><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
        map: <><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></>,
        bell: <><path d="M5 18h14M12 4a5 5 0 015 5c0 4 2 5 2 5H5s2-1 2-5a5 5 0 015-5z" /><path d="M10 21a2 2 0 004 0" /></>,
        wifi: <><path d="M2 8.5a15 15 0 0120 0" /><path d="M5 12a10 10 0 0114 0" /><path d="M8.5 15.5a5 5 0 017 0" /><circle cx="12" cy="19" r="1" /></>,
        key: <><circle cx="8" cy="8" r="4" /><path d="M11 11l8 8M16 16l2-2M19 19l2-2" /></>,
        lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
        book: <><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 19a2 2 0 012-2h13" /></>,
        ticket: <><path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4z" /><line x1="14" y1="6" x2="14" y2="18" strokeDasharray="2 2" /></>,
        moon: <path d="M20 14.5A8 8 0 119.5 4 6.5 6.5 0 0020 14.5z" />,
        flag: <><path d="M5 21V4" /><path d="M5 4.5s1.2-1 4-1 4 1.5 7 1.5c1.5 0 2.5-.5 2.5-.5v9s-1 .5-2.5.5c-3 0-4-1.5-7-1.5s-4 1-4 1" /></>,
        star: <polygon points="12 3.2 14.6 8.5 20.4 9.35 16.2 13.45 17.2 19.25 12 16.55 6.8 19.25 7.8 13.45 3.6 9.35 9.4 8.5" />,
        message: <path d="M21 12a8 8 0 01-11.6 7.1L4 21l1.9-5.4A8 8 0 1121 12z" />,
        phone: <path d="M5 4h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5V21a1 1 0 01-1 1A16 16 0 014 6a1 1 0 011-1z" />,
        sparkle: <><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="M18.5 14l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" /></>,
        leaf: <><path d="M11 20A7 7 0 014 13c0-4 3-9 9-9 4 0 7 0 7 0s0 11-9 11z" /><path d="M11 20c0-5 2-8 6-11" /></>,
        droplet: <path d="M12 3s6 6 6 10a6 6 0 01-12 0c0-4 6-10 6-10z" />,
        flame: <path d="M12 3s4 3.5 4 8a4 4 0 01-8 0c0-1.5.6-2.6 1.2-3.4.4 1.2 1.3 1.6 1.8 1.4C10 7.5 9 5.5 12 3z" />,
        spa: <><path d="M12 3l1.6 4.2L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.8z" /><path d="M6 19c2 0 4-1 6-1s4 1 6 1" /></>,
        utensils: <><path d="M5 3v7a2 2 0 002 2v9M5 3v4M8 3v4" /><path d="M16 3c-1.5 0-3 1.5-3 5s1.5 4 3 4v9" /></>,
        umbrella: <><path d="M12 3a9 9 0 019 8H3a9 9 0 019-8z" /><line x1="12" y1="11" x2="12" y2="20" /><path d="M12 20a2 2 0 003-1" /></>,
        waves: <><path d="M3 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" /><path d="M3 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" /><path d="M3 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" /></>,
        car: <><path d="M5 12l1.5-4.5A2 2 0 018.4 6h7.2a2 2 0 011.9 1.5L19 12" /><path d="M4 12h16v5H4z" /><circle cx="7.5" cy="17" r="1.3" /><circle cx="16.5" cy="17" r="1.3" /></>,
        clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
        route: <><circle cx="6" cy="19" r="2.4" /><circle cx="18" cy="5" r="2.4" /><path d="M8 19h7a4 4 0 000-8H9a4 4 0 010-8h6" /></>,
        qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M20 14v3M14 20h3M20 20h1" /></>,
        copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>,
        info: <><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><circle cx="12" cy="8" r=".6" fill={c} /></>,
        sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></>,
        cloud: <path d="M7 18a4 4 0 010-8 5 5 0 019.6-1.3A4 4 0 0117 18z" />,
        package: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>,
        gift: <><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v7a1 1 0 001 1h12a1 1 0 001-1v-7" /><path d="M12 8v13" /><path d="M12 8H8.2a2.2 2.2 0 110-4.4C11 3.6 12 8 12 8z" /><path d="M12 8h3.8a2.2 2.2 0 100-4.4C13 3.6 12 8 12 8z" /></>,
        edit: <><path d="M4 20h4l10-10-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
        bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
        shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><polyline points="9 12 11 14 15 10" /></>,
        paw: <><circle cx="6.5" cy="11" r="1.6" /><circle cx="10" cy="8" r="1.6" /><circle cx="14" cy="8" r="1.6" /><circle cx="17.5" cy="11" r="1.6" /><path d="M8 16c0-2 1.6-3.2 4-3.2S16 14 16 16s-1.6 3-4 3-4-1-4-3z" /></>,
        camera: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l1.5-2.5h5L16 7" /></>,
        dot: <circle cx="12" cy="12" r="3.5" fill={c} stroke="none" />,
        refresh: <><path d="M3 12a9 9 0 0115.5-6.3L21 8" /><path d="M21 4v4h-4" /><path d="M21 12a9 9 0 01-15.5 6.3L3 16" /><path d="M3 20v-4h4" /></>,
        list: <><line x1="8" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="8" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
        heart: <path d="M12 20s-7-4.3-9.3-9C1.4 8.4 2.6 5 6 5c2 0 3.2 1.3 4 2.4C10.8 6.3 12 5 14 5c3.4 0 4.6 3.4 3.3 6-2.3 4.7-9.3 9-9.3 9z" />,
        binoculars: <><path d="M5 7a2 2 0 012-2h1a2 2 0 012 2v3H5z" /><path d="M19 7a2 2 0 00-2-2h-1a2 2 0 00-2 2v3h5z" /><path d="M5 10a4 4 0 108 0M11 10h2M11 10a4 4 0 108 0" /></>,
        fork: <><path d="M5 3v6a2 2 0 002 2v10" /><path d="M9 3v6a2 2 0 01-2 2" /><path d="M16 3c-1.5 1-2 3-2 5s.5 3 2 3v10" /></>,
        search: <><circle cx="11" cy="11" r="7" /><line x1="20.5" y1="20.5" x2="16.5" y2="16.5" /></>,
    };
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke={c}
            strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}>
            {P[n] || null}
        </svg>
    );
}

/* ============================================================
   Mapas de tom semântico (reaproveitados pelos átomos/telas)
   ============================================================ */
export const toneColor: Record<string, string> = {
    brand: "var(--brand)", green: "var(--green)", gold: "var(--gold)",
    clay: "var(--clay)", plum: "var(--plum)", neutral: "var(--muted)", danger: "var(--clay)",
};
export const toneBg: Record<string, string> = {
    brand: "var(--brand-soft)", green: "var(--green-soft)", gold: "var(--gold-soft)",
    clay: "var(--clay-soft)", plum: "#E8DCE6", neutral: "var(--surface-alt)", danger: "var(--clay-soft)",
};

/* ============================================================
   ÁTOMOS
   ============================================================ */
export function Card({ children, style, onClick, pad = 16, ...rest }: {
    children?: React.ReactNode; style?: React.CSSProperties; onClick?: () => void; pad?: number;
} & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div onClick={onClick} {...rest} style={{
            background: "var(--surface)", borderRadius: 22,
            border: "1px solid var(--line)", boxShadow: "var(--sh-xs)",
            padding: pad, ...style,
        }}>{children}</div>
    );
}

export function SectionTitle({ children, right, style }: {
    children?: React.ReactNode; right?: React.ReactNode; style?: React.CSSProperties;
}) {
    return (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "2px 2px 12px", ...style }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>{children}</h2>
            {right}
        </div>
    );
}

export function PrimaryBtn({ children, onClick, disabled, icon, style, tone }: {
    children?: React.ReactNode; onClick?: () => void; disabled?: boolean; icon?: string; style?: React.CSSProperties; tone?: "ink" | "brand";
}) {
    const bg = tone === "ink" ? "var(--ink)" : "var(--brand)";
    return (
        <button onClick={onClick} disabled={disabled} style={{
            width: "100%", border: "none", cursor: disabled ? "not-allowed" : "pointer",
            background: bg, color: "#fff", borderRadius: 16, padding: "15px 18px",
            fontFamily: "inherit", fontSize: 15, fontWeight: 700, letterSpacing: ".01em",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
            opacity: disabled ? .42 : 1, transition: "transform .12s, opacity .15s",
            boxShadow: disabled ? "none" : "0 10px 22px -12px rgba(110,70,33,.7)", ...style,
        }}
            onPointerDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(.975)"; }}
            onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onPointerLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
            {icon && <Icon n={icon} s={19} c="#fff" w={2} />}{children}
        </button>
    );
}

export function GhostBtn({ children, onClick, icon, style }: {
    children?: React.ReactNode; onClick?: () => void; icon?: string; style?: React.CSSProperties;
}) {
    return (
        <button onClick={onClick} style={{
            border: "1px solid var(--line)", cursor: "pointer", background: "var(--surface)",
            color: "var(--ink)", borderRadius: 14, padding: "12px 16px", fontFamily: "inherit",
            fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, width: "100%", ...style,
        }}>
            {icon && <Icon n={icon} s={17} c="var(--brand)" />}{children}
        </button>
    );
}

export function IconBtn({ n, onClick, s = 20, size = 40, tone = "soft", style, title }: {
    n: string; onClick?: () => void; s?: number; size?: number; tone?: "soft" | "brand" | "plain" | "glass"; style?: React.CSSProperties; title?: string;
}) {
    const tones = {
        soft: { bg: "var(--surface-alt)", c: "var(--ink)", b: "var(--line)" },
        brand: { bg: "var(--brand)", c: "#fff", b: "var(--brand)" },
        plain: { bg: "transparent", c: "var(--ink)", b: "transparent" },
        glass: { bg: "rgba(255,255,255,.6)", c: "var(--ink)", b: "rgba(255,255,255,.5)" },
    }[tone];
    return (
        <button onClick={onClick} title={title} style={{
            width: size, height: size, borderRadius: size > 30 ? 13 : 9, flexShrink: 0,
            background: tones.bg, border: `1px solid ${tones.b}`, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: tones.c, backdropFilter: tone === "glass" ? "blur(10px)" : "none", ...style,
        }}>
            <Icon n={n} s={s} c={tones.c} />
        </button>
    );
}

export function Chip({ children, active, onClick, icon, style }: {
    children?: React.ReactNode; active?: boolean; onClick?: () => void; icon?: string; style?: React.CSSProperties;
}) {
    return (
        <button onClick={onClick} style={{
            border: active ? "1px solid var(--brand)" : "1px solid var(--line)",
            background: active ? "var(--brand)" : "var(--surface)",
            color: active ? "#fff" : "var(--ink-soft)", borderRadius: 999,
            padding: "8px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center",
            gap: 6, flexShrink: 0, transition: "background .15s, color .15s", ...style,
        }}>
            {icon && <Icon n={icon} s={15} c={active ? "#fff" : "var(--brand)"} />}{children}
        </button>
    );
}

export function Tag({ children, tone = "brand", style }: {
    children?: React.ReactNode; tone?: string; style?: React.CSSProperties;
}) {
    const map: Record<string, [string, string]> = {
        brand: ["var(--brand-soft)", "var(--brand-deep)"],
        gold: ["var(--gold-soft)", "#8a6512"],
        green: ["var(--green-soft)", "#2c574f"],
        clay: ["var(--clay-soft)", "#8a3c1c"],
        neutral: ["var(--surface-alt)", "var(--muted)"],
    };
    const [bg, fg] = map[tone] || map.brand;
    return (
        <span style={{
            background: bg, color: fg, borderRadius: 999, padding: "3px 9px",
            fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
            display: "inline-flex", alignItems: "center", gap: 4, ...style,
        }}>{children}</span>
    );
}

export function QtyStepper({ value, onChange, min = 0, max = 99, size = "md" }: {
    value: number; onChange: (v: number) => void; min?: number; max?: number; size?: "sm" | "md";
}) {
    const h = size === "sm" ? 32 : 38;
    return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 2, background: "var(--surface-alt)", borderRadius: 12, padding: 3, border: "1px solid var(--line)" }}>
            <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} style={{ width: h, height: h, borderRadius: 9, border: "none", background: value <= min ? "transparent" : "var(--surface)", cursor: value <= min ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink)", opacity: value <= min ? .35 : 1 }}>
                <Icon n="minus" s={16} />
            </button>
            <span style={{ minWidth: 24, textAlign: "center", fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>{value}</span>
            <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} style={{ width: h, height: h, borderRadius: 9, border: "none", background: value >= max ? "transparent" : "var(--surface)", cursor: value >= max ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brand)", opacity: value >= max ? .35 : 1 }}>
                <Icon n="plus" s={16} w={2.2} />
            </button>
        </div>
    );
}

// Placeholder visual quente para imagens de área/cabana (sobe foto depois)
export function Photo({ icon = "leaf", h = 120, tone, label, style, children }: {
    icon?: string; h?: number; tone?: string; label?: string; style?: React.CSSProperties; children?: React.ReactNode;
}) {
    const map: Record<string, [string, string]> = {
        brand: ["#C99B61", "#8A5A2B"], green: ["#6FA199", "#3F7D74"],
        gold: ["#E0BB6A", "#C9962F"], clay: ["#D08158", "#B5562F"],
        plum: ["#A88AA3", "#8A6A86"], cream: ["#E8D9BE", "#C9A86A"],
    };
    const tones = map[tone || "brand"] || map.brand;
    return (
        <div style={{
            height: h, borderRadius: 16, position: "relative", overflow: "hidden",
            background: `linear-gradient(140deg, ${tones[0]}, ${tones[1]})`, ...style,
        }}>
            <div style={{ position: "absolute", inset: 0, opacity: .16, backgroundImage: "radial-gradient(circle at 1.5px 1.5px, rgba(255,255,255,.9) 1px, transparent 0)", backgroundSize: "11px 11px" }} />
            <div style={{ position: "absolute", right: -10, bottom: -10, opacity: .26 }}>
                <Icon n={icon} s={h * 0.72} c="#fff" w={1.3} />
            </div>
            {label && <div style={{ position: "absolute", left: 12, bottom: 11, color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textShadow: "0 1px 6px rgba(0,0,0,.3)" }}>{label}</div>}
            {children}
        </div>
    );
}

export function Avatar({ name, size = 38, tone = "brand" }: { name?: string; size?: number; tone?: string }) {
    const initials = (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    const map: Record<string, [string, string]> = {
        brand: ["#EAD9C2", "#8A5A2B"], gold: ["#F2E2BD", "#a87c1f"], green: ["#D2E5E0", "#3F7D74"],
    };
    const tones = map[tone] || map.brand;
    return (
        <div style={{ width: size, height: size, borderRadius: size * .32, background: tones[0], color: tones[1], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * .36, flexShrink: 0 }}>{initials}</div>
    );
}

// Fonte display (Instrument Serif) — usada em títulos especiais.
export const DISPLAY_FONT = "var(--font-portal-display), 'Instrument Serif', serif";

/** Title-case p/ nomes vindos do banco em caixa alta (CELSO → Celso). */
export function titleCase(s?: string): string {
    if (!s) return "";
    return s.trim().toLowerCase().split(/\s+/).map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}
