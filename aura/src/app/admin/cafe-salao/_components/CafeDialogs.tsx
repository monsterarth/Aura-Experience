"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChefHat, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { BreakfastSalonService } from "@/services/breakfast-salon-service";
import type { BreakfastSession, BreakfastAttendance, BreakfastTable, FBMenuItem, FBCategory } from "@/types/aura";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { T } from "@/lib/admin-tokens";
import { Dialog, Button, FilterChips, SectionLabel, Field, Input, Card, EmptyState } from "@/components/aura";

type ItemSelection = { selected: boolean; flavor?: string };

/** Pedido do garçom: mesa → hóspede → itens (com sabores) → enviar para a cozinha. */
export function WaiterOrderDialog({ open, propertyId, tables, attendances, onClose, onSubmit }: {
  open: boolean; propertyId: string; tables: BreakfastTable[]; attendances: BreakfastAttendance[]; onClose: () => void;
  onSubmit: (tableId: string, attendanceId: string | null, items: any[]) => Promise<void>;
}) {
  const [categories, setCategories] = useState<FBCategory[]>([]);
  const [menuItems, setMenuItems] = useState<FBMenuItem[]>([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [selectedAttendanceId, setSelectedAttendanceId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, ItemSelection>>({});
  const [submitting, setSubmitting] = useState(false);
  const selectedCount = Object.values(selections).filter(s => s.selected).length;
  const { requestClose, guardProps } = useCloseGuard(onClose, { open, dirty: selectedCount > 0 && !submitting, escape: false, message: "Sair sem enviar? O pedido montado será descartado." });

  useEffect(() => {
    if (!open) { setSelectedTableId(""); setSelectedAttendanceId(null); setSelections({}); }
  }, [open]);

  useEffect(() => {
    if (!propertyId || !open) return;
    fetch(`/api/admin/fb/menu?${new URLSearchParams({ propertyId })}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { setCategories(data.categories ?? []); setMenuItems(data.items ?? []); })
      .catch(() => {});
  }, [propertyId, open]);

  const openTables = tables.filter(t => t.status === "open");
  const tableAttendances = attendances.filter(a => a.tableId === selectedTableId && a.status === "seated");
  const selectedAttendanceName = tableAttendances.find(a => a.id === selectedAttendanceId)?.guestName ?? null;
  const hasPendingFlavors = menuItems.some(i => selections[i.id]?.selected && (i.flavors?.length ?? 0) > 0 && !selections[i.id]?.flavor);

  const toggle = (itemId: string) => setSelections(prev => ({ ...prev, [itemId]: prev[itemId]?.selected ? { selected: false } : { selected: true } }));
  const selectFlavor = (itemId: string, flavor: string) => setSelections(prev => ({ ...prev, [itemId]: { ...prev[itemId], flavor } }));

  const handleSubmit = async () => {
    if (!selectedTableId) { toast.error("Selecione uma mesa."); return; }
    if (hasPendingFlavors) { toast.error("Escolha o sabor de todos os itens selecionados."); return; }
    const items = menuItems.filter(i => selections[i.id]?.selected).map(i => ({
      menuItemId: i.id, name: i.name, quantity: 1, unitPrice: i.price || 0, flavor: selections[i.id]?.flavor, guestName: selectedAttendanceName ?? undefined,
    }));
    if (!items.length) { toast.error("Selecione ao menos 1 item."); return; }
    setSubmitting(true);
    try { await onSubmit(selectedTableId, selectedAttendanceId, items); onClose(); }
    catch { toast.error("Não foi possível enviar o pedido."); }
    finally { setSubmitting(false); }
  };

  const grouped = useMemo(() => categories.map(cat => ({ cat, items: menuItems.filter(i => i.categoryId === cat.id) })).filter(g => g.items.length > 0), [categories, menuItems]);

  return (
    <Dialog
      open={open} onClose={submitting ? () => {} : requestClose} presentation="auto" size="md"
      icon={ChefHat} iconTone="orange" title="Novo pedido" subtitle={selectedCount > 0 ? `${selectedCount} item${selectedCount > 1 ? "s" : ""} selecionado${selectedCount > 1 ? "s" : ""}` : "monte o pedido da mesa"}
      panelProps={guardProps}
      footer={<Button variant="primary" tone="orange" icon={ChefHat} onClick={handleSubmit} loading={submitting} loadingText="Enviando…" disabled={!selectedTableId || hasPendingFlavors || selectedCount === 0} fullWidth>Enviar para a cozinha</Button>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <SectionLabel style={{ marginBottom: 8 }}>Mesa</SectionLabel>
          {openTables.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: T.muted2 }}>Nenhuma mesa aberta.</p>
          ) : (
            <FilterChips scroll={false} ariaLabel="Mesa" items={openTables.map(t => ({ id: t.id, label: t.name }))} value={selectedTableId || null} onChange={id => { setSelectedTableId(id); setSelectedAttendanceId(null); }} />
          )}
        </div>

        {selectedTableId && (
          <div>
            <SectionLabel style={{ marginBottom: 8 }}>Hóspede</SectionLabel>
            <FilterChips scroll={false} ariaLabel="Hóspede"
              items={[{ id: "__table__", label: "Mesa geral" }, ...tableAttendances.map(a => ({ id: a.id, label: a.guestName }))]}
              value={selectedAttendanceId ?? "__table__"}
              onChange={id => setSelectedAttendanceId(id === "__table__" ? null : id)} />
            {tableAttendances.length === 0 && <p style={{ margin: "6px 0 0", fontSize: 11, color: T.muted2 }}>Nenhum hóspede sentado nesta mesa.</p>}
          </div>
        )}

        {grouped.map(({ cat, items }) => (
          <div key={cat.id}>
            <SectionLabel style={{ marginBottom: 8 }}>{cat.name}</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map(item => {
                const sel = !!selections[item.id]?.selected;
                return (
                  <div key={item.id}>
                    <button type="button" onClick={() => toggle(item.id)} className="ak-press ak-focus" aria-pressed={sel}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 12px", borderRadius: 12, textAlign: "left", cursor: "pointer", fontFamily: "inherit", background: sel ? T.glass2 : T.glass, border: `1px solid ${sel ? T.g1Border : T.border}`, color: T.text, minHeight: 44 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{item.name}</span>
                      {sel ? <Check size={16} color={T.brandText} /> : <Plus size={16} color={T.muted2} />}
                    </button>
                    {sel && (item.flavors?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 6, marginLeft: 8 }}>
                        <FilterChips scroll={false} ariaLabel={`Sabor de ${item.name}`} items={item.flavors!.map(f => ({ id: f.name, label: f.name }))} value={selections[item.id]?.flavor ?? null} onChange={f => selectFlavor(item.id, f)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {grouped.length === 0 && <EmptyState compact icon={ChefHat} title="Cardápio vazio" description="Cadastre itens em F&B › Cardápio." />}
      </div>
    </Dialog>
  );
}

/** Sentar/trocar de mesa: escolher mesa aberta ou criar uma nova. */
export function AssignTableDialog({ open, attendance, tables, session, propertyId, actorName, onClose, onAssigned }: {
  open: boolean; attendance: BreakfastAttendance | null; tables: BreakfastTable[]; session: BreakfastSession | null; propertyId: string; actorName: string; onClose: () => void; onAssigned: () => void;
}) {
  const [newTableName, setNewTableName] = useState("");
  const [loading, setLoading] = useState(false);
  const { requestClose, guardProps } = useCloseGuard(onClose, { open, dirty: !!newTableName.trim(), escape: false });
  useEffect(() => { if (!open) setNewTableName(""); }, [open]);
  const openTables = tables.filter(t => t.status === "open");

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    try { await fn(); onAssigned(); onClose(); }
    catch { toast.error("Não foi possível sentar o hóspede."); }
    finally { setLoading(false); }
  };
  const handleAssign = (tableId: string) => { if (attendance) void run(() => BreakfastSalonService.assignTable(attendance.id, tableId)); };
  const handleCreateAndAssign = () => {
    if (!newTableName.trim() || !session || !attendance) return;
    void run(async () => {
      const table = await BreakfastSalonService.createTable(propertyId, session.id, newTableName.trim(), actorName);
      await BreakfastSalonService.assignTable(attendance.id, table.id);
    });
  };

  return (
    <Dialog open={open && !!attendance} onClose={requestClose} presentation="auto" size="sm" title={attendance ? `Sentar — ${attendance.guestName}` : "Sentar"} subtitle={attendance?.cabinName} panelProps={guardProps}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {openTables.length > 0 && (
          <div>
            <SectionLabel style={{ marginBottom: 8 }}>Mesas abertas</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {openTables.map(t => (
                <Card key={t.id} pad={12} interactive onClick={() => handleAssign(t.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", opacity: loading ? .6 : 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{t.name}</span>
                  <ArrowRight size={16} color={T.muted} />
                </Card>
              ))}
            </div>
          </div>
        )}
        <Field label="Nova mesa">
          <div style={{ display: "flex", gap: 8 }}>
            <Input value={newTableName} onChange={e => setNewTableName(e.target.value)} placeholder="Nome da mesa (ex.: varanda)" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleCreateAndAssign(); } }} />
            <Button variant="primary" icon={Plus} onClick={handleCreateAndAssign} loading={loading} disabled={!newTableName.trim()} aria-label="Criar mesa e sentar" />
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

/** Visitante (não hóspede) numa mesa. */
export function VisitorDialog({ open, tables, session, propertyId, actorName, onClose, onAdded }: {
  open: boolean; tables: BreakfastTable[]; session: BreakfastSession | null; propertyId: string; actorName: string; onClose: () => void; onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [tableId, setTableId] = useState("");
  const [newTableName, setNewTableName] = useState("");
  const [loading, setLoading] = useState(false);
  const { requestClose, guardProps } = useCloseGuard(onClose, { open, dirty: !!name.trim() || !!newTableName.trim(), escape: false });
  useEffect(() => { if (!open) { setName(""); setTableId(""); setNewTableName(""); } }, [open]);
  const openTables = tables.filter(t => t.status === "open");

  const handleAdd = async () => {
    if (!session) return;
    if (!name.trim()) { toast.error("Informe o nome do visitante."); return; }
    setLoading(true);
    try {
      let targetTableId = tableId;
      if (!targetTableId && newTableName.trim()) {
        const table = await BreakfastSalonService.createTable(propertyId, session.id, newTableName.trim(), actorName);
        targetTableId = table.id;
      }
      if (!targetTableId) { toast.error("Selecione ou crie uma mesa."); return; }
      await BreakfastSalonService.addVisitor(propertyId, session.id, targetTableId, name.trim());
      onAdded(); onClose();
    } catch { toast.error("Não foi possível adicionar o visitante."); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onClose={requestClose} presentation="auto" size="sm" icon={UserPlus} iconTone="blue" title="Adicionar visitante" panelProps={guardProps}
      footer={<Button variant="primary" icon={UserPlus} onClick={handleAdd} loading={loading} disabled={!name.trim()} fullWidth>Adicionar</Button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nome"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do visitante" autoFocus /></Field>
        <div>
          <SectionLabel style={{ marginBottom: 8 }}>Mesa</SectionLabel>
          {openTables.length > 0 && <FilterChips scroll={false} ariaLabel="Mesa" items={openTables.map(t => ({ id: t.id, label: t.name }))} value={tableId || null} onChange={setTableId} style={{ marginBottom: 10 }} />}
          {!tableId && <Input value={newTableName} onChange={e => setNewTableName(e.target.value)} placeholder="Ou criar nova mesa…" />}
        </div>
      </div>
    </Dialog>
  );
}
