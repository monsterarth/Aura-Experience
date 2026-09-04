"use client";

import React from "react";
import { AlertTriangle, ArrowRight, BellRing, Calendar, CheckCircle2, Clock, Coffee, ExternalLink, Info, MessageCircleWarning, Sparkles, Star, Timer, Utensils, Dog } from "lucide-react";
import type { ConciergeRequest, FBOrder, HousekeepingTask } from "@/types/aura";
import { T, tone as toneOf } from "@/lib/admin-tokens";
import { Card, Pill, EmptyState, Button, SectionLabel, SegmentedTabs } from "@/components/aura";
import { formatOrderItems, formatTimeAgo, getElapsed, taskStatusInfo, taskTypeLabel, type AlertItem, type StructureAgendaItem } from "./reception-utils";
import type { BreakfastMode } from "./useReceptionLive";

const MAX_TASKS = 8;

const tile: React.CSSProperties = { background: T.glass, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px", minWidth: 0 };
const strong: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const mutedS: React.CSSProperties = { fontSize: 11, color: T.muted };
const stack: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

/** Tarefas ativas da governança + cabanas recém-liberadas. */
export function GovernanceCard({ tasks, recentlyReleased }: {
  tasks: { task: HousekeepingTask; location: string; assignees: string }[]; recentlyReleased: string[];
}) {
  return (
    <Card
      header={{ icon: Sparkles, tone: "brand", title: "Governança", sub: "tarefas em andamento", aside: tasks.length > 0 ? <Pill tone="brand" label={String(tasks.length)} /> : undefined }}
      footer={tasks.length > MAX_TASKS ? (
        <>
          <span style={mutedS}>Mostrando {MAX_TASKS} de {tasks.length}</span>
          <Button variant="link" size="sm" href="/admin/governance/kanban" iconRight={ArrowRight}>Ver todas</Button>
        </>
      ) : undefined}
    >
      {tasks.length === 0 ? (
        <EmptyState compact icon={Sparkles} title="Nenhuma tarefa ativa" />
      ) : (
        <div style={stack}>
          {tasks.slice(0, MAX_TASKS).map(({ task, location, assignees }) => {
            const st = taskStatusInfo(task.status);
            return (
              <div key={task.id} style={{ ...tile, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={strong}>{location}</span>
                  <Pill tone="brand" label={taskTypeLabel(task.type)} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ ...mutedS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assignees}</span>
                  <Pill tone={st.tone} label={st.label} />
                </div>
                {task.startedAt && (
                  <span style={{ ...mutedS, display: "inline-flex", alignItems: "center", gap: 4 }}><Timer size={11} /> {getElapsed(task)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {recentlyReleased.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
          <SectionLabel style={{ marginBottom: 8 }}>Recém liberadas</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {recentlyReleased.map(name => <Pill key={name} tone="emerald" icon={CheckCircle2} label={name} size="md" />)}
          </div>
        </div>
      )}
    </Card>
  );
}

const AGENDA_TONE = { in_use: "orange", upcoming: "blue", freed: "emerald" } as const;

/** Reservas das estruturas de hoje. */
export function StructuresAgendaCard({ items }: { items: StructureAgendaItem[] }) {
  return (
    <Card header={{ icon: Calendar, tone: "violet", title: "Agenda das estruturas", sub: "reservas de hoje" }}>
      {items.length === 0 ? (
        <EmptyState compact icon={Calendar} title="Nenhuma reserva hoje" />
      ) : (
        <div style={stack}>
          {items.map(est => {
            const t = toneOf(AGENDA_TONE[est.status]);
            return (
              <div key={est.id} style={{ ...tile, display: "flex", alignItems: "center", gap: 10 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0, boxShadow: est.status === "in_use" ? `0 0 8px ${t.color}` : "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={strong}>{est.name}</div>
                  <div style={mutedS}>
                    {est.status === "in_use" && `Em uso por ${est.by} até ${est.until}`}
                    {est.status === "upcoming" && `Reserva ${est.by} às ${est.at}`}
                    {est.status === "freed" && `Liberada ${est.freedAgo}`}
                  </div>
                </div>
                {est.needCleaning && <Pill tone="red" label="Limpar" />}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Detratores e falhas de envio nas últimas 48h. */
export function AlertsCard({ items, onPetException }: {
  items: AlertItem[];
  /** Abre o modal de decisão. Sem ele, o item de pet segue só informando. */
  onPetException?: (item: unknown) => void;
}) {
  const hasAlerts = items.length > 0;
  return (
    <Card tone={hasAlerts ? "red" : undefined} header={{ icon: AlertTriangle, tone: hasAlerts ? "red" : "neutral", title: "Atenção requerida", sub: "últimas 48 horas", aside: hasAlerts ? <Pill tone="red" label={String(items.length)} /> : undefined }}>
      {!hasAlerts ? (
        <EmptyState compact icon={CheckCircle2} tone="green" title="Nenhum alerta" description="Nada exige atenção nas últimas 48h." />
      ) : (
        <div style={stack}>
          {items.map(a => {
          const clicavel = a.type === "pet_exception" && !!onPetException && !!a.petException;
          return (
            <div
              key={a.id}
              onClick={clicavel ? () => onPetException!(a.petException) : undefined}
              role={clicavel ? "button" : undefined}
              tabIndex={clicavel ? 0 : undefined}
              onKeyDown={clicavel ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPetException!(a.petException); } } : undefined}
              style={{ ...tile, background: T.card, display: "flex", gap: 10, cursor: clicavel ? "pointer" : undefined }}
            >
              <span style={{ flexShrink: 0, marginTop: 2 }}>
                {a.type === "review" ? <Star size={15} color={T.amber} fill={T.amber} />
                  : a.type === "pet_exception" ? <Dog size={15} color={T.red} />
                  : <MessageCircleWarning size={15} color={T.red} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{a.title}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{a.desc}</div>
                <div style={{ fontSize: 10, color: T.muted2, marginTop: 6, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  {a.time}{clicavel ? " · toque para decidir" : ""}
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}
    </Card>
  );
}

/** Pedidos de concierge pendentes (realtime). */
export function GuestRequestsCard({ requests }: { requests: ConciergeRequest[] }) {
  return (
    <Card header={{ icon: BellRing, tone: "blue", title: "Pedidos dos hóspedes", sub: "concierge e empréstimos", aside: requests.length > 0 ? <Pill tone="orange" label={`${requests.length} pendente${requests.length > 1 ? "s" : ""}`} /> : undefined }}>
      {requests.length === 0 ? (
        <EmptyState compact icon={BellRing} title="Nenhum pedido pendente" />
      ) : (
        <div style={stack}>
          {requests.map(p => (
            <div key={p.id} style={{ ...tile, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <Pill tone="blue" label={p.item?.category === "loan" ? "Empréstimo" : "Concierge"} />
                <div style={{ ...strong, marginTop: 4 }}>{p.item?.name ?? p.itemId}</div>
                <div style={mutedS}>{p.cabinName ?? "—"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                <Pill tone="orange" label="Aguardando" />
                <span style={{ ...mutedS, display: "inline-flex", alignItems: "center", gap: 4 }}><Timer size={11} /> {formatTimeAgo(p.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const MODE_ITEMS = [
  { id: "delivery" as const, label: "Cesta delivery" },
  { id: "buffet" as const, label: "Buffet salão" },
];

/** Café da manhã: modalidade do dia + pedidos de hoje/amanhã. */
export function BreakfastCard({ orders, mode, onMode, showModeSwitch, saving }: {
  orders: (FBOrder & { cabinName?: string })[]; mode: BreakfastMode; onMode: (m: BreakfastMode) => void; showModeSwitch: boolean; saving?: boolean;
}) {
  const today = new Date().toISOString().split("T")[0];
  return (
    <Card
      style={{ display: "flex", flexDirection: "column" }}
      header={{ icon: Coffee, tone: "amber", title: "Café da manhã & F&B", sub: "pedidos de hoje e amanhã", aside: <Pill tone="amber" label={String(orders.length)} /> }}
      footer={<Button variant="secondary" icon={ExternalLink} href="/admin/food-and-beverage/orders" fullWidth>Ver todos / imprimir pedidos</Button>}
    >
      {showModeSwitch && (
        <div style={{ marginBottom: 14, opacity: saving ? .7 : 1 }}>
          <SectionLabel style={{ marginBottom: 6 }}>Modalidade de hoje</SectionLabel>
          <SegmentedTabs<BreakfastMode> items={MODE_ITEMS} value={mode} onChange={onMode} fullWidth size="sm" ariaLabel="Modalidade do café" />
        </div>
      )}
      {orders.length === 0 ? (
        <EmptyState compact icon={Coffee} title="Nenhum pedido de café da manhã" />
      ) : (
        <div style={stack}>
          {orders.map(order => {
            const isToday = !order.deliveryDate || order.deliveryDate === today;
            return (
              <div key={order.id} style={{ ...tile, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={strong}>{order.cabinName ?? "Cabana"}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {!isToday && <Pill tone="blue" label="Amanhã" />}
                    <span style={{ ...mutedS, display: "inline-flex", alignItems: "center", gap: 4, fontVariantNumeric: "tabular-nums" }}><Clock size={11} /> {order.deliveryTime ?? "—"}</span>
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: T.muted, fontStyle: "italic", lineHeight: 1.4 }}>“{formatOrderItems(order.items as unknown[])}”</p>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {order.status === "preparing"
                    ? <Pill tone="amber" icon={Utensils} label="Preparando" />
                    : <Pill tone="neutral" label="Aguardando" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {mode === "buffet" && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 12, display: "flex", gap: 10, color: T.text }}>
          <Info size={16} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
            A modalidade de hoje é <strong>Buffet Salão</strong>. Os pedidos acima são de estadias que pediram café no quarto como serviço à parte.
          </p>
        </div>
      )}
    </Card>
  );
}
