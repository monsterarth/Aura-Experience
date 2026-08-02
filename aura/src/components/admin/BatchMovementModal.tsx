// src/components/admin/BatchMovementModal.tsx
"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  BatchMovementResult, StockCabinOption, StockLocation, StockLossType,
  StockMovementType, StockProduct, StockStaffOption,
} from "@/types/aura";
import StockLocationPicker from "./StockLocationPicker";
import StaffSelect from "./StaffSelect";
import { StockClient } from "@/lib/stock-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { Loader2, Plus, Save, Trash, X, CheckCircle2, AlertTriangle } from "lucide-react";

const TYPES: { value: StockMovementType; label: string }[] = [
  { value: "entry", label: "Entrada" }, { value: "exit", label: "Saída" },
  { value: "transfer", label: "Transferência" }, { value: "adjustment", label: "Ajuste" },
  { value: "loss", label: "Perda" },
];
const LOSS_TYPES: { value: StockLossType; label: string }[] = [
  { value: "expiry", label: "Vencimento" }, { value: "damage", label: "Quebra/Danificação" },
  { value: "handling", label: "Manipulação" }, { value: "other", label: "Outros" },
];

interface Row { productId: string; quantity: string; unitCost: string }
const emptyRow: Row = { productId: "", quantity: "", unitCost: "" };

interface Props {
  propertyId: string;
  products: StockProduct[];
  locations: StockLocation[];
  cabins: StockCabinOption[];
  staff: StockStaffOption[];
  defaultResponsibleId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function BatchMovementModal({
  propertyId, products, locations, cabins, staff, defaultResponsibleId, onClose, onSaved,
}: Props) {
  const [type, setType] = useState<StockMovementType>("exit");
  const [from, setFrom] = useState({ locationId: "", cabinId: "" });
  const [to, setTo] = useState({ locationId: "", cabinId: "" });
  const [fromStaffId, setFromStaffId] = useState("");
  const [toStaffId, setToStaffId] = useState("");
  const [responsibleId, setResponsibleId] = useState(defaultResponsibleId);
  const [lossType, setLossType] = useState<StockLossType>("expiry");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([{ ...emptyRow }]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BatchMovementResult | null>(null);
  // Linhas já preenchidas contam como edição mesmo sem digitação em input.
  const { requestClose, guardProps } = useCloseGuard(onClose, {
    dirty: rows.some((r) => r.productId || r.quantity || r.unitCost),
  });

  const showFrom = type === "exit" || type === "loss" || type === "transfer";
  const showTo = type === "entry" || type === "transfer" || type === "adjustment";
  const showCost = type === "entry";

  const locOf = (id: string) => locations.find((l) => l.id === id);
  const askFromStaff = showFrom && locOf(from.locationId)?.type === "staff";
  const askToStaff = showTo && locOf(to.locationId)?.type === "staff";

  // Linhas já gravadas travam; só as pendentes seguem editáveis.
  const committed = useMemo(() => new Set((result?.ok ?? []).map((o) => o.index)), [result]);
  const failedIndex = result?.failed?.index ?? -1;
  const preflightByIndex = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of result?.preflight ?? []) m.set(e.index, e.error);
    return m;
  }, [result]);

  // Rola até a linha nova, como no editor de compras.
  const endRef = useRef<HTMLDivElement>(null);
  const scrollAfterAdd = useRef(false);
  const addRow = () => { scrollAfterAdd.current = true; setRows((r) => [...r, { ...emptyRow }]); };
  useEffect(() => {
    if (!scrollAfterAdd.current) return;
    scrollAfterAdd.current = false;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [rows.length]);

  const setRow = (idx: number, patch: Partial<Row>) =>
    setRows((r) => r.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeRow = (idx: number) => setRows((r) => r.filter((_, i) => i !== idx));

  const submit = async (allowNegative = false) => {
    const pending = rows
      .map((r, index) => ({ r, index }))
      .filter(({ index }) => !committed.has(index));
    if (pending.some(({ r }) => !r.productId || !Number(r.quantity))) {
      toast.error("Toda linha precisa de produto e quantidade.");
      return;
    }
    if (pending.length === 0) { toast.error("Nenhuma linha pendente."); return; }

    setSaving(true);
    try {
      // Reenvia a lista inteira para os índices baterem com o que já gravou.
      const res = await StockClient.registerBatch({
        propertyId, type,
        fromLocationId: showFrom ? from.locationId || undefined : undefined,
        toLocationId: showTo ? to.locationId || undefined : undefined,
        fromCabinId: showFrom ? from.cabinId || undefined : undefined,
        toCabinId: showTo ? to.cabinId || undefined : undefined,
        fromStaffId: askFromStaff ? fromStaffId : undefined,
        toStaffId: askToStaff ? toStaffId : undefined,
        responsibleId: responsibleId || undefined,
        lossType: type === "loss" ? lossType : undefined,
        notes: notes || undefined,
        allowNegative,
        batchRef: result?.batchRef ?? undefined,
        lines: pending.map(({ r }) => ({
          productId: r.productId,
          quantity: Number(r.quantity),
          unitCost: showCost ? Number(r.unitCost || 0) : undefined,
        })),
      });

      // Índices do retorno são relativos às linhas enviadas — remapeia para a tabela.
      const map = (i: number) => pending[i]?.index ?? i;
      const remapped: BatchMovementResult = {
        ...res,
        ok: [...(result?.ok ?? []), ...res.ok.map((o) => ({ ...o, index: map(o.index) }))],
        failed: res.failed ? { ...res.failed, index: map(res.failed.index) } : null,
        remaining: res.remaining.map(map),
        preflight: res.preflight.map((e) => ({ ...e, index: e.index >= 0 ? map(e.index) : e.index })),
      };
      setResult(remapped);

      if (res.preflight.length > 0) {
        const negatives = res.preflight.filter((e) => e.code === "NEGATIVE_STOCK");
        if (negatives.length > 0 && negatives.length === res.preflight.length) {
          const ok = window.confirm(
            `⚠️ ${negatives.length} linha(s) deixariam o estoque negativo:\n\n` +
            negatives.map((n) => `• ${n.error}`).join("\n") +
            `\n\nLançar mesmo assim?`
          );
          if (ok) { setSaving(false); return submit(true); }
        } else {
          toast.error(`${res.preflight.length} problema(s) — nada foi gravado.`);
        }
        return;
      }
      if (res.failed) {
        toast.error(`Parou na linha ${map(res.failed.index) + 1}: ${res.failed.error}`);
        return;
      }
      toast.success(`${remapped.ok.length} movimentação(ões) lançada(s).`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  };

  const headerError = (result?.preflight ?? []).find((e) => e.index === -1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={requestClose}>
      <div className="bg-card border border-border w-full max-w-3xl rounded-3xl shadow-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()} {...guardProps}>
        <div className="p-5 border-b border-border flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground">Lançamento em lote</h2>
            <p className="text-xs text-muted-foreground">Um cabeçalho, várias linhas — como uma nota de compra.</p>
          </div>
          <button onClick={requestClose} className="p-1.5 text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Cabeçalho do lote */}
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button key={t.value} onClick={() => setType(t.value)} disabled={!!result}
                className={cn("px-3 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50",
                  type === t.value ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {showFrom && (
              <div>
                <label className="field-label">Origem</label>
                <StockLocationPicker locations={locations} cabins={cabins} cabinLabel="Cabana de origem"
                  value={from} onChange={setFrom} />
              </div>
            )}
            {askFromStaff && (
              <div>
                <label className="field-label">Colaborador (origem)</label>
                <StaffSelect staff={staff} value={fromStaffId} onChange={setFromStaffId} />
              </div>
            )}
            {showTo && (
              <div>
                <label className="field-label">Destino</label>
                <StockLocationPicker locations={locations} cabins={cabins} value={to} onChange={setTo} />
              </div>
            )}
            {askToStaff && (
              <div>
                <label className="field-label">Colaborador</label>
                <StaffSelect staff={staff} value={toStaffId} onChange={setToStaffId} />
              </div>
            )}
            {type === "loss" && (
              <div>
                <label className="field-label">Tipo de perda</label>
                <select className="field-input w-full" value={lossType} onChange={(e) => setLossType(e.target.value as StockLossType)}>
                  {LOSS_TYPES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="field-label">Responsável</label>
              <StaffSelect staff={staff} value={responsibleId} onChange={setResponsibleId} />
            </div>
            <div>
              <label className="field-label">Observações</label>
              <input className="field-input w-full" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Vale para todas as linhas" />
            </div>
          </div>

          {headerError && (
            <p className="text-xs font-bold text-destructive flex items-center gap-1.5">
              <AlertTriangle size={13} /> {headerError.error}
            </p>
          )}

          {/* Linhas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Itens ({rows.length})</h3>
              <button onClick={addRow} className="flex items-center gap-1 text-xs font-bold text-primary hover:opacity-80">
                <Plus size={13} /> Adicionar item
              </button>
            </div>
            <div className="space-y-1.5">
              {rows.map((r, idx) => {
                const done = committed.has(idx);
                const failed = failedIndex === idx;
                const preErr = preflightByIndex.get(idx);
                return (
                  <div key={idx}>
                    <div className={cn("grid gap-2 items-center", showCost ? "grid-cols-[1fr_80px_100px_28px]" : "grid-cols-[1fr_80px_28px]")}>
                      <select className={cn("field-input w-full py-1.5", (failed || preErr) && "border-destructive")}
                        value={r.productId} disabled={done || saving}
                        onChange={(e) => setRow(idx, { productId: e.target.value })}>
                        <option value="">Selecione…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                      </select>
                      <input type="number" className="field-input w-full py-1.5 text-right" placeholder="Qtd"
                        value={r.quantity} disabled={done || saving}
                        onChange={(e) => setRow(idx, { quantity: e.target.value })} />
                      {showCost && (
                        <input type="number" className="field-input w-full py-1.5 text-right" placeholder="Custo"
                          value={r.unitCost} disabled={done || saving}
                          onChange={(e) => setRow(idx, { unitCost: e.target.value })} />
                      )}
                      {done ? (
                        <CheckCircle2 size={16} className="text-emerald-500 mx-auto" />
                      ) : (
                        <button onClick={() => removeRow(idx)} disabled={saving || rows.length === 1}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-30 mx-auto">
                          <Trash size={14} />
                        </button>
                      )}
                    </div>
                    {(preErr || failed) && (
                      <p className="text-[11px] font-bold text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle size={11} /> {preErr ?? result?.failed?.error}
                      </p>
                    )}
                  </div>
                );
              })}
              <div ref={endRef} aria-hidden className="h-px scroll-mb-24" />
            </div>
          </div>

          {result && (result.ok.length > 0) && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-600">
              {result.ok.length} linha(s) já gravada(s) e travada(s). Corrija as marcadas e clique em
              <b> Continuar</b> — elas não serão lançadas de novo.
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border flex justify-between gap-2 shrink-0">
          <button onClick={requestClose} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground">
            {result && result.ok.length > 0 ? "Fechar" : "Cancelar"}
          </button>
          <button onClick={() => submit(false)} disabled={saving}
            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {result && result.ok.length > 0 ? "Continuar" : "Lançar lote"}
          </button>
        </div>
      </div>
    </div>
  );
}
