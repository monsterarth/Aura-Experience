// Tokens da identidade visual do admin — a linguagem de concierge/casamentos/hr
// (dark glass + gradiente roxo→teal), espelhada no "aura-design-system" do
// claude.ai/design. Página admin nasce nesta paleta — ver src/app/admin/CLAUDE.md.
//
// v2 (revamp 08/2026): os valores são VARIÁVEIS CSS (`var(--t-*)`) definidas em
// src/styles/aura-tokens.css, com paleta escura e clara — a certa entra pelo
// `data-theme` do `.aura-admin-root`. As chaves são as mesmas de sempre, então
// todo `T.card`/`T.muted`/`T.greenBg` existente continua valendo nos dois temas.
// Marca (g1/g2/grad) é literal: igual nos dois temas.
//
// REGRA: nunca concatenar alpha num token (`${T.green}18` virava hex; com
// var() quebra). Use `alpha(T.green, 10)` (color-mix) ou os tokens *Bg/*Border.
export const T = {
  bg:          "var(--t-bg)",
  bg2:         "var(--t-bg-2)",
  card:        "var(--t-card)",
  /** Painel lateral (drawer) — um passo acima do bg, abaixo do card. */
  drawer:      "var(--t-drawer)",
  /** Superfície elevada sobre o card (popover, menu). */
  elev:        "var(--t-elev)",
  glass:       "var(--t-glass)",
  glass2:      "var(--t-glass-2)",
  glass3:      "var(--t-glass-3)",
  border:      "var(--t-border)",
  border2:     "var(--t-border-2)",
  text:        "var(--t-text)",
  muted:       "var(--t-muted)",
  muted2:      "var(--t-muted-2)",
  /** Fundo escurecido atrás de modais/sheets. */
  overlay:     "var(--t-overlay)",
  /** Anel de foco (focus-visible). */
  ring:        "var(--t-ring)",
  /** Roxo da marca legível como TEXTO nos dois temas (no claro é mais escuro). */
  brandText:   "var(--t-brand-text)",
  // Marca — literal nos dois temas
  g1:          "#9b6dff",
  g2:          "#4ec9d4",
  grad:        "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
  gradSoft:    "linear-gradient(135deg,rgba(155,109,255,0.15) 0%,rgba(78,201,212,0.15) 100%)",
  g1Border:    "rgba(155,109,255,0.22)",
  // Semânticos: cor · bg · borda (no claro a cor de texto é mais escura)
  green:       "var(--t-green)",   greenBg:   "var(--t-green-bg)",   greenBorder:   "var(--t-green-border)",
  amber:       "var(--t-amber)",   amberBg:   "var(--t-amber-bg)",   amberBorder:   "var(--t-amber-border)",
  blue:        "var(--t-blue)",    blueBg:    "var(--t-blue-bg)",    blueBorder:    "var(--t-blue-border)",
  red:         "var(--t-red)",     redBg:     "var(--t-red-bg)",     redBorder:     "var(--t-red-border)",
  violet:      "var(--t-violet)",  violetBg:  "var(--t-violet-bg)",  violetBorder:  "var(--t-violet-border)",
  rose:        "var(--t-rose)",    roseBg:    "var(--t-rose-bg)",    roseBorder:    "var(--t-rose-border)",
  emerald:     "var(--t-emerald)", emeraldBg: "var(--t-emerald-bg)", emeraldBorder: "var(--t-emerald-border)",
  orange:      "var(--t-orange)",  orangeBg:  "var(--t-orange-bg)",  orangeBorder:  "var(--t-orange-border)",
  /** Gráficos — ver o bloco "Gráficos" em aura-tokens.css antes de mexer. */
  grid:        "var(--c-grid)",
} as const;

/**
 * Paleta de dataviz. `cat` é ORDEM FIXA — a 4ª série sempre usa cat[3], mesmo que
 * um filtro tenha escondido a 2ª: cor segue a entidade, nunca a posição no ranking.
 * `seq` é magnitude; seq[4] é o passo mais destacado contra a superfície nos dois
 * temas. Cores de estado ficam de fora de propósito (T.green/amber/red são
 * reservadas para estado e vêm sempre com rótulo, nunca sozinhas).
 */
export const CHART = {
  cat: ["var(--c-1)", "var(--c-2)", "var(--c-3)", "var(--c-4)"],
  seq: ["var(--c-seq-1)", "var(--c-seq-2)", "var(--c-seq-3)", "var(--c-seq-4)", "var(--c-seq-5)"],
  /** Passo da rampa por posição num ranking (0 = maior → o mais destacado). */
  rank: (i: number, n: number) => `var(--c-seq-${Math.max(1, 5 - Math.floor((i / Math.max(1, n - 1)) * 4))})`,
} as const;

export type Tone =
  | "brand" | "green" | "amber" | "blue" | "red" | "violet" | "rose" | "emerald" | "orange" | "neutral";

/**
 * Transparência sobre qualquer cor/token: `alpha(T.green, 10)` ≈ o antigo `${hex}18`.
 * Usa color-mix (Chrome 111+ / Safari 16.4+ — o AdminTopbar já depende disso).
 */
export const alpha = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** Trio cor/bg/borda de um tom semântico (para KpiCard, Pill, tiles de ícone…). */
export function tone(name: Tone): { color: string; bg: string; border: string } {
  switch (name) {
    case "brand":   return { color: T.brandText, bg: alpha(T.g1, 10), border: T.g1Border };
    case "neutral": return { color: T.muted, bg: T.glass2, border: T.border2 };
    case "green":   return { color: T.green,   bg: T.greenBg,   border: T.greenBorder };
    case "amber":   return { color: T.amber,   bg: T.amberBg,   border: T.amberBorder };
    case "blue":    return { color: T.blue,    bg: T.blueBg,    border: T.blueBorder };
    case "red":     return { color: T.red,     bg: T.redBg,     border: T.redBorder };
    case "violet":  return { color: T.violet,  bg: T.violetBg,  border: T.violetBorder };
    case "rose":    return { color: T.rose,    bg: T.roseBg,    border: T.roseBorder };
    case "emerald": return { color: T.emerald, bg: T.emeraldBg, border: T.emeraldBorder };
    case "orange":  return { color: T.orange,  bg: T.orangeBg,  border: T.orangeBorder };
  }
}

/**
 * Hex cru por tema — só para onde var() não entra (SVG/canvas/recharts, e-mail,
 * canvas de etiqueta). Em estilos DOM use sempre `T.*`.
 */
export const T_HEX = {
  dark: {
    bg: "#141414", card: "#1c1c1c", text: "#eef0f8", muted: "rgba(238,240,248,0.5)",
    g1: "#9b6dff", g2: "#4ec9d4", brandText: "#9b6dff",
    green: "#2dd4bf", amber: "#f59e0b", blue: "#60a5fa", red: "#f87171",
    violet: "#c084fc", rose: "#fb7185", emerald: "#34d399", orange: "#fb923c",
    border: "rgba(255,255,255,0.07)", glass: "rgba(255,255,255,0.035)",
  },
  light: {
    bg: "#f4f5f7", card: "#ffffff", text: "#111827", muted: "rgba(17,24,39,0.6)",
    g1: "#9b6dff", g2: "#4ec9d4", brandText: "#7a4ee6",
    green: "#0f766e", amber: "#b45309", blue: "#2563eb", red: "#dc2626",
    violet: "#7c3aed", rose: "#e11d48", emerald: "#047857", orange: "#c2410c",
    border: "rgba(15,23,42,0.1)", glass: "rgba(15,23,42,0.04)",
  },
} as const;

export type ThemeName = keyof typeof T_HEX;
