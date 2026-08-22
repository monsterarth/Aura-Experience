// src/components/admin/AssetFormModal.tsx
// Formulário do ativo, extraído de admin/patrimonio/page.tsx para ser o MESMO
// editor na lista e na ficha (mesma ideia do ProductDetailModal no estoque).
//
// Dois campos que não existiam na UI antiga:
//  • cabinId  — a coluna existe desde stock_phase1.sql e nunca foi editável;
//  • custodianId — quem responde pelo ativo.
"use client";

import { Dialog } from "@/components/aura";

import React, { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, Save, X, ShieldCheck, FileText, Camera, Landmark, User } from "lucide-react";
import {
  Asset, AssetStatus, AssetDepreciationMethod,
  StockCategory, StockCabinOption, StockLocation, StockStaffOption, Supplier,
} from "@/types/aura";
import { StockClient } from "@/lib/stock-client";
import { ImageUpload } from "./ImageUpload";
import { FileUpload } from "./FileUpload";
import StockLocationSelect from "./StockLocationSelect";
import { useDiscardGuard } from "@/lib/use-discard-guard";

export const ASSET_STATUS: Record<AssetStatus, { label: string; cls: string }> = {
  active: { label: "Ativo", cls: "bg-emerald-500/15 text-emerald-500" },
  maintenance: { label: "Manutenção", cls: "bg-amber-500/15 text-amber-500" },
  inactive: { label: "Inativo", cls: "bg-secondary text-muted-foreground" },
  disposed: { label: "Baixado", cls: "bg-red-500/15 text-red-500" },
  written_off: { label: "Baixa contábil", cls: "bg-red-500/15 text-red-500" },
};

const METHODS: { value: AssetDepreciationMethod; label: string }[] = [
  { value: "linear", label: "Linear" }, { value: "none", label: "Não deprecia" },
];

export const EMPTY_ASSET: Partial<Asset> = {
  name: "", depreciationMethod: "linear", acquisitionCost: 0, residualValue: 0, status: "active",
};

interface Props {
  propertyId: string;
  /** Ativo a editar, ou EMPTY_ASSET para criar. */
  initial: Partial<Asset>;
  onClose: () => void;
  onSaved: (id: string) => void;
}

export default function AssetFormModal({ propertyId, initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Partial<Asset> | null>(initial);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cabins, setCabins] = useState<StockCabinOption[]>([]);
  const [staff, setStaff] = useState<StockStaffOption[]>([]);
  const requestClose = useDiscardGuard(form, onClose);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, l, s, cb, st] = await Promise.all([
          StockClient.categories(propertyId), StockClient.locations(propertyId),
          StockClient.suppliers(propertyId), StockClient.cabinOptions(propertyId),
          StockClient.movementStaff(propertyId),
        ]);
        if (!alive) return;
        setCategories(c); setLocations(l); setSuppliers(s); setCabins(cb); setStaff(st);
      } catch (e) { toast.error((e as Error).message); }
    })();
    return () => { alive = false; };
  }, [propertyId]);

  const setF = (patch: Partial<Asset>) => setForm((f) => ({ ...(f ?? {}), ...patch }));

  // Categorias de patrimônio; 'both' serve aos dois módulos.
  const assetCategories = useMemo(
    () => categories.filter((c) => c.appliesTo !== "consumable"),
    [categories],
  );

  const money = (n?: number | null) => `R$ ${Number(n ?? 0).toFixed(2)}`;

  const save = async () => {
    if (!form?.name?.trim()) { toast.error("Informe o nome do ativo."); return; }
    setSaving(true);
    try {
      const { id } = await StockClient.saveAsset({ ...form, propertyId } as never);
      toast.success("Ativo salvo.");
      onSaved((id as string) ?? form.id ?? "");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  if (!form) return null;

  return (
    <Dialog open onClose={requestClose} presentation="auto" size="lg" rawBody hideClose>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, maxHeight: "100%", overflowY: "auto" }}>
        <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-card z-10">
          <h2 className="text-lg font-bold text-foreground">{form.id ? "Editar ativo" : "Novo ativo"}</h2>
          <button onClick={requestClose} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-[1fr_160px] gap-3">
            <div><label className="field-label">Nome *</label>
              <input className="field-input w-full" value={form.name ?? ""} autoFocus onChange={(e) => setF({ name: e.target.value })} /></div>
            <div>
              <label className="field-label">Nº patrimônio</label>
              <input
                className="field-input w-full disabled:opacity-60"
                value={form.assetTag ?? ""}
                disabled={!!form.id && !!form.assetTag}
                placeholder={form.id ? "" : "automático"}
                onChange={(e) => setF({ assetTag: e.target.value })}
              />
            </div>
          </div>
          {!form.id && (
            <p className="text-xs text-muted-foreground -mt-2">
              Deixe o nº em branco para gerar sequencialmente. O código da plaqueta (QR) é criado junto e não muda mais.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Categoria</label>
              <select className="field-input w-full" value={form.categoryId ?? ""} onChange={(e) => setF({ categoryId: e.target.value || null })}>
                <option value="">—</option>
                {assetCategories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select></div>
            <div><label className="field-label">Status</label>
              <select className="field-input w-full" value={form.status ?? "active"} onChange={(e) => setF({ status: e.target.value as AssetStatus })}>
                {(Object.entries(ASSET_STATUS) as [AssetStatus, { label: string }][])
                  .filter(([v]) => v !== "disposed" || form.status === "disposed")
                  .map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
              </select></div>
          </div>

          {/* Onde está e com quem está */}
          <div className="border border-border rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Landmark size={13} /> Localização e responsável
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Local</label>
                <StockLocationSelect
                  value={form.locationId ?? ""}
                  onChange={(v) => setF({ locationId: v || null })}
                  locations={locations}
                  placeholder="—"
                /></div>
              <div><label className="field-label">Cabana</label>
                <select className="field-input w-full" value={form.cabinId ?? ""} onChange={(e) => setF({ cabinId: e.target.value || null })}>
                  <option value="">—</option>
                  {cabins.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            </div>
            <div>
              <label className="field-label flex items-center gap-1.5"><User size={12} /> Responsável (custodiante)</label>
              <select
                className="field-input w-full"
                value={form.custodianId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  setF({ custodianId: id, custodianName: staff.find((s) => s.id === id)?.name ?? null });
                }}
              >
                <option value="">—</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><label className="field-label">Marca</label>
              <input className="field-input w-full" value={form.brand ?? ""} onChange={(e) => setF({ brand: e.target.value })} /></div>
            <div><label className="field-label">Modelo</label>
              <input className="field-input w-full" value={form.model ?? ""} onChange={(e) => setF({ model: e.target.value })} /></div>
            <div><label className="field-label">Nº de série</label>
              <input className="field-input w-full" value={form.serialNumber ?? ""} onChange={(e) => setF({ serialNumber: e.target.value })} /></div>
          </div>

          {/* Imagens */}
          <div className="border border-border rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Camera size={13} /> Imagens</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Foto do produto</label>
                <div className="h-36 rounded-xl overflow-hidden border border-border">
                  <ImageUpload value={form.imageUrl} onUploadSuccess={(url) => setF({ imageUrl: url })} direct maxSizeMb={15} />
                </div>
              </div>
              <div>
                <label className="field-label">Etiqueta de especificações</label>
                <div className="h-36 rounded-xl overflow-hidden border border-border">
                  <ImageUpload value={form.specImageUrl} onUploadSuccess={(url) => setF({ specImageUrl: url })} direct maxSizeMb={15} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Fornecedor</label>
              <select className="field-input w-full" value={form.supplierId ?? ""} onChange={(e) => setF({ supplierId: e.target.value || null })}>
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label className="field-label">Data de aquisição</label>
              <input type="date" className="field-input w-full" value={form.acquisitionDate ?? ""} onChange={(e) => setF({ acquisitionDate: e.target.value || null })} /></div>
          </div>

          {/* Depreciação */}
          <div className="border border-border rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Depreciação</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Custo de aquisição (R$)</label>
                <input type="number" className="field-input w-full" value={form.acquisitionCost ?? 0} onChange={(e) => setF({ acquisitionCost: Number(e.target.value) })} /></div>
              <div><label className="field-label">Método</label>
                <select className="field-input w-full" value={form.depreciationMethod ?? "linear"} onChange={(e) => setF({ depreciationMethod: e.target.value as AssetDepreciationMethod })}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select></div>
            </div>
            {form.depreciationMethod !== "none" && (
              <div className="grid grid-cols-3 gap-3">
                <div><label className="field-label">Vida útil (meses)</label>
                  <input type="number" className="field-input w-full" value={form.usefulLifeMonths ?? ""} onChange={(e) => setF({ usefulLifeMonths: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                <div><label className="field-label">Valor residual (R$)</label>
                  <input type="number" className="field-input w-full" value={form.residualValue ?? 0} onChange={(e) => setF({ residualValue: Number(e.target.value) })} /></div>
                <div><label className="field-label">Início depreciação</label>
                  <input type="date" className="field-input w-full" value={form.depreciationStart ?? ""} onChange={(e) => setF({ depreciationStart: e.target.value || null })} /></div>
              </div>
            )}
            {form.id && form.bookValue != null && (
              <p className="text-xs text-muted-foreground">Valor contábil atual: <b className="text-foreground">{money(form.bookValue)}</b> · depreciação mensal {money(form.monthlyDepreciation)}</p>
            )}
          </div>

          {/* Garantia (opcional) */}
          <div className="border border-border rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><ShieldCheck size={13} /> Garantia (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="field-label">Garantia até</label>
                <input type="date" className="field-input w-full" value={form.warrantyUntil ?? ""} onChange={(e) => setF({ warrantyUntil: e.target.value || null })} /></div>
              <div><label className="field-label">Garantidor / loja</label>
                <input className="field-input w-full" value={form.warrantyProvider ?? ""} onChange={(e) => setF({ warrantyProvider: e.target.value })} /></div>
            </div>
            <div><label className="field-label">Observações da garantia</label>
              <input className="field-input w-full" value={form.warrantyNotes ?? ""} onChange={(e) => setF({ warrantyNotes: e.target.value })} /></div>
          </div>

          {/* Documentos */}
          <div className="border border-border rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><FileText size={13} /> Documentos</p>
            <div><label className="field-label">Nota fiscal (PDF ou imagem)</label>
              <FileUpload value={form.invoiceUrl} onChange={(url) => setF({ invoiceUrl: url || undefined })} label="Enviar nota fiscal" />
            </div>
            <div><label className="field-label">Documento de garantia (PDF ou imagem)</label>
              <FileUpload value={form.warrantyDocUrl} onChange={(url) => setF({ warrantyDocUrl: url || undefined })} label="Enviar documento" />
            </div>
          </div>

          <div><label className="field-label">Observações</label>
            <textarea className="field-input w-full" rows={2} value={form.notes ?? ""} onChange={(e) => setF({ notes: e.target.value })} /></div>
        </div>

        <div className="p-5 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-card">
          <button onClick={requestClose} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
          </button>
        </div>
      </div>
    </Dialog>
  );
}
