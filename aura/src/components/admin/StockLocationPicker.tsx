// src/components/admin/StockLocationPicker.tsx
"use client";

import React from "react";
import { StockCabinOption, StockLocation } from "@/types/aura";
import { CABIN_SENTINEL, splitLocations } from "@/lib/stock-locations";
import StockLocationSelect from "./StockLocationSelect";

/**
 * Seletor de local em dois passos. Passo 1 lista os locais de cadastro mais uma
 * opção "Cabanas"; escolhendo-a, o passo 2 pergunta QUAL cabana — mesma forma do
 * seletor de colaborador.
 *
 * Emite `cabinId` (não `locationId`) quando é cabana: o local de uma cabana é
 * criado pelo servidor na primeira movimentação, então cabana recém-cadastrada
 * já pode receber material sem ninguém criar local à mão.
 */
export interface LocationPick {
  locationId: string;
  cabinId: string;
}

interface Props {
  value: LocationPick;
  onChange: (pick: LocationPick) => void;
  locations: StockLocation[];
  cabins: StockCabinOption[];
  /** false esconde as cabanas — para campos onde cabana nunca é resposta (ex.: recebimento de NF). */
  allowCabins?: boolean;
  cabinLabel?: string;
}

export default function StockLocationPicker({
  value, onChange, locations, cabins, allowCabins = true, cabinLabel = "Cabana",
}: Props) {
  const { flat } = splitLocations(locations);
  const showCabins = allowCabins && cabins.length > 0;
  const step1 = value.cabinId ? CABIN_SENTINEL : value.locationId;

  return (
    <>
      <StockLocationSelect
        locations={flat}
        value={step1}
        extraOption={showCabins ? { value: CABIN_SENTINEL, label: "Cabanas…", group: "Cabanas" } : undefined}
        onChange={(id) =>
          onChange(id === CABIN_SENTINEL ? { locationId: "", cabinId: "" } : { locationId: id, cabinId: "" })
        }
      />
      {step1 === CABIN_SENTINEL && (
        <div className="mt-2">
          <label className="field-label">{cabinLabel}</label>
          <select className="field-input w-full" value={value.cabinId}
            onChange={(e) => onChange({ locationId: "", cabinId: e.target.value })}>
            <option value="">Selecione…</option>
            {cabins.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
    </>
  );
}
