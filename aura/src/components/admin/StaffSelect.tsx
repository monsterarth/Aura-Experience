// src/components/admin/StaffSelect.tsx
"use client";

import React from "react";
import { StockStaffOption } from "@/types/aura";
import { ROLE_ORDER, roleShortLabel } from "@/lib/roles";

/**
 * Select de colaborador agrupado por cargo (<optgroup>), irmão do
 * StockLocationSelect. Mesma regra: grupos vazios não aparecem e quem está sem
 * cargo (ou com cargo desconhecido) cai em "Outros", no fim.
 */
interface Props {
  value: string;
  onChange: (staffId: string) => void;
  staff: StockStaffOption[];
  className?: string;
  placeholder?: string;
}

export default function StaffSelect({ value, onChange, staff, className, placeholder = "Selecione…" }: Props) {
  const known = new Set(ROLE_ORDER as string[]);
  const others = staff.filter((s) => !s.role || !known.has(s.role));

  return (
    <select className={className ?? "field-input w-full"} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {ROLE_ORDER.map((role) => {
        const group = staff.filter((s) => s.role === role);
        if (group.length === 0) return null;
        return (
          <optgroup key={role} label={roleShortLabel(role)}>
            {group.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
        );
      })}
      {others.length > 0 && (
        <optgroup label="Outros">
          {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </optgroup>
      )}
    </select>
  );
}
