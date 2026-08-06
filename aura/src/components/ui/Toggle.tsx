"use client";

// src/components/ui/Toggle.tsx
// O switch do sistema. Existia só dentro de profile/SettingsView; as telas de
// configuração usavam <input type="checkbox"> solto, então o mesmo gesto tinha
// duas aparências. Este é o único — não criar outro.
import { Loader2 } from "lucide-react";

interface Props {
  checked: boolean;
  onChange?: (next: boolean) => void;
  loading?: boolean;
  disabled?: boolean;
  /** Rótulo acessível quando o switch não vem acompanhado de texto visível. */
  label?: string;
}

export function Toggle({ checked, onChange, loading, disabled, label }: Props) {
  const interactive = !!onChange && !disabled && !loading;

  const visual = (
    <div
      className="relative flex items-center w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200"
      style={{ background: checked ? "linear-gradient(135deg,#9b6dff,#4ec9d4)" : "var(--border)" }}
    >
      {loading ? (
        <Loader2 size={14} className="absolute text-white animate-spin transition-all duration-200" style={{ left: checked ? 22 : 3 }} />
      ) : (
        <div className="absolute w-[18px] h-[18px] rounded-full bg-white shadow transition-all duration-200" style={{ left: checked ? 23 : 3 }} />
      )}
    </div>
  );

  // Sem onChange é decorativo: quem controla o clique é a linha inteira (SettingRow).
  if (!onChange) return visual;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={!interactive}
      onClick={() => onChange(!checked)}
      className="disabled:opacity-60"
    >
      {visual}
    </button>
  );
}
