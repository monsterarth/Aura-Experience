"use client";

// src/app/admin/configuracoes/_components/SaveBar.tsx
// Barra fixa no rodapé da seção. Só aparece quando há alteração pendente — barra
// permanente vira paisagem e a pessoa deixa de reparar que não salvou.
import { Loader2, Save, Undo2 } from "lucide-react";

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
    <div className="sticky bottom-4 z-20 mt-6">
      <div className="flex items-center justify-between gap-4 flex-wrap bg-card border border-border rounded-2xl shadow-lg px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Alterações não salvas</p>
          {warning && <p className="text-[11px] text-amber-500 mt-0.5 leading-snug">{warning}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onReset}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Undo2 size={14} /> Descartar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
