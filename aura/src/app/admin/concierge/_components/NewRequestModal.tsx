"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { ConciergeService } from "@/services/concierge-service";
import type { ConciergeItem, ConciergeCategory } from "@/types/aura";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { T } from "@/lib/admin-tokens";
import { Dialog, Button, IconButton, Field, Select, Input, Switch, SkeletonList } from "@/components/aura";
import { categoryLabel, fmtBRL } from "./concierge-utils";
import { ItemIcon } from "./RequestCards";

interface CabinOption { id: string; name: string; stayId?: string; guestName?: string }

/** Registro manual de pedido (cabana, item do catálogo, quantidade, urgência, observações). */
export function NewRequestModal({ open, preset, onClose }: { open: boolean; preset: ConciergeItem | null; onClose: () => void }) {
  const { currentProperty: property } = useProperty();
  const { userData } = useAuth();
  const [catalogItems, setCatalogItems] = useState<ConciergeItem[]>([]);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cabins, setCabins] = useState<CabinOption[]>([]);
  const [selectedCabinId, setSelectedCabinId] = useState("");
  const [loading, setLoading] = useState(true);
  const dirty = qty !== 1 || notes.trim().length > 0 || urgent;
  const { requestClose, guardProps } = useCloseGuard(onClose, { open, dirty: dirty && !saving, escape: false });

  const selectedItem = catalogItems.find(i => i.id === itemId);
  const selectedCabin = cabins.find(c => c.id === selectedCabinId);
  const isLoan = selectedItem?.category === "loan";

  useEffect(() => {
    if (!open) { setQty(1); setNotes(""); setUrgent(false); return; }
    setItemId(preset?.id || "");
  }, [open, preset?.id]);

  useEffect(() => {
    if (!property || !open) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/concierge/new-request-data?${new URLSearchParams({ propertyId: property.id })}`);
        if (!res.ok) throw new Error("fetch-error");
        const data = await res.json();
        if (!alive) return;
        const opts: CabinOption[] = data.cabins || [];
        setCabins(opts);
        setSelectedCabinId(opts.find(c => !!c.stayId)?.id || opts[0]?.id || "");
        const items = (data.items || []) as ConciergeItem[];
        setCatalogItems(items);
        if (!preset?.id && items.length > 0) setItemId(items[0].id);
      } catch {
        if (alive) toast.error("Não foi possível carregar cabanas e itens.");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [property, open, preset?.id]);

  const handle = async () => {
    if (!property || !userData || !itemId || !selectedCabinId) return;
    setSaving(true);
    try {
      await ConciergeService.createRequest({ propertyId: property.id, stayId: selectedCabin?.stayId, cabinId: selectedCabinId, itemId, quantity: qty, notes: notes.trim() || undefined, requestedBy: "guest", urgent }, userData.id, userData.fullName);
      toast.success("Pedido criado.");
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "Erro ao criar pedido.");
    } finally { setSaving(false); }
  };

  const canSubmit = !!itemId && !!selectedCabinId && !saving;

  return (
    <Dialog open={open} onClose={saving ? () => {} : requestClose} presentation="auto" size="md" icon={ShoppingBag} iconTone="brand" title="Novo pedido" subtitle="Registrar solicitação manualmente" panelProps={guardProps}
      footer={(
        <>
          <Button variant="secondary" onClick={requestClose} disabled={saving}>Cancelar</Button>
          <Button variant={urgent ? "danger-solid" : "primary"} icon={urgent ? AlertTriangle : Plus} onClick={handle} disabled={!canSubmit} loading={saving}>{urgent ? "Criar pedido urgente" : "Criar pedido"}</Button>
        </>
      )}>
      {loading ? <SkeletonList rows={4} avatar={false} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Cabana">
            {cabins.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: T.muted2 }}>Nenhuma cabana cadastrada.</p> : (
              <>
                <Select value={selectedCabinId} onChange={e => setSelectedCabinId(e.target.value)}>
                  {cabins.map(c => <option key={c.id} value={c.id}>{c.name}{c.stayId ? ` — ${c.guestName}` : " — sem estadia"}</option>)}
                </Select>
                {selectedCabin && !selectedCabin.stayId && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, padding: "7px 10px", borderRadius: 9, background: T.amberBg, border: `1px solid ${T.amberBorder}`, fontSize: 11, color: T.amber }}>
                    <AlertTriangle size={11} /> Cabana sem estadia ativa — o pedido é criado sem vínculo com hóspede.
                  </div>
                )}
              </>
            )}
          </Field>

          <Field label="Item do catálogo">
            <Select value={itemId} onChange={e => setItemId(e.target.value)}>
              {(["loan", "consumption"] as ConciergeCategory[]).map(cat => {
                const catItems = catalogItems.filter(i => i.category === cat);
                if (catItems.length === 0) return null;
                return (
                  <optgroup key={cat} label={cat === "loan" ? "Empréstimos" : "Consumo"}>
                    {catItems.map(i => <option key={i.id} value={i.id}>{i.name}{i.price > 0 ? ` · ${fmtBRL(i.price)}` : ""}</option>)}
                  </optgroup>
                );
              })}
            </Select>
            {selectedItem && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 10px", background: T.glass, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                <ItemIcon item={selectedItem} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>{selectedItem.name}</div>
                  <div style={{ fontSize: 10, color: T.muted }}>{categoryLabel(selectedItem.category)}</div>
                </div>
                {selectedItem.price > 0 && <div style={{ fontSize: 13, fontWeight: 900, color: T.brandText }}>{fmtBRL(selectedItem.price * qty)}</div>}
              </div>
            )}
          </Field>

          <Field label="Quantidade">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <IconButton icon={Minus} label="Menos um" variant="secondary" onClick={() => setQty(q => Math.max(1, q - 1))} />
              <span style={{ fontSize: 20, fontWeight: 900, minWidth: 36, textAlign: "center", color: T.text, fontVariantNumeric: "tabular-nums" }}>{qty}</span>
              <IconButton icon={Plus} label="Mais um" variant="secondary" onClick={() => setQty(q => q + 1)} />
            </div>
          </Field>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 12, background: urgent ? T.redBg : T.glass, border: `1px solid ${urgent ? T.redBorder : T.border}` }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: urgent ? T.red : T.text }}>Marcar como urgente</span>
              <span style={{ display: "block", fontSize: 11, color: T.muted }}>Aparece destacado na fila de pendentes</span>
            </span>
            <Switch checked={urgent} onChange={setUrgent} label="Urgente" />
          </div>

          <Field label="Observações (opcional)">
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex.: gelado, sem açúcar…" />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
