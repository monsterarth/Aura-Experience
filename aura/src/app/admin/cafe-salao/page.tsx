// src/app/admin/cafe-salao/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Ban, Check, ChefHat, Coffee, Layers, LogIn, LogOut, MoveRight, Plus, RotateCcw, UserPlus, Users, UtensilsCrossed, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { BreakfastSalonService } from "@/services/breakfast-salon-service";
import type { BreakfastAttendance } from "@/types/aura";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import { PageShell, PageHeader, SegmentedTabs, SearchInput, Card, Pill, Button, IconButton, Loadable, SkeletonList, EmptyState, useTabParam } from "@/components/aura";
import { useCafeSalao } from "./_components/useCafeSalao";
import { WaiterOrderDialog, AssignTableDialog, VisitorDialog } from "./_components/CafeDialogs";
import { attendanceStatus, orderStatus, WAITER_TABS, type WaiterTab } from "./_components/cafe-utils";

export default function CafeSalaoPage() {
  return (
    <RoleGuard allowedRoles={["super_admin", "admin", "reception", "kitchen", "waiter"]}>
      <CafeSalaoInner />
    </RoleGuard>
  );
}

function CafeSalaoInner() {
  const s = useCafeSalao();
  const [tab, setTab] = useTabParam<WaiterTab>("tab", "lista", WAITER_TABS);
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<BreakfastAttendance | null>(null);
  const [visitorOpen, setVisitorOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  const today = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR });
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? s.attendances.filter(a => a.guestName.toLowerCase().includes(q) || a.cabinName.toLowerCase().includes(q)) : s.attendances;
  }, [s.attendances, search]);
  const tableName = (id?: string | null) => s.tables.find(t => t.id === id)?.name ?? "Mesa";

  return (
    <PageShell maxWidth="md">
      <PageHeader
        icon={Coffee}
        iconTone="amber"
        title="Café Salão"
        badge={s.session ? <Pill tone={s.isOpen ? "green" : "neutral"} dot label={s.isOpen ? "Salão aberto" : "Salão fechado"} /> : undefined}
        subtitle={<span style={{ textTransform: "capitalize" }}>{today}</span>}
        actions={(
          <>
            {s.isOpen
              ? <Button variant="soft" tone="red" onClick={() => void s.handleCloseSalon()} loading={s.sessionBusy}>Fechar salão</Button>
              : <Button variant="soft" tone="green" onClick={() => void s.handleOpenSalon()} loading={s.sessionBusy}>Abrir salão</Button>}
          </>
        )}
        primaryAction={{ label: "Novo pedido", icon: ChefHat, onClick: () => setOrderOpen(true), disabled: !s.isOpen }}
        tabs={(
          <SegmentedTabs<WaiterTab>
            items={[
              { id: "lista", label: "Lista", icon: Users, count: s.expectedCount || undefined },
              { id: "salao", label: "Salão", icon: UtensilsCrossed, count: s.seatedCount || undefined, tone: "green" },
              { id: "cozinha", label: "Cozinha", icon: ChefHat, count: s.pendingOrdersCount || undefined, tone: "orange" },
            ]}
            value={tab} onChange={setTab} ariaLabel="Seções do salão"
          />
        )}
      />

      <Loadable loading={s.loading} skeleton={<SkeletonList rows={6} avatar={false} />} error={s.error} onRetry={() => void s.reload()}>
        {!s.session ? (
          <EmptyState icon={Coffee} title="Salão ainda não aberto hoje" description="Abra o salão para carregar a lista de hóspedes do café e começar a sentar as mesas." action={{ label: "Abrir salão", onClick: () => void s.handleOpenSalon() }} />
        ) : tab === "lista" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Hóspede ou cabana…" debounce={150} fullWidth />
              <IconButton icon={UserPlus} label="Adicionar visitante" variant="secondary" size="lg" onClick={() => setVisitorOpen(true)} disabled={!s.isOpen} />
            </div>
            {filtered.length === 0 ? (
              <EmptyState icon={Users} title={search ? `Nada encontrado para “${search}”` : "Nenhum hóspede na lista"} description={search ? "Tente outro nome ou cabana." : "O cron das 8h preenche a lista automaticamente."} compact />
            ) : filtered.map(a => {
              const st = attendanceStatus(a.status);
              const busy = s.busyId === a.id;
              return (
                <Card key={a.id} pad={12}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.guestName}</div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{a.cabinName}{a.additionalGuests?.length ? ` · +${a.additionalGuests.length}` : ""}</div>
                      {a.tableId && <div style={{ fontSize: 11, color: T.green, fontWeight: 800, marginTop: 2 }}>{tableName(a.tableId)}</div>}
                    </div>
                    <Pill tone={st.tone} label={st.label} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {a.status === "expected" && <Button size="sm" variant="soft" tone="amber" icon={LogIn} loading={busy} onClick={() => void s.act(a.id, () => BreakfastSalonService.checkInGuest(a.id))}>Check-in</Button>}
                    {a.status === "arrived" && <Button size="sm" variant="soft" tone="green" icon={UtensilsCrossed} onClick={() => setAssignTarget(a)}>Sentar</Button>}
                    {a.status === "seated" && <Button size="sm" variant="soft" tone="blue" icon={MoveRight} onClick={() => setAssignTarget(a)}>Trocar mesa</Button>}
                    {(a.status === "arrived" || a.status === "seated") && <Button size="sm" variant="secondary" icon={LogOut} loading={busy} onClick={() => void s.act(a.id, () => BreakfastSalonService.guestLeft(a.id))}>Saiu</Button>}
                    {a.status !== "inactive" && a.status !== "left" && <Button size="sm" variant="ghost" tone="red" icon={Ban} loading={busy} onClick={() => void s.act(a.id, () => BreakfastSalonService.deactivateBreakfast(a.id))}>Desativar</Button>}
                    {(a.status === "inactive" || a.status === "left") && <Button size="sm" variant="soft" icon={RotateCcw} loading={busy} onClick={() => void s.act(a.id, () => BreakfastSalonService.reactivateBreakfast(a.id))}>Reativar</Button>}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : tab === "salao" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Button variant="outline" icon={Plus} onClick={() => void s.handleCreateTable()} disabled={!s.isOpen} fullWidth>Nova mesa</Button>
            {s.tablesWithGuests.length === 0 ? (
              <EmptyState compact icon={Layers} title="Nenhuma mesa criada" description="Crie a primeira mesa para começar a sentar os hóspedes." />
            ) : s.tablesWithGuests.map(t => {
              const open = t.status === "open";
              const tn = toneOf(open ? "green" : "neutral");
              return (
                <Card key={t.id} pad={12} style={{ opacity: open ? 1 : .7 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 900, color: T.text }}>
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: tn.color }} /> {t.name}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => void s.act(t.id, async () => { if (open) await BreakfastSalonService.closeTable(t.id); else await BreakfastSalonService.reopenTable(t.id); })} loading={s.busyId === t.id}>{open ? "Fechar" : "Reabrir"}</Button>
                  </div>
                  {t.attendances.length + t.visitors.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: T.muted2, textAlign: "center", padding: "6px 0" }}>Mesa vazia</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {t.attendances.map(a => (
                        <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", background: T.glass, borderRadius: 10 }}>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.text }}>{a.guestName}</span>
                            <span style={{ display: "block", fontSize: 11, color: T.muted }}>{a.cabinName}</span>
                          </span>
                          <IconButton icon={MoveRight} label="Trocar mesa" size="sm" onClick={() => setAssignTarget(a)} />
                        </div>
                      ))}
                      {t.visitors.map(v => (
                        <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", background: T.glass, borderRadius: 10 }}>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.text }}>{v.name}</span>
                            <span style={{ display: "block", fontSize: 11, color: T.muted }}>Visitante</span>
                          </span>
                          <IconButton icon={X} label="Remover visitante" size="sm" tone="red" onClick={() => void s.act(v.id, () => BreakfastSalonService.removeVisitor(v.id))} loading={s.busyId === v.id} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {s.activeOrders.length === 0 ? (
              <EmptyState compact icon={ChefHat} title="Nenhum pedido ativo" description="Pedidos do garçom e dos hóspedes aparecem aqui." />
            ) : s.activeOrders.map(o => {
              const st = orderStatus(o.status);
              return (
                <Card key={o.id} pad={12}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: T.text }}>{tableName(o.tableId)}</div>
                      {o.guestName && <div style={{ fontSize: 11, color: T.muted }}>{o.guestName} · {o.cabinName}</div>}
                      <div style={{ fontSize: 11, color: T.muted }}>{format(new Date(o.createdAt), "HH:mm")} · {o.requestedBy === "guest" ? "hóspede" : "garçom"}</div>
                    </div>
                    <Pill tone={st.tone} label={st.label} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: o.status === "preparing" ? 10 : 0 }}>
                    {o.items.map((item, i) => <span key={i} style={{ fontSize: 13, color: T.text }}>· {item.name} {item.flavor ? `(${item.flavor})` : ""} {item.quantity > 1 ? `×${item.quantity}` : ""}</span>)}
                  </div>
                  {o.status === "preparing" && (
                    <Button variant="soft" tone="green" icon={Check} fullWidth loading={s.busyId === o.id} onClick={() => void s.act(o.id, () => BreakfastSalonService.updateOrderStatus(o.id, "delivered"))}>Retirado da cozinha</Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Loadable>

      <AssignTableDialog open={!!assignTarget} attendance={assignTarget} tables={s.tables} session={s.session} propertyId={s.propertyId} actorName={s.actorName} onClose={() => setAssignTarget(null)} onAssigned={() => void s.reload()} />
      <VisitorDialog open={visitorOpen} tables={s.tables} session={s.session} propertyId={s.propertyId} actorName={s.actorName} onClose={() => setVisitorOpen(false)} onAdded={() => void s.reload()} />
      <WaiterOrderDialog open={orderOpen} propertyId={s.propertyId} tables={s.tables} attendances={s.attendances} onClose={() => setOrderOpen(false)} onSubmit={s.handlePlaceOrder} />
    </PageShell>
  );
}
