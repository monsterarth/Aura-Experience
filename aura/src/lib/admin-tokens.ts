// Tokens da identidade visual do admin — a linguagem de concierge/casamentos/hr
// (dark glass + gradiente roxo→teal), espelhada no "aura-design-system" do
// claude.ai/design. Página admin NOVA nasce nesta paleta (inline styles), não
// nas classes de tema genéricas — ver src/app/admin/CLAUDE.md.
//
// Origem: o objeto `T` de casamentos/_components/lib.tsx, promovido a módulo
// compartilhado (o lib re-exporta daqui — imports antigos continuam valendo).
export const T = {
  bg:          "#141414",
  card:        "#1c1c1c",
  /** Painel lateral (drawer) — um passo acima do bg, abaixo do card. */
  drawer:      "#171717",
  glass:       "rgba(255,255,255,0.035)",
  glass2:      "rgba(255,255,255,0.055)",
  glass3:      "rgba(255,255,255,0.08)",
  border:      "rgba(255,255,255,0.07)",
  border2:     "rgba(255,255,255,0.12)",
  text:        "#eef0f8",
  muted:       "rgba(238,240,248,0.42)",
  muted2:      "rgba(238,240,248,0.22)",
  g1:          "#9b6dff",
  g2:          "#4ec9d4",
  grad:        "linear-gradient(135deg,#9b6dff 0%,#4ec9d4 100%)",
  gradSoft:    "linear-gradient(135deg,rgba(155,109,255,0.15) 0%,rgba(78,201,212,0.15) 100%)",
  g1Border:    "rgba(155,109,255,0.22)",
  green:       "#2dd4bf", greenBg:   "rgba(45,212,191,0.08)",   greenBorder:  "rgba(45,212,191,0.22)",
  amber:       "#f59e0b", amberBg:   "rgba(245,158,11,0.08)",   amberBorder:  "rgba(245,158,11,0.22)",
  blue:        "#60a5fa", blueBg:    "rgba(96,165,250,0.08)",   blueBorder:   "rgba(96,165,250,0.22)",
  red:         "#f87171", redBg:     "rgba(248,113,113,0.08)",  redBorder:    "rgba(248,113,113,0.22)",
  violet:      "#c084fc", violetBg:  "rgba(192,132,252,0.08)",  violetBorder: "rgba(192,132,252,0.22)",
  rose:        "#fb7185", roseBg:    "rgba(251,113,133,0.08)",  roseBorder:   "rgba(251,113,133,0.22)",
  // Acentos que o design do CRM usa além do conjunto original de casamentos:
  emerald:     "#34d399", emeraldBg: "rgba(52,211,153,0.12)",   emeraldBorder: "rgba(52,211,153,0.25)",
  orange:      "#fb923c", orangeBg:  "rgba(251,146,60,0.10)",   orangeBorder: "rgba(251,146,60,0.25)",
};
