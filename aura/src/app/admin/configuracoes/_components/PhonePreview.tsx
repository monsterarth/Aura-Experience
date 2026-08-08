"use client";

// src/app/admin/configuracoes/_components/PhonePreview.tsx
//
// Mock do portal do hóspede com o tema em edição aplicado. Não renderiza o portal
// de verdade e não deve tentar: o valor aqui é ver contraste e arredondamento
// antes de publicar uma cor que o hóspede vai encarar.
import React from "react";
import { CheckCircle2, LayoutGrid } from "lucide-react";
import { PropertyTheme } from "@/types/aura";

/** HEX → "H S% L%", o formato que as CSS vars do projeto esperam. */
function hexToHSL(hex: string): string {
  hex = (hex || "#000000").replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;
  if ([r, g, b].some((n) => Number.isNaN(n))) return "0 0% 0%";
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function previewVars(theme: PropertyTheme): React.CSSProperties {
  const c = theme.colors;
  return {
    "--primary": hexToHSL(c.primary),
    "--primary-foreground": hexToHSL(c.onPrimary),
    "--secondary": hexToHSL(c.secondary),
    "--secondary-foreground": hexToHSL(c.onSecondary ?? c.textMain),
    "--background": hexToHSL(c.background),
    "--card": hexToHSL(c.surface),
    "--card-foreground": hexToHSL(c.textMain),
    "--foreground": hexToHSL(c.textMain),
    "--muted": hexToHSL(c.secondary),
    "--muted-foreground": hexToHSL(c.textMuted),
    "--accent": hexToHSL(c.accent),
    "--border": hexToHSL(c.accent),
    "--radius": theme.shape.radius,
  } as React.CSSProperties;
}

interface Props {
  theme: PropertyTheme;
  name: string;
  slogan?: string;
  logoUrl?: string;
}

export function PhonePreview({ theme, name, slogan, logoUrl }: Props) {
  const radius = theme.shape.radius;
  return (
    <div
      className="mx-auto w-[300px] h-[600px] rounded-[3rem] border-[8px] border-[#1a1a1a] shadow-2xl overflow-hidden relative flex flex-col bg-background transition-all duration-500"
      style={previewVars(theme)}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-[#1a1a1a] rounded-b-2xl z-50" />

      <div className="pt-9 pb-4 px-5 flex justify-between items-center bg-background z-10 border-b border-border/50">
        {logoUrl
          ? <img src={logoUrl} alt="" className="h-7 object-contain" />
          : (
            <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold text-xs">
              {name.charAt(0) || "A"}
            </div>
          )}
        <div className="w-7 h-7 rounded-full bg-secondary" />
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-background custom-scrollbar">
        <div className="space-y-1.5">
          <h2 className="text-2xl font-black text-foreground leading-tight">{name || "Nome da Propriedade"}</h2>
          <p className="text-muted-foreground text-xs">{slogan || "Slogan ou frase de efeito."}</p>
        </div>

        <div className="bg-card p-5 border border-border space-y-3 shadow-sm" style={{ borderRadius: radius }}>
          <div className="flex justify-between items-start">
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Sua Cabana</p>
              <h3 className="text-lg font-bold text-card-foreground">Bangalô 01</h3>
            </div>
            <div className="px-2 py-1 bg-secondary rounded text-[10px] font-bold text-secondary-foreground">ATIVO</div>
          </div>
          <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-primary" />
          </div>
          <button
            className="w-full py-2.5 bg-primary text-primary-foreground font-bold text-[11px] uppercase tracking-widest"
            style={{ borderRadius: `calc(${radius} - 4px)` }}
          >
            Ver Detalhes
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-secondary p-4 flex flex-col items-center justify-center gap-2 text-center aspect-square" style={{ borderRadius: radius }}>
            <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-primary shadow-sm"><CheckCircle2 size={16} /></div>
            <span className="text-[11px] font-bold text-secondary-foreground">Check-in</span>
          </div>
          <div className="bg-secondary p-4 flex flex-col items-center justify-center gap-2 text-center aspect-square opacity-50" style={{ borderRadius: radius }}>
            <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-muted-foreground shadow-sm"><LayoutGrid size={16} /></div>
            <span className="text-[11px] font-bold text-muted-foreground">Serviços</span>
          </div>
        </div>
      </div>
    </div>
  );
}
