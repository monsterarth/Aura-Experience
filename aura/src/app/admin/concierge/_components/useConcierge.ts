"use client";

// Estado do Concierge: pedidos pendentes em realtime, histórico por dia, catálogo/grupos/arquivo,
// ações de pedido e CRUD do catálogo. Lógica portada da página original.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { ConciergeService } from "@/services/concierge-service";
import { StockClient } from "@/lib/stock-client";
import { splitLocations } from "@/lib/stock-locations";
import { useConfirm } from "@/components/aura";
import type { ConciergeRequest, ConciergeItem, ConciergeGroup } from "@/types/aura";
import { defaultForm, defaultGroupForm, getUrgency, type EnrichedRequest, type GroupForm, type ItemForm, type RequestAction, type Tab } from "./concierge-utils";

export function useConcierge(tab: Tab) {
  const { currentProperty: property, loading: propLoading } = useProperty();
  const { userData } = useAuth();
  const confirm = useConfirm();

  // ── Pedidos abertos ──
  const [rawOpen, setRawOpen] = useState<ConciergeRequest[]>([]);
  const [openRequests, setOpenRequests] = useState<EnrichedRequest[]>([]);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const prevCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Histórico ──
  const [history, setHistory] = useState<ConciergeRequest[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── Catálogo ──
  const [items, setItems] = useState<ConciergeItem[]>([]);
  const [groups, setGroups] = useState<ConciergeGroup[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [stockProducts, setStockProducts] = useState<{ id: string; name: string; unit: string }[]>([]);
  const [stockLocations, setStockLocations] = useState<{ id: string; name: string }[]>([]);
  const stockEnabled = property?.settings?.hasStock !== false;

  // ── Arquivo ──
  const [archivedItems, setArchivedItems] = useState<ConciergeItem[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [loadingArchive, setLoadingArchive] = useState(false);

  // ── Grupos ──
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<GroupForm>(defaultGroupForm);
  const [savingGroup, setSavingGroup] = useState(false);

  // ── Novo pedido ──
  const [showNew, setShowNew] = useState(false);
  const [newItemPreset, setNewItemPreset] = useState<ConciergeItem | null>(null);

  useEffect(() => {
    if (!property?.id || !stockEnabled) { setStockProducts([]); setStockLocations([]); return; }
    StockClient.products(property.id)
      .then(ps => setStockProducts(ps.map(p => ({ id: p.id, name: p.name, unit: p.unit }))))
      .catch(() => setStockProducts([]));
    StockClient.locations(property.id)
      // sem locais de cabana: a baixa de um item de concierge sai do estoque, não de uma cabana
      .then(ls => setStockLocations(splitLocations(ls).flat.map(l => ({ id: l.id, name: l.name }))))
      .catch(() => setStockLocations([]));
  }, [property?.id, stockEnabled]);

  // Idade dos pedidos: tique por minuto
  useEffect(() => {
    const id = setInterval(() => {
      setOpenRequests(prev => prev.map(r => {
        const ageMin = r.ageMin + 1;
        return { ...r, ageMin, urgency: r.urgent ? "urgent" : getUrgency(ageMin) };
      }));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setOpenRequests(rawOpen.map(r => {
      const ageMin = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60_000);
      return { ...r, ageMin, urgency: r.urgent ? "urgent" : getUrgency(ageMin) };
    }));
  }, [rawOpen]);

  // Realtime dos pendentes
  useEffect(() => {
    if (!property) return;
    const unsub = ConciergeService.listenToPendingRequests(property.id, reqs => setRawOpen(reqs));
    return unsub;
  }, [property]);

  // Som ao entrar pedido novo
  useEffect(() => {
    if (openRequests.length > prevCountRef.current) {
      try {
        if (!audioRef.current) audioRef.current = new Audio("/notification.mp3");
        audioRef.current.play().catch(() => {});
      } catch { /* ignora */ }
    }
    prevCountRef.current = openRequests.length;
  }, [openRequests.length]);

  // Histórico por dia
  const loadHistory = useCallback(async () => {
    if (!property) return;
    setLoadingHistory(true);
    try {
      const d = new Date();
      d.setDate(d.getDate() + historyOffset);
      const dateISO = d.toISOString().split("T")[0];
      const res = await fetch(`/api/admin/concierge/history?${new URLSearchParams({ propertyId: property.id, date: dateISO })}`);
      if (!res.ok) throw new Error("fetch-error");
      const data = await res.json();
      setHistory(data.requests || []);
    } catch {
      toast.error("Erro ao carregar histórico.");
    } finally {
      setLoadingHistory(false);
    }
  }, [property, historyOffset]);

  useEffect(() => { if (tab === "history" && property) void loadHistory(); }, [tab, historyOffset, property, loadHistory]);

  // Catálogo
  const loadCatalog = useCallback(async () => {
    if (!property) return;
    setLoadingCatalog(true);
    try {
      const res = await fetch(`/api/admin/concierge/catalog?${new URLSearchParams({ propertyId: property.id })}`);
      if (!res.ok) throw new Error("fetch-error");
      const data = await res.json();
      setItems((data.items || []) as ConciergeItem[]);
      setGroups((data.groups || []) as ConciergeGroup[]);
    } catch {
      toast.error("Erro ao carregar catálogo.");
    } finally {
      setLoadingCatalog(false);
    }
  }, [property]);

  useEffect(() => { if (tab === "catalog" && property) void loadCatalog(); }, [tab, property, loadCatalog]);

  // Ações no pedido
  const runAction = useCallback(async (requestId: string, action: RequestAction) => {
    if (!property || !userData) return;
    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    try {
      if (action === "deliver") { await ConciergeService.deliverRequest(property.id, requestId, userData.id, userData.fullName); toast.success("Item entregue."); }
      else if (action === "return") { await ConciergeService.returnRequest(property.id, requestId, userData.id, userData.fullName); toast.success("Item retornado."); }
      else { await ConciergeService.markLost(property.id, requestId, userData.id, userData.fullName); toast.success("Item marcado como extraviado."); }
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "Erro ao processar ação.");
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  }, [property, userData]);

  // CRUD do catálogo
  const openNew = () => { setForm(defaultForm); setEditingId(null); setShowForm(true); };
  const openEdit = (item: ConciergeItem) => {
    setForm({
      name: item.name, name_en: item.name_en || "", name_es: item.name_es || "",
      description: item.description || "", description_en: item.description_en || "", description_es: item.description_es || "",
      category: item.category,
      price: String(item.price), loss_price: item.loss_price != null ? String(item.loss_price) : "",
      included_qty: String(item.included_qty), image_url: item.image_url || "",
      active: item.active, availableForGuest: item.availableForGuest ?? true,
      availableForMaid: item.availableForMaid ?? false, order: String(item.order ?? 0),
      groupId: item.groupId || "",
      // Migra vínculo legado 1:1 (productId) para ficha técnica ao abrir o item.
      deductFromStock: item.deductFromStock ?? (!!item.productId),
      stockComponents: item.stockComponents?.length ? item.stockComponents : (item.productId ? [{ productId: item.productId, consumptionQty: 1 }] : []),
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const openNewGroup = () => { setGroupForm(defaultGroupForm); setEditingGroupId(null); setShowGroupForm(true); };
  const openEditGroup = (g: ConciergeGroup) => {
    setGroupForm({ name: g.name, icon: g.icon || "📦", color: g.color || "#9b6dff", order: String(g.order ?? 0) });
    setEditingGroupId(g.id);
    setShowGroupForm(true);
  };

  const handleSaveGroup = async () => {
    if (!property || !userData || !groupForm.name.trim()) { toast.error("Nome é obrigatório."); return; }
    setSavingGroup(true);
    try {
      const payload = { name: groupForm.name.trim(), icon: groupForm.icon, color: groupForm.color, order: parseInt(groupForm.order) || 0, active: true };
      const res = editingGroupId
        ? await fetch(`/api/admin/concierge/groups/${editingGroupId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyId: property.id, ...payload }),
          })
        : await fetch(`/api/admin/concierge/groups`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyId: property.id, ...payload }),
          });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "save-error");
      toast.success(editingGroupId ? "Grupo atualizado." : "Grupo criado.");
      setShowGroupForm(false); setEditingGroupId(null); await loadCatalog();
    } catch (err: unknown) { toast.error(err instanceof Error && err.message ? err.message : "Erro ao salvar grupo."); }
    finally { setSavingGroup(false); }
  };

  const handleDeleteGroup = async (g: ConciergeGroup) => {
    if (!property || !userData) return;
    const ok = await confirm({ title: `Remover o grupo “${g.name}”?`, description: "Os itens continuam no catálogo, só perdem o agrupamento.", confirmLabel: "Remover", tone: "danger" });
    if (!ok) return;
    try {
      const res = await fetch(
        `/api/admin/concierge/groups/${g.id}?${new URLSearchParams({ propertyId: property.id })}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete-error");
      toast.success("Grupo removido.");
      await loadCatalog();
    } catch { toast.error("Erro ao remover grupo."); }
  };

  const handleSave = async () => {
    if (!property || !userData) return;
    if (!form.name.trim()) { toast.error("Nome é obrigatório."); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), name_en: form.name_en.trim() || undefined, name_es: form.name_es.trim() || undefined,
        description: form.description.trim() || undefined, description_en: form.description_en.trim() || undefined, description_es: form.description_es.trim() || undefined,
        category: form.category, price: parseFloat(form.price) || 0,
        loss_price: form.loss_price ? parseFloat(form.loss_price) : undefined,
        included_qty: parseInt(form.included_qty) || 0, image_url: form.image_url || undefined,
        active: form.active, availableForGuest: form.availableForGuest, availableForMaid: form.availableForMaid,
        order: parseInt(form.order) || 0,
        groupId: form.groupId || undefined,
        deductFromStock: form.deductFromStock,
        // Só linhas com produto e quantidade > 0. Vazio se toggle off.
        stockComponents: form.deductFromStock ? form.stockComponents.filter(c => c.productId && c.consumptionQty > 0) : [],
        productId: null,   // legado deprecado — leitura agora usa stockComponents
      };
      if (editingId) { await ConciergeService.updateItem(property.id, editingId, payload, userData.id, userData.fullName); toast.success("Item atualizado."); }
      else { await ConciergeService.createItem(property.id, payload, userData.id, userData.fullName); toast.success("Item criado."); }
      setShowForm(false); setEditingId(null); await loadCatalog();
    } catch (err: unknown) { toast.error(err instanceof Error && err.message ? err.message : "Erro ao salvar item."); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (item: ConciergeItem) => {
    if (!property || !userData) return;
    try {
      await ConciergeService.updateItem(property.id, item.id, { active: !item.active }, userData.id, userData.fullName);
      toast.success(item.active ? "Item desativado." : "Item ativado.");
      await loadCatalog();
    } catch { toast.error("Erro ao atualizar item."); }
  };

  const loadArchive = useCallback(async () => {
    if (!property) return;
    setLoadingArchive(true);
    try { setArchivedItems(await ConciergeService.getArchivedItems(property.id)); }
    finally { setLoadingArchive(false); }
  }, [property]);

  const handleDeleteItem = async (item: ConciergeItem) => {
    if (!property || !userData) return;
    const ok = await confirm({ title: `Arquivar “${item.name}”?`, description: "O item some do catálogo e do portal, mas pode ser restaurado no Arquivo.", confirmLabel: "Arquivar", tone: "danger" });
    if (!ok) return;
    try {
      await ConciergeService.deleteItem(property.id, item.id, userData.id, userData.fullName);
      toast.success("Item arquivado.");
      await loadCatalog();
      if (showArchive) await loadArchive();
    } catch { toast.error("Erro ao arquivar item."); }
  };

  const handleRestoreItem = async (item: ConciergeItem) => {
    if (!property || !userData) return;
    try {
      await ConciergeService.restoreItem(property.id, item.id, userData.id, userData.fullName);
      toast.success("Item restaurado.");
      await loadArchive();
      await loadCatalog();
    } catch { toast.error("Erro ao restaurar item."); }
  };

  const toggleArchive = () => { setShowArchive(p => { if (!p) void loadArchive(); return !p; }); };

  const derived = useMemo(() => {
    const urgentCount = openRequests.filter(r => r.urgency === "urgent").length;
    const delivered = history.filter(r => r.status === "delivered");
    return {
      urgentCount,
      todayDeliveredCount: delivered.length,
      todayDeliveredRevenue: delivered.reduce((s, r) => s + (r.total_price || 0), 0),
    };
  }, [openRequests, history]);

  return {
    property, propLoading, userData,
    openRequests, actionLoading, runAction,
    history, historyOffset, setHistoryOffset, loadingHistory,
    items, groups, loadingCatalog, loadCatalog,
    showForm, setShowForm, editingId, setEditingId, form, setForm, saving, handleSave, openNew, openEdit, handleToggleActive, handleDeleteItem,
    stockProducts, stockLocations, stockEnabled,
    archivedItems, showArchive, toggleArchive, loadingArchive, handleRestoreItem,
    showGroupForm, setShowGroupForm, editingGroupId, setEditingGroupId, groupForm, setGroupForm, savingGroup, handleSaveGroup, openNewGroup, openEditGroup, handleDeleteGroup,
    showNew, setShowNew, newItemPreset, setNewItemPreset,
    ...derived,
  };
}

export type ConciergeState = ReturnType<typeof useConcierge>;
