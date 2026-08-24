// src/app/admin/cabins/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { useAuth } from "@/context/AuthContext";
import { CabinService } from "@/services/cabin-service";
import { Cabin, CabinArea, CabinBed, CabinCategory } from "@/types/aura";
import {
  Home, Plus, Wifi, Trash2, Edit3, Users, X, Hammer, Hash, Layers,
  Building2, PlusCircle, BedDouble, Sparkles, Copy, Loader2, Tag, Link2, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageShell, PageHeader, Button, Dialog, SkeletonCards, EmptyState, useConfirm } from "@/components/aura";

// ==========================================
// GERENCIADOR DE CATEGORIAS
// ==========================================
// Categoria é entidade canônica: cabanas e tabelas de preço do Tarifário
// apontam para o mesmo id. Renomear aqui reescreve o nome das cabanas.

function CategoryManagerModal({
  propertyId, categories, onClose, onChanged,
}: {
  propertyId: string;
  categories: CabinCategory[];
  onClose: () => void;
  onChanged: (createdId?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Partial<CabinCategory>>({ name: "", shortName: "", siteUrl: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const reset = () => { setDraft({ name: "", shortName: "", siteUrl: "" }); setEditingId(null); };

  const save = async () => {
    if (!draft.name?.trim()) return toast.error("Informe o nome da categoria.");
    setSaving(true);
    try {
      const id = await CabinService.saveCategory(propertyId, {
        id: editingId ?? undefined,
        name: draft.name,
        shortName: draft.shortName,
        siteUrl: draft.siteUrl,
        order: draft.order ?? categories.length,
      });
      toast.success(editingId ? "Categoria atualizada." : "Categoria criada.");
      const wasNew = !editingId;
      reset();
      await onChanged(wasNew ? id : undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar a categoria.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: CabinCategory) => {
    if (!(await confirm({ title: "Excluir categoria?", description: `"${c.name}" deixa de existir para cabanas e tarifário.`, confirmLabel: "Excluir", tone: "danger" }))) return;
    try {
      await CabinService.deleteCategory(propertyId, c.id);
      toast.success("Categoria excluída.");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  };

  return (
    <Dialog open onClose={onClose} presentation="auto" size="lg" title="Categorias" subtitle="Usadas pelas cabanas e pelo tarifário">
        <div className="space-y-6">
          <div className="bg-secondary/50 border border-dashed border-border p-6 rounded-[24px] space-y-4">
            <h3 className="text-[10px] font-black uppercase text-primary tracking-widest">
              {editingId ? "Editar categoria" : "Nova categoria"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Nome operacional *</label>
                <input
                  value={draft.name ?? ""}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Ex: Praia - 2 Dormitórios"
                  className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground"
                />
                <p className="text-[9px] text-muted-foreground ml-1">Compõe o nome da cabana: &quot;01 - Praia - 2 Dormitórios&quot;.</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Nome comercial</label>
                <input
                  value={draft.shortName ?? ""}
                  onChange={e => setDraft({ ...draft, shortName: e.target.value })}
                  placeholder="Ex: Praia 2"
                  className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground"
                />
                <p className="text-[9px] text-muted-foreground ml-1">Usado nos orçamentos e no WhatsApp.</p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[9px] font-black uppercase text-muted-foreground ml-1 flex items-center gap-1">
                  <Link2 size={10} /> Link no site
                </label>
                <input
                  value={draft.siteUrl ?? ""}
                  onChange={e => setDraft({ ...draft, siteUrl: e.target.value })}
                  placeholder="https://…"
                  className="w-full bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              {editingId && (
                <button type="button" onClick={reset} className="px-4 py-2 text-[10px] font-black uppercase text-muted-foreground hover:text-foreground">
                  Cancelar
                </button>
              )}
              <button type="button" onClick={save} disabled={saving}
                className="px-6 py-3 bg-primary text-primary-foreground font-black uppercase text-[10px] rounded-xl active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 size={12} className="animate-spin" />}
                {editingId ? "Atualizar" : "Criar categoria"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {categories.length === 0 && (
              <div className="text-xs text-muted-foreground p-6 bg-secondary rounded-xl border border-dashed border-border text-center">
                Nenhuma categoria cadastrada ainda.
              </div>
            )}
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-secondary border border-border p-4 rounded-2xl">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {c.shortName ? `“${c.shortName}” · ` : ""}
                    {c.cabinCount ?? 0} cabana(s)
                    {c.siteUrl ? " · link ok" : ""}
                  </p>
                </div>
                <button type="button" title="Editar"
                  onClick={() => { setEditingId(c.id); setDraft({ name: c.name, shortName: c.shortName ?? "", siteUrl: c.siteUrl ?? "", order: c.order }); }}
                  className="p-2 bg-background text-muted-foreground rounded-xl hover:text-primary transition-colors">
                  <Edit3 size={15} />
                </button>
                <button type="button" title="Excluir" onClick={() => remove(c)}
                  className="p-2 bg-background text-muted-foreground rounded-xl hover:text-red-500 transition-colors">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
            <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              Renomear uma categoria reescreve o nome de todas as cabanas dela. Os preços do
              tarifário acompanham automaticamente, porque apontam para o id — não para o texto.
            </p>
          </div>
        </div>
    </Dialog>
  );
}

export default function CabinsPage() {
  const { currentProperty: property, loading: propertyLoading } = useProperty();
  const confirm = useConfirm();
  const { userData } = useAuth();

  // Flag de segurança: Verifica se quem está acessando é ESTRITAMENTE a Governanta
  const isGovOnly = userData?.role === 'governance';

  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [categories, setCategories] = useState<CabinCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCabin, setEditingCabin] = useState<Partial<Cabin> | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchNumbers, setBatchNumbers] = useState("");
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  // Normaliza layout legado (area.beds → area.configs) para compatibilidade com dados antigos
  const normalizeLayout = (layout?: any[]): any[] | undefined => {
    if (!layout) return layout;
    return layout.map(area => ({
      ...area,
      configs: area.configs ?? (area.beds ? [area.beds] : [[]])
    }));
  };

  const loadCabins = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      const [data, cats] = await Promise.all([
        CabinService.getCabinsByProperty(property.id),
        CabinService.getCategories(property.id),
      ]);
      setCabins(data);
      setCategories(cats);
    } catch (error) {
      toast.error("Erro ao carregar unidades.");
    } finally {
      setLoading(false);
    }
  }, [property?.id]);

  useEffect(() => {
    if (property?.id) {
      loadCabins();
    } else {
      setCabins([]);
      setLoading(false);
    }
  }, [property, loadCabins]);

  const handleOpenModal = (cabin?: Cabin, isClone = false) => {
    if (isClone && cabin) {
      const { id, createdAt, updatedAt, number, ...rest } = cabin;
      setEditingCabin({
        ...rest,
        layout: normalizeLayout(rest.layout),
        number: "",
        status: "available"
      });
      setIsBatchMode(false);
    } else {
      setEditingCabin(cabin ? { ...cabin, layout: normalizeLayout(cabin.layout) } : {
        number: "",
        categoryId: "",
        capacity: 2,
        status: "available",
        active: true,
        ignoreInOccupancy: false,
        allowedSetups: [],
        wifi: { ssid: "", password: "" },
        equipment: [],
        housekeepingItems: []
      });
      setIsBatchMode(false);
    }
    setBatchNumbers("");
    setIsModalOpen(true);
  };

  const handleOpenBatchModal = () => {
    setEditingCabin({
      categoryId: "",
      capacity: 2,
      status: "available",
      active: true,
      ignoreInOccupancy: false,
      allowedSetups: [],
      wifi: { ssid: "", password: "" },
      equipment: [],
      housekeepingItems: []
    });
    setIsBatchMode(true);
    setBatchNumbers("");
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property?.id || !editingCabin?.categoryId) {
      return toast.error("Selecione a categoria da unidade.");
    }

    if (!isBatchMode && !editingCabin?.number) {
      return toast.error("Informe o número da unidade.");
    }

    if (isBatchMode && !batchNumbers) {
      return toast.error("Informe os números para criação em lote.");
    }

    const cleanHousekeeping = editingCabin.housekeepingItems?.filter(i => i.label.trim() !== "") || [];

    try {
      if (isBatchMode) {
        // Processar números em lote (ex: 101,102,105 ou 101-105)
        const numbers = batchNumbers.split(',').flatMap(part => {
          if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
              return Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
            }
          }
          return part.trim();
        }).filter(n => n !== "");

        await CabinService.saveCabinsBatch(property.id, { ...editingCabin, housekeepingItems: cleanHousekeeping }, numbers);
        toast.success(`${numbers.length} unidades criadas com sucesso!`);
      } else {
        await CabinService.saveCabin(property.id, { ...editingCabin, housekeepingItems: cleanHousekeeping });
        toast.success("Unidade configurada com sucesso!");
      }
      setIsModalOpen(false);
      loadCabins();
    } catch (error) {
      toast.error("Erro ao salvar.");
    }
  };

  const handleDelete = async (cabinId: string) => {
    if (!property?.id) return;
    if (!(await confirm({ title: "Excluir unidade?", description: "A cabana some das listas e do mapa. Esta ação não pode ser desfeita.", confirmLabel: "Excluir", tone: "danger" }))) return;
    try {
      await CabinService.deleteCabin(property.id, cabinId);
      toast.success("Unidade removida.");
      loadCabins();
    } catch (error) {
      toast.error("Erro ao excluir.");
    }
  };

  const addArea = () => setEditingCabin(c => ({
    ...c,
    layout: [...(c?.layout || []), { id: crypto.randomUUID(), name: '', type: 'room', configs: [[]] }]
  }));

  const removeArea = (areaId: string) => setEditingCabin(c => ({
    ...c,
    layout: c?.layout?.filter(a => a.id !== areaId)
  }));

  const updateArea = (areaId: string, patch: Partial<CabinArea>) => setEditingCabin(c => ({
    ...c,
    layout: c?.layout?.map(a => a.id === areaId ? { ...a, ...patch } : a)
  }));

  const addConfig = (areaId: string) => setEditingCabin(c => ({
    ...c,
    layout: c?.layout?.map(a => a.id === areaId
      ? { ...a, configs: [...(a.configs || []), []] }
      : a)
  }));

  const removeConfig = (areaId: string, configIdx: number) => setEditingCabin(c => ({
    ...c,
    layout: c?.layout?.map(a => a.id === areaId
      ? { ...a, configs: a.configs.filter((_, i) => i !== configIdx) }
      : a)
  }));

  const addBed = (areaId: string, configIdx: number) => setEditingCabin(c => ({
    ...c,
    layout: c?.layout?.map(a => a.id === areaId
      ? { ...a, configs: a.configs.map((cfg, i) => i === configIdx
          ? [...cfg, { id: crypto.randomUUID(), type: 'double' as const, label: '' }]
          : cfg) }
      : a)
  }));

  const removeBed = (areaId: string, configIdx: number, bedId: string) => setEditingCabin(c => ({
    ...c,
    layout: c?.layout?.map(a => a.id === areaId
      ? { ...a, configs: a.configs.map((cfg, i) => i === configIdx
          ? cfg.filter(b => b.id !== bedId)
          : cfg) }
      : a)
  }));

  const updateBed = (areaId: string, configIdx: number, bedId: string, patch: Partial<CabinBed>) => setEditingCabin(c => ({
    ...c,
    layout: c?.layout?.map(a => a.id === areaId
      ? { ...a, configs: a.configs.map((cfg, i) => i === configIdx
          ? cfg.map(b => b.id === bedId ? { ...b, ...patch } : b)
          : cfg) }
      : a)
  }));

  const addEquipment = () => {
    const currentEq = editingCabin?.equipment || [];
    setEditingCabin({
      ...editingCabin,
      equipment: [...currentEq, { id: Date.now().toString(), type: "", model: "", manualUrl: "" }]
    });
  };

  const removeEquipment = (id: string) => {
    const filtered = (editingCabin?.equipment || []).filter(e => e.id !== id);
    setEditingCabin({ ...editingCabin, equipment: filtered });
  };

  const addHousekeepingItem = () => {
    const current = editingCabin?.housekeepingItems || [];
    setEditingCabin({ ...editingCabin, housekeepingItems: [...current, { id: Date.now().toString(), label: "" }] });
  };

  const updateHousekeepingItem = (id: string, label: string) => {
    const current = editingCabin?.housekeepingItems || [];
    setEditingCabin({ ...editingCabin, housekeepingItems: current.map(i => i.id === id ? { ...i, label } : i) });
  };

  const removeHousekeepingItem = (id: string) => {
    const current = editingCabin?.housekeepingItems || [];
    setEditingCabin({ ...editingCabin, housekeepingItems: current.filter(i => i.id !== id) });
  };

  if (!property && !propertyLoading) {
    return (
      <PageShell><EmptyState icon={Building2} title="Selecione uma propriedade" description="As cabanas são por propriedade — escolha uma no menu lateral." /></PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        icon={Home}
        title={property?.name ?? "Cabanas"}
        subtitle="Gestão de unidades e inventário"
        primaryAction={!isGovOnly ? { label: "Nova unidade", icon: Plus, onClick: () => handleOpenModal() } : undefined}
        actions={!isGovOnly ? (
          <>
            <Button variant="secondary" icon={Tag} onClick={() => setIsCategoryManagerOpen(true)}>Categorias</Button>
            <Button variant="secondary" icon={Layers} onClick={() => handleOpenBatchModal()}>Criar em lote</Button>
          </>
        ) : undefined}
      />

      {loading ? (
        <SkeletonCards n={6} minWidth={300} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cabins.map((cabin) => (
            <div key={cabin.id} className="bg-card border border-border rounded-[40px] p-8 space-y-6 group hover:border-primary/40 transition-all flex flex-col shadow-sm">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                    cabin.status === 'available' ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-secondary text-muted-foreground border-border"
                  )}>
                    {cabin.status}
                  </div>
                  {cabin.ignoreInOccupancy && (
                    <div className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-amber-500/10 text-amber-600 border-amber-500/20">
                      Fora da ocupação
                    </div>
                  )}
                  {cabin.active === false && (
                    <div className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-red-500/10 text-red-600 border-red-500/20">
                      Desativada
                    </div>
                  )}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  {!isGovOnly && (
                    <button onClick={() => handleOpenModal(cabin, true)} title="Clonar" className="p-2 bg-secondary text-muted-foreground rounded-xl hover:text-primary transition-colors"><Copy size={16} /></button>
                  )}
                  <button onClick={() => handleOpenModal(cabin)} title="Editar" className="p-2 bg-secondary text-muted-foreground rounded-xl hover:text-primary transition-colors"><Edit3 size={16} /></button>
                  {/* Governanta não pode apagar cabanas */}
                  {!isGovOnly && (
                    <button onClick={() => handleDelete(cabin.id)} title="Excluir" className="p-2 bg-secondary text-muted-foreground rounded-xl hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  )}
                </div>
              </div>

              <div>
                <p className="text-primary font-black text-4xl tracking-tighter leading-none">{cabin.number}</p>
                <h3 className="text-xl font-bold text-foreground mt-2">{cabin.category}</h3>
              </div>

              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase">
                  <Users size={14} className="text-primary" /> {cabin.capacity} Pessoas
                </div>
                <div className="flex flex-wrap gap-1">
                  {cabin.layout?.map(a => (
                    <span key={a.id} className="bg-secondary border border-border px-2 py-1 rounded-md text-[8px] font-bold text-muted-foreground uppercase">
                      {a.name || a.type}{a.configs?.length > 1 ? ` (${a.configs.length} opções)` : a.configs?.[0]?.length ? ` (${a.configs[0].length} leitos)` : ''}
                    </span>
                  ))}
                  {(!cabin.layout || cabin.layout.length === 0) && cabin.allowedSetups?.map(s => (
                    <span key={s} className="bg-secondary border border-border px-2 py-1 rounded-md text-[8px] font-bold text-muted-foreground uppercase">{s}</span>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 border-t border-border pt-6">
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase">
                  <Wifi size={14} className={cabin.wifi?.ssid ? "text-green-500" : ""} /> Wifi
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase">
                  <Hammer size={14} className={cabin.equipment?.length ? "text-primary" : ""} /> {cabin.equipment?.length || 0} Itens
                </div>
                {cabin.housekeepingItems && cabin.housekeepingItems.length > 0 && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-orange-500 uppercase">
                    <Sparkles size={14} /> POP Extra
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isCategoryManagerOpen && property?.id && (
        <CategoryManagerModal
          propertyId={property.id}
          categories={categories}
          onClose={() => setIsCategoryManagerOpen(false)}
          onChanged={async (createdId) => {
            await loadCabins();
            // Categoria criada de dentro do formulário da cabana já entra selecionada.
            if (createdId && isModalOpen) {
              setEditingCabin(c => ({ ...c!, categoryId: createdId }));
            }
          }}
        />
      )}

      {isModalOpen && (
        <Dialog open onClose={() => setIsModalOpen(false)} presentation="auto" size="xl" rawBody title={isBatchMode ? "Criar unidades em lote" : "Configurar unidade"} ariaLabel="Configurar unidade">
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <div className="p-5 sm:p-8 space-y-10 overflow-y-auto custom-scrollbar flex-1 min-h-0">

              <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {isBatchMode ? (
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                      <Hash size={12} /> Números (ex: 101, 102, 105 ou 101-105)
                    </label>
                    <input
                      value={batchNumbers}
                      onChange={e => setBatchNumbers(e.target.value)}
                      placeholder="Ex: 101, 102, 105-110"
                      className="w-full bg-background border border-border p-4 rounded-2xl outline-none focus:border-primary text-xl font-bold text-foreground"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                      <Hash size={12} /> Número
                    </label>
                    <input
                      disabled={isGovOnly && !editingCabin?.id} // Bloqueado p/ gov só se estiver criando, mas gov não cria. 
                      value={editingCabin?.number}
                      onChange={e => setEditingCabin({ ...editingCabin!, number: e.target.value })}
                      placeholder="Ex: 01"
                      className="w-full bg-background border border-border p-4 rounded-2xl outline-none focus:border-primary text-xl font-bold text-foreground disabled:opacity-50"
                    />
                  </div>
                )}
                <div className="space-y-2 md:col-span-1">
                  <label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <Layers size={12} /> Categoria
                  </label>
                  <select
                    disabled={isGovOnly}
                    value={editingCabin?.categoryId ?? ""}
                    onChange={e => {
                      if (e.target.value === "__new__") {
                        setIsCategoryManagerOpen(true);
                        return;
                      }
                      setEditingCabin({ ...editingCabin!, categoryId: e.target.value });
                    }}
                    className="w-full bg-background border border-border p-4 rounded-2xl outline-none focus:border-primary text-xl font-bold text-foreground disabled:opacity-50"
                  >
                    <option value="" disabled>Selecione…</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    {!isGovOnly && <option value="__new__">+ Nova categoria…</option>}
                  </select>
                </div>
                {!isBatchMode && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                      <Users size={12} /> Capacidade
                    </label>
                    <input
                      disabled={isGovOnly}
                      type="number"
                      value={editingCabin?.capacity}
                      onChange={e => setEditingCabin({ ...editingCabin!, capacity: Number(e.target.value) })}
                      className="w-full bg-background border border-border p-4 rounded-2xl outline-none focus:border-primary text-xl font-bold text-foreground disabled:opacity-50"
                    />
                  </div>
                )}
                {isBatchMode && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                      <Users size={12} /> Capacidade (Base)
                    </label>
                    <input
                      disabled={isGovOnly}
                      type="number"
                      value={editingCabin?.capacity}
                      onChange={e => setEditingCabin({ ...editingCabin!, capacity: Number(e.target.value) })}
                      className="w-full bg-background border border-border p-4 rounded-2xl outline-none focus:border-primary text-xl font-bold text-foreground disabled:opacity-50"
                    />
                  </div>
                )}
              </section>

              {/* Fora de operação ≠ fora da ocupação: a de cima some das listagens
                  (grade de últimas saídas), a de baixo só não conta na taxa. */}
              <label className={cn(
                "flex items-center gap-3 p-4 rounded-2xl border transition-colors",
                editingCabin?.active === false ? "bg-red-500/10 border-red-500/30" : "bg-secondary border-border",
                isGovOnly ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-accent"
              )}>
                <input
                  type="checkbox"
                  disabled={isGovOnly}
                  checked={editingCabin?.active !== false}
                  onChange={e => setEditingCabin({ ...editingCabin!, active: e.target.checked })}
                  className="accent-red-500 w-4 h-4"
                />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-foreground uppercase tracking-tighter">Cabana ativa</span>
                  <span className="text-[9px] text-muted-foreground">Desmarque para tirar de operação — some da grade de últimas saídas</span>
                </div>
              </label>

              <label className={cn(
                "flex items-center gap-3 p-4 rounded-2xl border transition-colors",
                editingCabin?.ignoreInOccupancy ? "bg-amber-500/10 border-amber-500/30" : "bg-secondary border-border",
                isGovOnly ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-accent"
              )}>
                <input
                  type="checkbox"
                  disabled={isGovOnly}
                  checked={!!editingCabin?.ignoreInOccupancy}
                  onChange={e => setEditingCabin({ ...editingCabin!, ignoreInOccupancy: e.target.checked })}
                  className="accent-amber-500 w-4 h-4"
                />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-foreground uppercase tracking-tighter">Ignorar na ocupação</span>
                  <span className="text-[9px] text-muted-foreground">Cabana extra / uso da casa — não conta na taxa de ocupação</span>
                </div>
              </label>

              <section className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] flex items-center gap-2">
                    <BedDouble size={14} /> Layout da Cabana
                  </h4>
                  {!isGovOnly && (
                    <button type="button" onClick={addArea} className="text-[10px] font-black uppercase bg-primary/10 text-primary px-4 py-2 rounded-xl hover:bg-primary/20 transition-all">
                      + Área
                    </button>
                  )}
                </div>

                {(!editingCabin?.layout || editingCabin.layout.length === 0) && (
                  <div className="text-xs text-muted-foreground p-4 bg-secondary rounded-xl border border-dashed border-border text-center">
                    Nenhuma área configurada. Clique em &quot;+ Área&quot; para adicionar quartos, suítes ou sala.
                  </div>
                )}

                <div className="space-y-4">
                  {editingCabin?.layout?.map((area) => (
                    <div key={area.id} className="bg-secondary border border-border p-5 rounded-[24px] space-y-4 animate-in slide-in-from-top-2">
                      <div className="flex gap-3 items-center">
                        <input
                          disabled={isGovOnly}
                          value={area.name}
                          onChange={e => updateArea(area.id, { name: e.target.value })}
                          placeholder="Nome da área (ex: Quarto Principal)"
                          className="flex-1 bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground disabled:opacity-50"
                        />
                        <select
                          disabled={isGovOnly}
                          value={area.type}
                          onChange={e => updateArea(area.id, { type: e.target.value as CabinArea['type'] })}
                          className="bg-background border border-border p-3 rounded-xl text-sm outline-none focus:border-primary text-foreground disabled:opacity-50"
                        >
                          <option value="room">Quarto</option>
                          <option value="suite">Suíte</option>
                          <option value="living_room">Sala</option>
                        </select>
                        {!isGovOnly && (
                          <button type="button" onClick={() => removeArea(area.id)} className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3 pl-1">
                        {(area.configs || [[]]).map((config, configIdx) => (
                          <div key={configIdx} className="bg-background border border-border rounded-2xl p-4 space-y-2 animate-in slide-in-from-top-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-primary/60">
                                {area.configs.length > 1 ? `Opção ${String.fromCharCode(65 + configIdx)}` : 'Leitos desta área'}
                              </span>
                              {!isGovOnly && area.configs.length > 1 && (
                                <button type="button" onClick={() => removeConfig(area.id, configIdx)} className="text-[9px] font-black uppercase text-red-500/60 hover:text-red-500 transition-colors">
                                  Remover variante
                                </button>
                              )}
                            </div>

                            {config.map(bed => (
                              <div key={bed.id} className="flex gap-2 items-center">
                                <select
                                  disabled={isGovOnly}
                                  value={bed.type}
                                  onChange={e => updateBed(area.id, configIdx, bed.id, { type: e.target.value as CabinBed['type'] })}
                                  className="bg-secondary border border-border p-2 rounded-xl text-xs outline-none focus:border-primary text-foreground disabled:opacity-50"
                                >
                                  <option value="single">Solteiro</option>
                                  <option value="double">Casal</option>
                                  <option value="extra">Extra</option>
                                  <option value="sofa_bed">Sofá-Cama</option>
                                </select>
                                <input
                                  disabled={isGovOnly}
                                  value={bed.label}
                                  onChange={e => updateBed(area.id, configIdx, bed.id, { label: e.target.value })}
                                  placeholder="Rótulo (ex: Cama 1)"
                                  className="flex-1 bg-secondary border border-border p-2 rounded-xl text-xs outline-none focus:border-primary text-foreground disabled:opacity-50"
                                />
                                {!isGovOnly && (
                                  <button type="button" onClick={() => removeBed(area.id, configIdx, bed.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            ))}

                            {!isGovOnly && (
                              <button type="button" onClick={() => addBed(area.id, configIdx)} className="text-[10px] font-black uppercase text-primary/60 hover:text-primary flex items-center gap-1 mt-1 transition-colors">
                                <PlusCircle size={12} /> Leito
                              </button>
                            )}
                          </div>
                        ))}

                        {!isGovOnly && (
                          <button type="button" onClick={() => addConfig(area.id)} className="text-[10px] font-black uppercase text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors border border-dashed border-border rounded-xl px-3 py-2 w-full justify-center">
                            <PlusCircle size={12} /> Adicionar variante de montagem
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-secondary/50 border border-border p-8 rounded-[32px] space-y-6">
                <h4 className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2">
                  <Wifi size={16} /> Rede Wireless da Unidade
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <input
                    disabled={isGovOnly}
                    placeholder="Rede (SSID)"
                    value={editingCabin?.wifi?.ssid}
                    onChange={e => setEditingCabin({ ...editingCabin!, wifi: { ...editingCabin?.wifi!, ssid: e.target.value } })}
                    className="bg-background border border-border p-4 rounded-2xl outline-none text-sm text-foreground disabled:opacity-50"
                  />
                  <input
                    disabled={isGovOnly}
                    placeholder="Senha"
                    value={editingCabin?.wifi?.password}
                    onChange={e => setEditingCabin({ ...editingCabin!, wifi: { ...editingCabin?.wifi!, password: e.target.value } })}
                    className="bg-background border border-border p-4 rounded-2xl outline-none text-sm text-foreground disabled:opacity-50"
                  />
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] flex items-center gap-2">
                    <Hammer size={16} /> Equipamentos & Manuais
                  </h4>
                  {!isGovOnly && <button type="button" onClick={addEquipment} className="text-[10px] font-black uppercase bg-primary/10 text-primary px-4 py-2 rounded-xl hover:bg-primary/20 transition-all">+ Item</button>}
                </div>

                <div className="space-y-4">
                  {editingCabin?.equipment?.map((eq, idx) => (
                    <div key={eq.id} className="bg-secondary border border-border p-6 rounded-[24px] grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-2">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-muted-foreground uppercase ml-1">Tipo</label>
                        <input
                          disabled={isGovOnly}
                          placeholder="Ex: Banheira"
                          value={eq.type}
                          onChange={e => {
                            const newEq = [...editingCabin.equipment!];
                            newEq[idx].type = e.target.value;
                            setEditingCabin({ ...editingCabin, equipment: newEq });
                          }}
                          className="w-full bg-background border border-border p-3 rounded-xl text-xs outline-none text-foreground disabled:opacity-50"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-muted-foreground uppercase ml-1">Modelo/Ref</label>
                        <input
                          disabled={isGovOnly}
                          placeholder="Ex: Jacuzzi 500L"
                          value={eq.model}
                          onChange={e => {
                            const newEq = [...editingCabin.equipment!];
                            newEq[idx].model = e.target.value;
                            setEditingCabin({ ...editingCabin, equipment: newEq });
                          }}
                          className="w-full bg-background border border-border p-3 rounded-xl text-xs outline-none text-foreground disabled:opacity-50"
                        />
                      </div>
                      <div className="space-y-1 relative">
                        <label className="text-[8px] font-black text-muted-foreground uppercase ml-1">Manual (URL)</label>
                        <div className="flex gap-2">
                          <input
                            disabled={isGovOnly}
                            placeholder="Link do PDF/Vídeo"
                            value={eq.manualUrl}
                            onChange={e => {
                              const newEq = [...editingCabin.equipment!];
                              newEq[idx].manualUrl = e.target.value;
                              setEditingCabin({ ...editingCabin, equipment: newEq });
                            }}
                            className="flex-1 bg-background border border-border p-3 rounded-xl text-xs outline-none text-foreground disabled:opacity-50"
                          />
                          {!isGovOnly && (
                            <button type="button" onClick={() => removeEquipment(eq.id)} className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* MÓDULO DE PROCEDIMENTOS ESPECÍFICOS DA CABANA (LIVRE PARA GOVERNANÇA) */}
              <section className="space-y-4 pt-4 border-t border-border">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] flex items-center gap-2">
                    <Sparkles size={16} className={isGovOnly ? "text-primary" : ""} /> Procedimentos Específicos da Cabana
                  </h4>
                  <button type="button" onClick={addHousekeepingItem} className="text-[10px] font-black uppercase bg-primary/10 text-primary px-4 py-2 rounded-xl hover:bg-primary/20 transition-all">+ Tarefa</button>
                </div>
                <p className="text-xs text-muted-foreground">Adicione tarefas que a camareira deve fazer apenas nesta unidade toda vez que for limpar.</p>

                <div className="space-y-3">
                  {editingCabin?.housekeepingItems?.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input
                        value={item.label}
                        onChange={e => updateHousekeepingItem(item.id, e.target.value)}
                        placeholder="Ex: Limpar filtro do ofurô"
                        className="flex-1 bg-background border border-border p-3 rounded-xl text-xs outline-none focus:border-primary text-foreground"
                      />
                      <button type="button" onClick={() => removeHousekeepingItem(item.id)} className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-all"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {(!editingCabin?.housekeepingItems || editingCabin.housekeepingItems.length === 0) && (
                    <div className="text-xs text-muted-foreground p-4 bg-secondary rounded-xl border border-dashed border-border text-center">Nenhum procedimento específico criado.</div>
                  )}
                </div>
              </section>

            </div>

            <footer className="ak-dialog__footer" style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="primary">Confirmar configuração</Button>
            </footer>
          </form>
        </Dialog>
      )}
    </PageShell>
  );
}

