"use client";

// src/components/ui/Toggle.tsx
// Adaptador: o switch do sistema agora é o `Switch` do kit (src/components/aura).
// Mantido para os importadores antigos (configuracoes/*, SettingsView) — mesma API.
import { Switch } from "@/components/aura/Field";

interface Props {
  checked: boolean;
  onChange?: (next: boolean) => void;
  loading?: boolean;
  disabled?: boolean;
  /** Rótulo acessível quando o switch não vem acompanhado de texto visível. */
  label?: string;
}

export function Toggle({ checked, onChange, loading, disabled, label }: Props) {
  return <Switch checked={checked} onChange={onChange} loading={loading} disabled={disabled} label={label} />;
}
