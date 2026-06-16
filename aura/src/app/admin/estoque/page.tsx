// src/app/admin/estoque/page.tsx — Visão Geral do Estoque (dashboard)
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { StockDashboard, StockMovementType } from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Loader2, Package, DollarSign, AlertTriangle, Clock, ShoppingCart, CalendarClock,
  Target, TrendingDown, Receipt,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, CartesianGrid,
} from "recharts";

const PALETTE = ["#9b6dff", "#4ec9d4", "#f59e0b", "#2dd4bf", "#60a5fa", "#f87171", "#a78bfa", "#34d399"];
const LOSS_LABELS: Record<string, string> = { expiry: "Vencimento", damage: "Quebra/Danif.", handling: "Manipulação", other: "Outros" };
const MOV_LABELS: Record<StockMovementType, string> = { entry: "Entrada", exit: "Saída", transfer: "Transf.", adjustment: "Ajuste", loss: "Perda" };
const PERIODS = [7, 30, 90];

const money = (n: number) => `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);

const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, color: "hsl(var(--foreground))" };

function Kpi({ icon: Icon, label, value, sub, tone = "default" }: { icon: React.ElementType; label: string; value: string; sub?: string; tone?: "default" | "amber" | "red" | "emerald" }) {
  const toneCls = tone === "amber" ? "text-amber-500" : tone === "red" ? "text-red-500" : tone === "emerald" ? "text-emerald-500" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon size={15} />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <div className={cn("text-2xl font-bold tabular-nums", toneCls)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function EstoqueDashboardPage() {
  const { currentProperty: property } = useProperty();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<StockDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try { setData(await StockClient.dashboard(property.id, days)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id, days]);
  useEffect(() => { load(); }, [load]);

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  const k = data?.kpis;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Visão Geral — Estoque</h1>
          <p className="text-sm text-muted-foreground">Indicadores de compras, consumo e estoque.</p>
        </div>
        <div className="flex gap-1 bg-secondary/40 p-1 rounded-xl">
          {PERIODS.map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {d} dias
            </button>
          ))}
        </div>
      </header>

      {loading || !data || !k ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={DollarSign} label="Valor em estoque" value={money(k.stockValue)} sub={`${k.totalProducts} produtos · ${k.totalUnits} un`} />
            <Kpi icon={Receipt} label={`CMV (${days}d)`} value={money(k.cmv)} sub="Consumo concierge/F&B" />
            <Kpi icon={AlertTriangle} label="Estoque mínimo" value={String(k.lowStockCount)} sub="produtos abaixo do mínimo" tone={k.lowStockCount > 0 ? "amber" : "default"} />
            <Kpi icon={TrendingDown} label={`Perdas (${days}d)`} value={money(k.lossesValue)} tone={k.lossesValue > 0 ? "red" : "default"} />
            <Kpi icon={Target} label="Acuracidade" value={k.accuracy != null ? `${k.accuracy}%` : "—"} sub="último inventário" tone={k.accuracy != null && k.accuracy >= 95 ? "emerald" : "default"} />
            <Kpi icon={Clock} label="Sem giro" value={String(k.noTurnoverCount)} sub={money(k.noTurnoverValue)} tone={k.noTurnoverCount > 0 ? "amber" : "default"} />
            <Kpi icon={ShoppingCart} label={`Compras (${days}d)`} value={money(k.purchasesTotal)} sub={`${k.purchasesCount} recebidas`} />
            <Kpi icon={CalendarClock} label="Validade próxima" value={String(k.expiringCount)} sub="lotes vencendo/vencidos" tone={k.expiringCount > 0 ? "amber" : "default"} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Distribuição por categoria */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Distribuição por categoria</h2>
              {data.byCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Sem valor em estoque.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={200}>
                    <PieChart>
                      <Pie data={data.byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {data.byCategory.map((c, i) => <Cell key={i} fill={c.color || PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {data.byCategory.slice(0, 6).map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color || PALETTE[i % PALETTE.length] }} />
                        <span className="flex-1 truncate text-foreground">{c.name}</span>
                        <span className="tabular-nums text-muted-foreground">{money(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Movimentações R$/dia */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Entradas vs Saídas (R$/dia)</h2>
              {data.movementsDaily.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Sem movimentações no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.movementsDaily} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gEntry" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.5} /><stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} /></linearGradient>
                      <linearGradient id="gExit" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={40} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} labelFormatter={(l) => shortDate(String(l))} />
                    <Area type="monotone" dataKey="entry" name="Entradas" stroke="#2dd4bf" fill="url(#gEntry)" strokeWidth={2} />
                    <Area type="monotone" dataKey="exit" name="Saídas" stroke="#f59e0b" fill="url(#gExit)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Losses + low stock */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Perdas por tipo</h2>
              {data.lossesByType.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma perda no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.lossesByType.map(l => ({ ...l, label: LOSS_LABELS[l.type] ?? l.type }))} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={40} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: "hsl(var(--secondary))", opacity: 0.4 }} />
                    <Bar dataKey="value" name="Perda" fill="#f87171" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Estoque mínimo</h2>
              {data.lowStockItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Tudo acima do mínimo. 👍</p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {data.lowStockItems.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate flex items-center gap-1.5"><AlertTriangle size={12} className="text-amber-500 shrink-0" />{p.name}</span>
                      <span className="tabular-nums shrink-0"><b className="text-amber-500">{p.qty}</b> <span className="text-muted-foreground">/ {p.min} {p.unit}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Resumo de movimentações + últimas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Movimentações ({days}d)</h2>
              <div className="space-y-2">
                {(Object.keys(MOV_LABELS) as StockMovementType[]).map((t) => (
                  <div key={t} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{MOV_LABELS[t]}</span>
                    <span className="tabular-nums font-bold text-foreground">{data.movementsSummary[t] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 lg:col-span-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Últimas movimentações</h2>
              {data.recentMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Sem movimentações.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.recentMovements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground mr-2">{MOV_LABELS[m.type]}</span>
                        {m.product?.name ?? "—"}
                      </span>
                      <span className="tabular-nums text-muted-foreground shrink-0">{Number(m.quantity)}{Number(m.totalCost) > 0 ? ` · ${money(Number(m.totalCost))}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
