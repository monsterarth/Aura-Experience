"use client";

import React from "react";
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, Settings, ArrowUp, ArrowDown, Copy, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { T } from "@/lib/admin-tokens";
import { Card, Pill, Button, IconButton, SearchInput, Loadable, SkeletonList, EmptyState, FAB } from "@/components/aura";
import { useMenu } from "./_components/useMenu";
import { CategoryDialog, ItemDialog, SettingsDialog } from "./_components/MenuDialogs";

const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function FBMenuPage() {
  const menu = useMenu();

  const newItem = () => {
    if (menu.categories.length === 0) { toast.error("Crie uma categoria primeiro!"); return; }
    menu.openItem();
  };

  return (
    <>
      {/* Barra de ações do cardápio (o cabeçalho vem do layout do módulo) */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput value={menu.searchTerm} onChange={menu.setSearchTerm} placeholder="Buscar categorias…" wrapStyle={{ flex: "1 1 220px", maxWidth: 360 }} />
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <IconButton icon={Settings} label="Mensagens do café no portal" variant="secondary" onClick={() => menu.setSettingsOpen(true)} />
          <Button variant="secondary" icon={Plus} onClick={() => menu.openCategory()}>Nova categoria</Button>
          <Button variant="primary" icon={Plus} onClick={newItem} className="hidden sm:inline-flex">Novo item</Button>
        </div>
      </div>
      <FAB label="Novo item" icon={Plus} onClick={newItem} />

      <Loadable loading={menu.loading} skeleton={<SkeletonList rows={4} avatar={false} />}>
        {menu.categories.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="Nenhuma categoria cadastrada" description="Comece criando uma categoria (ex.: Bebidas, Pães) e depois os itens dentro dela." action={{ label: "Criar primeira categoria", icon: Plus, onClick: () => menu.openCategory() }} />
        ) : menu.filteredCategories.length === 0 ? (
          <EmptyState compact icon={UtensilsCrossed} title="Nenhuma categoria encontrada" description="Ajuste a busca." />
        ) : menu.filteredCategories.map(cat => {
          const catItems = menu.items.filter(i => i.categoryId === cat.id).sort((a, b) => (a.order || 0) - (b.order || 0));
          const idx = menu.categories.findIndex(c => c.id === cat.id);
          return (
            <Card key={cat.id} pad={0} style={{ overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, background: T.glass, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: T.text }}>{cat.name}</h2>
                      <Pill tone="neutral" label={cat.type === "both" ? "Restaurante & Café" : cat.type === "breakfast" ? "Só café da manhã" : "Só restaurante"} />
                      {cat.selectionTarget && <Pill tone="blue" label={cat.selectionTarget === "individual" ? `Por hóspede (máx. ${cat.maxPerGuest || 1})` : cat.selectionTarget === "group_portion" ? "Por grupo (porções)" : `Por grupo (piscina: ${cat.maxPerGuest || 1} un)`} />}
                      {cat.alaCarte && <Pill tone="orange" label="À la carte" />}
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: T.muted }}>{catItems.length} {catItems.length === 1 ? "item" : "itens"}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                    <IconButton icon={ArrowUp} label="Mover para cima" variant="ghost" size="sm" disabled={idx === 0} onClick={() => menu.moveCategory(idx, "up")} />
                    <IconButton icon={ArrowDown} label="Mover para baixo" variant="ghost" size="sm" disabled={idx === menu.categories.length - 1} onClick={() => menu.moveCategory(idx, "down")} />
                    <IconButton icon={Plus} label="Adicionar item" variant="soft" size="sm" onClick={() => menu.openItem(undefined, cat.id)} />
                    <IconButton icon={Edit2} label="Editar categoria" variant="ghost" size="sm" onClick={() => menu.openCategory(cat)} />
                    <IconButton icon={Copy} label="Duplicar categoria" variant="ghost" size="sm" onClick={() => menu.openCategory(cat, true)} />
                    <IconButton icon={Trash2} label="Excluir categoria" variant="ghost" tone="red" size="sm" onClick={() => menu.deleteCategory(cat)} />
                  </div>
                </div>
              </div>

              {catItems.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2" style={{ padding: 8 }}>
                  {catItems.map((item, i) => (
                    <div key={item.id} style={{ padding: 12, borderRadius: 14, border: `1px solid ${T.border}`, background: item.active ? T.card : T.glass, opacity: item.active ? 1 : .65, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.text, minWidth: 0 }}>{item.name}</h3>
                        {item.active ? <CheckCircle2 size={16} color={T.green} style={{ flexShrink: 0 }} /> : <XCircle size={16} color={T.muted2} style={{ flexShrink: 0 }} />}
                      </div>
                      {item.description && <p style={{ margin: 0, fontSize: 12, color: T.muted, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.description}</p>}
                      <div style={{ marginTop: "auto", paddingTop: 8, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontWeight: 900, color: T.brandText, fontVariantNumeric: "tabular-nums" }}>{money(item.price)}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                          <IconButton icon={ArrowUp} label="Subir" variant="ghost" size="sm" disabled={i === 0} onClick={() => menu.moveItem(cat.id, i, "up")} />
                          <IconButton icon={ArrowDown} label="Descer" variant="ghost" size="sm" disabled={i === catItems.length - 1} onClick={() => menu.moveItem(cat.id, i, "down")} />
                          <IconButton icon={Edit2} label="Editar" variant="ghost" size="sm" onClick={() => menu.openItem(item, cat.id)} />
                          <IconButton icon={Copy} label="Duplicar" variant="ghost" size="sm" onClick={() => menu.openItem(item, cat.id, true)} />
                          <IconButton icon={Trash2} label="Excluir" variant="ghost" tone="red" size="sm" onClick={() => menu.deleteItem(item)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: "center", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em", color: T.muted }}>Nenhum item nesta categoria</div>
              )}
            </Card>
          );
        })}
      </Loadable>

      <CategoryDialog menu={menu} />
      <ItemDialog menu={menu} />
      <SettingsDialog menu={menu} />
    </>
  );
}
