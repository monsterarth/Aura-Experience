// src/components/admin/StockLocationSelect.tsx
"use client";

import React from "react";
import { StockLocation, StockLocationType } from "@/types/aura";

/**
 * Select de local de estoque agrupado por tipo (<optgroup>).
 * Com uma linha por cabana a lista passa de 30 itens e fica impraticável plana.
 * Ordem = frequência de uso; as listas longas (cabanas) ficam no fim.
 * Grupos vazios não aparecem; locais de tipo desconhecido caem em "Outros".
 */
const GROUPS: { type: StockLocationType; label: string }[] = [
  { type: "warehouse", label: "Almoxarifados" },
  { type: "kitchen", label: "Cozinhas" },
  { type: "bar", label: "Bares" },
  { type: "laundry", label: "Lavanderias" },
  { type: "other", label: "Outros" },
  { type: "cabin", label: "Cabanas" },
  { type: "staff", label: "Colaboradores" },
];
const KNOWN = new Set(GROUPS.map((g) => g.type));

interface Props {
  value: string;
  onChange: (locationId: string) => void;
  locations: StockLocation[];
  className?: string;
  placeholder?: string;
}

export default function StockLocationSelect({ value, onChange, locations, className, placeholder = "Selecione…" }: Props) {
  return (
    <select className={className ?? "field-input w-full"} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {GROUPS.map(({ type, label }) => {
        const group = locations.filter((l) => (type === "other" ? l.type === "other" || !KNOWN.has(l.type) : l.type === type));
        if (group.length === 0) return null;
        return (
          <optgroup key={type} label={label}>
            {group.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}
