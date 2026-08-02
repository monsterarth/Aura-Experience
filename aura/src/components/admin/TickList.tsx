// src/components/admin/TickList.tsx
// Grupo de checkboxes com "todos/nenhum" para filtros de relatório.
// Extraído de admin/estoque/relatorios para ser compartilhado com patrimônio.
//
// Convenção que casa com o servidor: SELEÇÃO VAZIA = TODOS. Os services de
// relatório leem `filters.xIds?.length ? filtra : não filtra`, então não existe
// o estado "nenhum selecionado" — ele é o estado "sem filtro".
"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Search, Check } from "lucide-react";

interface Props<T extends { id: string; name: string }> {
  label: string;
  items: T[];
  selected: string[];
  onChange: (ids: string[]) => void;
  searchable?: boolean;
}

export default function TickList<T extends { id: string; name: string }>({
  label, items, selected, onChange, searchable = false,
}: Props<T>) {
  const [q, setQ] = useState("");
  const shown = useMemo(
    () => (q.trim() ? items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())) : items),
    [items, q],
  );
  const allOn = selected.length === 0;

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {label} {allOn ? <span className="text-primary">· todos</span> : <span className="text-primary">· {selected.length}</span>}
        </h3>
        <button onClick={() => onChange([])} className="text-[11px] font-bold text-muted-foreground hover:text-foreground">
          Limpar
        </button>
      </div>
      {searchable && (
        <div className="relative mb-2">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="field-input w-full pl-7 py-1.5 text-xs" placeholder="Filtrar…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
        {shown.map((i) => {
          const on = selected.includes(i.id);
          return (
            <button key={i.id} type="button" onClick={() => toggle(i.id)}
              className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                on ? "bg-primary/15 border-primary/40 text-foreground" : "bg-secondary border-border text-muted-foreground hover:text-foreground")}>
              {on && <Check size={11} />} {i.name}
            </button>
          );
        })}
        {shown.length === 0 && <p className="text-xs text-muted-foreground py-2">Nada encontrado.</p>}
      </div>
    </div>
  );
}
