"use client";

// src/app/admin/configuracoes/_components/SaveBar.tsx
// Barra de salvar da seção. Só aparece quando há alteração pendente — barra
// permanente vira paisagem e a pessoa deixa de reparar que não salvou.
// No celular é a BottomActionBar do kit (fixa acima da tab bar); no desktop, uma linha no fim.
import { Save, Undo2 } from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { BottomActionBar, Button } from "@/components/aura";

interface Props {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  /** Aviso extra antes de salvar (ex.: campo que derruba o portal se errado). */
  warning?: React.ReactNode;
}

export function SaveBar({ dirty, saving, onSave, onReset, warning }: Props) {
  if (!dirty) return null;
  return (
    <BottomActionBar>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", width: "100%" }}>
        <div style={{ minWidth: 0, flex: "1 1 160px" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.text }}>Alterações não salvas</p>
          {warning && <p style={{ margin: "2px 0 0", fontSize: 11, color: T.amber, lineHeight: 1.4 }}>{warning}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Button variant="ghost" icon={Undo2} onClick={onReset} disabled={saving}>Descartar</Button>
          <Button variant="primary" icon={Save} onClick={onSave} loading={saving} loadingText="Salvando…">Salvar</Button>
        </div>
      </div>
    </BottomActionBar>
  );
}
