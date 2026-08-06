"use client";

// src/components/admin/settings/ColorInput.tsx
// Seletor de cor do tema: amostra clicável + hex + explicação de ONDE a cor aparece.
// Extraído de admin/core/properties/[id] para as seções do hub de configurações.

interface Props {
  label: string;
  desc: string;
  value?: string;
  onChange: (v: string) => void;
}

export function ColorInput({ label, desc, value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <label className="text-sm font-bold text-foreground">{label}</label>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{value}</span>
      </div>
      <div className="flex gap-4 items-center">
        <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden border-2 border-border shadow-inner">
          <input
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className="absolute inset-0 w-[150%] h-[150%] -top-[25%] -left-[25%] cursor-pointer p-0 border-0"
          />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
        </div>
      </div>
    </div>
  );
}
