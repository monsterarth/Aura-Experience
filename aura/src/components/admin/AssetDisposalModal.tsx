// src/components/admin/AssetDisposalModal.tsx
// Baixa/alienação de um ativo. Substitui a exclusão física: o ativo sai da
// operação mas o histórico contábil (depreciação, movimentações, manutenções)
// permanece, e o valor contábil é congelado na data da baixa.
"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Loader2, X, ArchiveX } from "lucide-react";
import { Asset, AssetDisposalInput, AssetDisposalType } from "@/types/aura";
import { StockClient } from "@/lib/stock-client";
import { FileUpload } from "./FileUpload";
import { useDiscardGuard } from "@/lib/use-discard-guard";

const TYPES: { value: AssetDisposalType; label: string; hint: string }[] = [
  { value: "sale", label: "Venda", hint: "Informe o valor recebido." },
  { value: "donation", label: "Doação", hint: "Sem valor de venda." },
  { value: "scrap", label: "Sucata / descarte", hint: "Item sem valor recuperável." },
  { value: "loss", label: "Perda", hint: "Extravio ou dano irreparável." },
  { value: "theft", label: "Furto / roubo", hint: "Anexe o boletim de ocorrência." },
  { value: "trade_in", label: "Troca (trade-in)", hint: "Valor abatido na compra do novo." },
];

interface Props {
  propertyId: string;
  asset: Asset;
  onClose: () => void;
  onDone: () => void;
}

export default function AssetDisposalModal({ propertyId, asset, onClose, onDone }: Props) {
  const [form, setForm] = useState<AssetDisposalInput>({
    disposalDate: new Date().toISOString().slice(0, 10),
    disposalType: "sale",
    disposalReason: "",
    disposalValue: null,
  });
  const [saving, setSaving] = useState(false);
  const requestClose = useDiscardGuard(form, onClose);

  const set = (patch: Partial<AssetDisposalInput>) => setForm((f) => ({ ...f, ...patch }));
  const money = (n?: number | null) => `R$ ${Number(n ?? 0).toFixed(2)}`;

  const bookValue = Number(asset.bookValue ?? 0);
  const result = form.disposalValue != null ? Number(form.disposalValue) - bookValue : null;
  const hint = TYPES.find((t) => t.value === form.disposalType)?.hint;

  const submit = async () => {
    if (!form.disposalDate) { toast.error("Informe a data da baixa."); return; }
    if (!form.disposalReason.trim()) { toast.error("Descreva o motivo da baixa."); return; }
    setSaving(true);
    try {
      await StockClient.disposeAsset(propertyId, asset.id, form);
      toast.success("Baixa registrada.");
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={requestClose}>
      <div className="bg-card border border-border w-full max-w-lg rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><ArchiveX size={18} /> Dar baixa</h2>
          <button onClick={requestClose} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl bg-secondary/40 border border-border p-3 text-sm">
            <p className="font-medium text-foreground">{asset.name}</p>
            <p className="text-xs text-muted-foreground">
              {asset.assetTag && <>#{asset.assetTag} · </>}Valor contábil hoje: <b className="text-foreground">{money(bookValue)}</b>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Data da baixa *</label>
              <input type="date" className="field-input w-full" value={form.disposalDate} onChange={(e) => set({ disposalDate: e.target.value })} /></div>
            <div><label className="field-label">Tipo *</label>
              <select className="field-input w-full" value={form.disposalType} onChange={(e) => set({ disposalType: e.target.value as AssetDisposalType })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select></div>
          </div>
          {hint && <p className="text-xs text-muted-foreground -mt-2">{hint}</p>}

          <div>
            <label className="field-label">Valor recebido (R$)</label>
            <input
              type="number" className="field-input w-full" placeholder="0,00"
              value={form.disposalValue ?? ""}
              onChange={(e) => set({ disposalValue: e.target.value === "" ? null : Number(e.target.value) })}
            />
            {result != null && (
              <p className={`text-xs mt-1 ${result >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {result >= 0 ? "Ganho" : "Perda"} de {money(Math.abs(result))} sobre o valor contábil.
              </p>
            )}
          </div>

          <div><label className="field-label">Motivo *</label>
            <textarea className="field-input w-full" rows={3} value={form.disposalReason}
              placeholder="Ex.: vendido para a pousada vizinha após troca por modelo novo"
              onChange={(e) => set({ disposalReason: e.target.value })} /></div>

          <div><label className="field-label">Documento (nota, recibo, B.O.)</label>
            <FileUpload value={form.disposalDocUrl} onChange={(url) => set({ disposalDocUrl: url || undefined })} label="Enviar documento" /></div>

          <p className="text-xs text-muted-foreground">
            A depreciação é encerrada nesta data e o valor contábil fica congelado. O ativo some das listas por
            padrão, mas todo o histórico continua na ficha.
          </p>
        </div>

        <div className="p-5 border-t border-border flex justify-end gap-2">
          <button onClick={requestClose} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-destructive text-destructive-foreground disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <ArchiveX size={15} />} Confirmar baixa
          </button>
        </div>
      </div>
    </div>
  );
}
