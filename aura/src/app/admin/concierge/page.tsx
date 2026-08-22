// src/app/admin/concierge/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, Archive, Building2, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Edit2, Layers, ListOrdered, Plus, RotateCcw, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import type { ConciergeGroup } from "@/types/aura";
import { T, alpha, tone as toneOf } from "@/lib/admin-tokens";
import {
  PageShell, PageHeader, KpiGrid, KpiCard, SegmentedTabs, SearchInput, FilterChips, Card, Pill, Button, IconButton,
  SectionLabel, EmptyState, PageSkeleton, SkeletonCards, SkeletonList, useTabParam,
} from "@/components/aura";
import { useConcierge } from "./_components/useConcierge";
import { PendingCard, DetailPanel, CatalogCard, ItemIcon } from "./_components/RequestCards";
import { NewRequestModal } from "./_components/NewRequestModal";
import { CatalogFormModal } from "./_components/CatalogFormModal";
import { GroupFormModal } from "./_components/GroupFormModal";
import { avatarFromName, categoryLabel, categoryTone, dayLabel, fmtBRL, formatDate, fullDayLabel, statusCfg, TABS, type EnrichedRequest, type Tab } from "./_components/concierge-utils";

type CatFilter = "all" | "loan" | "consumption";
type ReqByFilter = "all" | "guest" | "maid";
type AccessFilter = "all" | "guest" | "maid" | "both";

export default function AdminConciergePage() {
  const [tab, setTab] = useTabParam<Tab>("tab", "pending", TABS);
  const s = useConcierge(tab);
  const [filterCat, setFilterCat] = useState<CatFilter>("all");
  const [filterReqBy, setFilterReqBy] = useState<ReqByFilter>("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<EnrichedRequest | null>(null);
  const [catalogAccess, setCatalogAccess] = useState<AccessFilter>("all");

  const filteredOpen = useMemo(() => s.openRequests.filter(r => {
    if (filterCat !== "all" && r.item?.category !== filterCat) return false;
    if (filterReqBy !== "all" && r.requestedBy !== filterReqBy) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!((r.item?.name || "").toLowerCase().includes(q) || (r.cabinName || "").toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a, b) => b.ageMin - a.ageMin), [s.openRequests, filterCat, filterReqBy, search]);

  const filteredItems = useMemo(() => s.items.filter(item => {
    if (catalogAccess === "all") return true;
    if (!item.active) return true;
    if (catalogAccess === "guest") return item.availableForGuest;
    if (catalogAccess === "maid") return item.availableForMaid;
    return item.availableForGuest && item.availableForMaid;
  }), [s.items, catalogAccess]);

  const itemsByGroup = useMemo(() => [
    ...s.groups.map(g => ({ group: g as ConciergeGroup | null, items: filteredItems.filter(i => i.groupId === g.id) })).filter(x => x.items.length > 0),
    ...(filteredItems.some(i => !i.groupId) ? [{ group: null, items: filteredItems.filter(i => !i.groupId) }] : []),
  ], [s.groups, filteredItems]);

  if (s.propLoading) return <PageShell><PageSkeleton kpis={4} rows={6} /></PageShell>;
  if (!s.property) return <PageShell><EmptyState icon={Building2} title="Selecione uma propriedade" description="O concierge mostra os pedidos da propriedade ativa." /></PageShell>;

  const historyDelivered = s.history.filter(r => r.status === "delivered");

  return (
    <PageShell>
      <PageHeader
        icon={ShoppingBag}
        title="Concierge"
        badge={<Pill tone="green" dot label="Tempo real" />}
        subtitle={s.property.name}
        actions={tab === "catalog" ? <Button variant="secondary" icon={Plus} onClick={s.openNew}>Novo item</Button> : undefined}
        primaryAction={{ label: "Novo pedido", icon: Plus, onClick: () => { s.setNewItemPreset(null); s.setShowNew(true); } }}
        tabs={(
          <SegmentedTabs<Tab>
            items={[
              { id: "pending", label: "Pendentes", count: s.openRequests.length || undefined, tone: "amber" },
              { id: "history", label: "Histórico" },
              { id: "catalog", label: "Catálogo" },
            ]}
            value={tab} onChange={setTab} ariaLabel="Seções do concierge"
          />
        )}
      />

      <KpiGrid cols={4}>
        <KpiCard label="Pendentes" value={s.openRequests.length} icon={Clock} tone="amber" compact />
        <KpiCard label="Urgentes" value={s.urgentCount} icon={AlertTriangle} tone="red" compact />
        <KpiCard label="Entregues hoje" value={tab === "history" ? s.todayDeliveredCount : "—"} icon={CheckCircle2} tone="green" compact sub={tab !== "history" ? "veja no histórico" : undefined} />
        <KpiCard label="Faturado hoje" value={tab === "history" ? fmtBRL(s.todayDeliveredRevenue) : "—"} icon={Sparkles} tone="brand" compact sub={tab !== "history" ? "veja no histórico" : undefined} />
      </KpiGrid>

      {/* ── Pendentes ── */}
      {tab === "pending" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Item ou cabana…" debounce={150} wrapStyle={{ flex: "1 1 220px", maxWidth: 320 }} />
            <FilterChips<CatFilter> ariaLabel="Categoria" items={[{ id: "all", label: "Todos" }, { id: "loan", label: "Empréstimos" }, { id: "consumption", label: "Consumo" }]} value={filterCat} onChange={setFilterCat} />
            <FilterChips<ReqByFilter> ariaLabel="Solicitante" items={[{ id: "all", label: "Todos" }, { id: "guest", label: "Hóspede" }, { id: "maid", label: "Camareira" }]} value={filterReqBy} onChange={setFilterReqBy} />
          </div>
          {filteredOpen.length === 0 ? (
            <EmptyState icon={CheckCircle2} tone="green" title={s.openRequests.length === 0 ? "Tudo em ordem!" : "Nenhum pedido com esses filtros"} description={s.openRequests.length === 0 ? "Nenhum pedido pendente no momento." : "Ajuste os filtros para ver os outros pedidos."} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
              {filteredOpen.map(req => <PendingCard key={req.id} req={req} actioning={!!s.actionLoading[req.id]} onAction={s.runAction} onDetail={() => setDetail(req)} />)}
            </div>
          )}
        </>
      )}

      {/* ── Histórico ── */}
      {tab === "history" && (
        <div style={{ maxWidth: 820, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          <Card pad={12} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <IconButton icon={ChevronLeft} label="Dia anterior" variant="secondary" onClick={() => s.setHistoryOffset(o => o - 1)} />
            <div style={{ flex: 1, textAlign: "center", minWidth: 120 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: s.historyOffset === 0 ? T.brandText : T.text }}>{dayLabel(s.historyOffset)}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2, textTransform: "capitalize" }}>{fullDayLabel(s.historyOffset)}</div>
            </div>
            <IconButton icon={ChevronRight} label="Próximo dia" variant="secondary" onClick={() => s.setHistoryOffset(o => Math.min(0, o + 1))} disabled={s.historyOffset === 0} />
            <FilterChips<string> ariaLabel="Atalhos de dia" items={[0, -1, -2, -3].map(o => ({ id: String(o), label: dayLabel(o) }))} value={String(s.historyOffset)} onChange={v => s.setHistoryOffset(Number(v))} />
          </Card>

          {!s.loadingHistory && s.history.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Pill tone="green" size="md" label={`${historyDelivered.length} entregues`} />
              <Pill tone="blue" size="md" label={`${s.history.filter(r => r.status === "returned").length} devolvidos`} />
              <Pill tone="red" size="md" label={`${s.history.filter(r => r.status === "lost").length} extraviados`} />
              <Pill tone="brand" size="md" label={`Faturado: ${fmtBRL(historyDelivered.reduce((a, r) => a + (r.total_price || 0), 0))}`} style={{ marginLeft: "auto" }} />
            </div>
          )}

          {s.loadingHistory ? <SkeletonList rows={6} /> : s.history.length === 0 ? (
            <EmptyState icon={Calendar} title="Nenhum pedido registrado neste dia" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {s.history.map(req => {
                const sc = statusCfg(req.status);
                return (
                  <Card key={req.id} pad={12} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: T.glass2, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: T.muted }}>{avatarFromName(req.cabinName || "??")}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.quantity}× {req.item?.name || req.itemId}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{req.cabinName || "—"} · {formatDate(req.createdAt)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {(req.total_price ?? 0) > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: T.brandText }}>{fmtBRL(req.total_price!)}</span>}
                      <Pill tone={categoryTone(req.item?.category)} label={categoryLabel(req.item?.category)} />
                      <Pill tone={sc.tone} label={sc.label} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Catálogo ── */}
      {tab === "catalog" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <SectionLabel>Visível para</SectionLabel>
            <FilterChips<AccessFilter> ariaLabel="Visível para" items={[{ id: "all", label: "Todos" }, { id: "guest", label: "Só hóspede" }, { id: "maid", label: "Só camareira" }, { id: "both", label: "Ambos" }]} value={catalogAccess} onChange={setCatalogAccess} />
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: T.muted }}>{filteredItems.length} itens</span>
              <Button variant="soft" size="sm" icon={Layers} onClick={s.openNewGroup}>Novo grupo</Button>
              <Button variant={s.showArchive ? "soft" : "outline"} tone="red" size="sm" icon={Archive} onClick={s.toggleArchive}>Arquivo</Button>
            </span>
          </div>

          {s.groups.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {s.groups.map(g => (
                <span key={g.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 4px 3px 10px", borderRadius: 999, background: T.glass, border: `1px solid ${T.border2}`, fontSize: 12, fontWeight: 700, color: T.text }}>
                  <span style={{ fontSize: 15 }}>{g.icon}</span>
                  <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                  <IconButton icon={Edit2} label={`Editar grupo ${g.name}`} size="sm" onClick={() => s.openEditGroup(g)} />
                  <IconButton icon={Trash2} label={`Remover grupo ${g.name}`} size="sm" tone="red" onClick={() => void s.handleDeleteGroup(g)} />
                </span>
              ))}
            </div>
          )}

          {s.loadingCatalog ? <SkeletonCards n={8} minWidth={210} /> : itemsByGroup.length === 0 ? (
            <EmptyState icon={ListOrdered} title="Nenhum item cadastrado" description="Crie o primeiro item do catálogo do concierge." action={{ label: "Novo item", icon: Plus, onClick: s.openNew }} />
          ) : itemsByGroup.map(({ group, items: groupItems }) => {
            const gc = group?.color;
            return (
              <section key={group?.id ?? "__ungrouped"}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: gc ? alpha(gc, 10) : T.glass2, border: `1px solid ${gc ? alpha(gc, 25) : T.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
                    {group?.icon ?? <Layers size={13} color={T.muted} />}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: gc ?? T.muted }}>{group?.name ?? "Sem grupo"}</span>
                  <Pill tone="neutral" label={`${groupItems.length} itens`} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(210px, 100%), 1fr))", gap: 10 }}>
                  {groupItems.map(item => (
                    <CatalogCard key={item.id} item={item} onEdit={() => s.openEdit(item)} onToggleActive={() => void s.handleToggleActive(item)} onDelete={() => void s.handleDeleteItem(item)} onRequest={() => { s.setNewItemPreset(item); s.setShowNew(true); }} />
                  ))}
                </div>
              </section>
            );
          })}

          {s.showArchive && (
            <section style={{ borderTop: `1px solid ${T.redBorder}`, paddingTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: T.redBg, border: `1px solid ${T.redBorder}`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.red }}><Archive size={13} /></span>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: T.red }}>Arquivo</span>
                <Pill tone="red" label={`${s.archivedItems.length} itens`} />
                <span style={{ fontSize: 11, color: T.muted2 }}>Itens arquivados ficam ocultos do catálogo e do portal</span>
              </div>
              {s.loadingArchive ? <SkeletonList rows={3} /> : s.archivedItems.length === 0 ? (
                <EmptyState compact icon={Archive} title="Nenhum item arquivado" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {s.archivedItems.map(item => (
                    <Card key={item.id} pad={12} style={{ display: "flex", alignItems: "center", gap: 12, opacity: .8 }}>
                      <ItemIcon item={item} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.muted, textDecoration: "line-through" }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: T.muted2, marginTop: 2 }}>{item.group?.name ?? "Sem grupo"} · {categoryLabel(item.category)}</div>
                      </div>
                      <Button variant="soft" tone="green" size="sm" icon={RotateCcw} onClick={() => void s.handleRestoreItem(item)}>Restaurar</Button>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <DetailPanel req={detail} open={!!detail} onClose={() => setDetail(null)} onAction={s.runAction} />
      <NewRequestModal open={s.showNew} preset={s.newItemPreset} onClose={() => { s.setShowNew(false); s.setNewItemPreset(null); }} />
      <CatalogFormModal open={s.showForm} form={s.form} setForm={s.setForm} editingId={s.editingId} saving={s.saving} groups={s.groups} stockProducts={s.stockProducts} stockLocations={s.stockLocations} stockEnabled={s.stockEnabled} onClose={() => { s.setShowForm(false); s.setEditingId(null); }} onSave={() => void s.handleSave()} />
      <GroupFormModal open={s.showGroupForm} form={s.groupForm} setForm={s.setGroupForm} editingId={s.editingGroupId} saving={s.savingGroup} onClose={() => { s.setShowGroupForm(false); s.setEditingGroupId(null); }} onSave={() => void s.handleSaveGroup()} />
    </PageShell>
  );
}
