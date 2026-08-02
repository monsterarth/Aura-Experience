// src/components/admin/AssetTransferModal.tsx
// Movimentação explícita do ativo: para onde foi e com quem ficou, com motivo.
// Gera uma linha em asset_movements — é o que responde "cadê a TV da cabana 7".
"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, X, ArrowRightLeft } from "lucide-react";
import { Asset, AssetTransferInput, StockCabinOption, StockLocation, StockStaffOption } from "@/types/aura";
import { StockClient } from "@/lib/stock-client";
import StockLocationSelect from "./StockLocationSelect";
import { useDiscardGuard } from "@/lib/use-discard-guard";

interface Props {
  propertyId: string;
  asset: Asset;
  onClose: () => void;
  onDone: () => void;
}

export default function AssetTransferModal({ propertyId, asset, onClose, onDone }: Props) {
  const [form, setForm] = useState<AssetTransferInput>({
    toLocationId: asset.locationId ?? null,
    toCabinId: asset.cabinId ?? null,
    toCustodianId: asset.custodianId ?? null,
    toCustodianName: asset.custodianName ?? null,
    reason: "",
  });
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [cabins, setCabins] = useState<StockCabinOption[]>([]);
  const [staff, setStaff] = useState<StockStaffOption[]>([]);
  const [saving, setSaving] = useState(false);
  const requestClose = useDiscardGuard(form, onClose);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [l, cb, st] = await Promise.all([
          StockClient.locations(propertyId), StockClient.cabinOptions(propertyId), StockClient.movementStaff(propertyId),
        ]);
        if (!alive) return;
        setLocations(l); setCabins(cb); setStaff(st);
      } catch (e) { toast.error((e as Error).message); }
    })();
    return () => { alive = false; };
  }, [propertyId]);

  const set = (patch: Partial<AssetTransferInput>) => setForm((f) => ({ ...f, ...patch }));

  const changed =
    (form.toLocationId ?? null) !== (asset.locationId ?? null) ||
    (form.toCabinId ?? null) !== (asset.cabinId ?? null) ||
    (form.toCustodianId ?? null) !== (asset.custodianId ?? null);

  const submit = async () => {
    if (!changed) { toast.error("Nada mudou — escolha um novo local, cabana ou responsável."); return; }
    setSaving(true);
    try {
      await StockClient.moveAsset(propertyId, asset.id, form);
      toast.success("Movimentação registrada.");
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={requestClose}>
      <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><ArrowRightLeft size={18} /> Movimentar ativo</h2>
          <button onClick={requestClose} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl bg-secondary/40 border border-border p-3 text-sm">
            <p className="font-medium text-foreground">{asset.name}</p>
            <p className="text-xs text-muted-foreground">
              Hoje em {asset.cabinName ?? asset.location?.name ?? "local não informado"}
              {asset.custodianName && <> · com {asset.custodianName}</>}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Novo local</label>
              <StockLocationSelect
                value={form.toLocationId ?? ""}
                onChange={(v) => set({ toLocationId: v || null })}
                locations={locations}
                placeholder="—"
              /></div>
            <div><label className="field-label">Nova cabana</label>
              <select className="field-input w-full" value={form.toCabinId ?? ""} onChange={(e) => set({ toCabinId: e.target.value || null })}>
                <option value="">—</option>
                {cabins.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </div>

          <div>
            <label className="field-label">Novo responsável</label>
            <select
              className="field-input w-full"
              value={form.toCustodianId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                set({ toCustodianId: id, toCustodianName: staff.find((s) => s.id === id)?.name ?? null });
              }}
            >
              <option value="">—</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div><label className="field-label">Motivo</label>
            <input className="field-input w-full" value={form.reason ?? ""}
              placeholder="Ex.: levado para o almoxarifado após reforma da cabana"
              onChange={(e) => set({ reason: e.target.value })} /></div>
        </div>

        <div className="p-5 border-t border-border flex justify-end gap-2">
          <button onClick={requestClose} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
          <button onClick={submit} disabled={saving || !changed} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />} Registrar
          </button>
        </div>
      </div>
    </div>
  );
}
