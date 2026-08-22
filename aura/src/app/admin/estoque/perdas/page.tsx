// src/app/admin/estoque/perdas/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { StockMovement, StockBatch, StockLossType } from "@/types/aura";
import ProductDetailModal from "@/components/admin/ProductDetailModal";
import { toast } from "sonner";
import { PageShell, PageHeader, SkeletonList } from "@/components/aura";
import { cn } from "@/lib/utils";
import { AlertOctagon, CalendarClock } from "lucide-react";

const LOSS_META: Record<string, { label: string; color: string }> = {
  expiry: { label: "Vencimento", color: "#ef4444" },
  damage: { label: "Quebra/Danificação", color: "#f59e0b" },
  handling: { label: "Manipulação", color: "#a78bfa" },
  other: { label: "Outros", color: "#9ca3af" },
};
const PERIODS = [7, 30, 90];

export default function PerdasPage() {
  const { currentProperty: property } = useProperty();
  const [days, setDays] = useState(30);
  const [losses, setLosses] = useState<StockMovement[]>([]);
  const [expiring, setExpiring] = useState<StockBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      const [l, e] = await Promise.all([StockClient.losses(property.id, days), StockClient.expiringBatches(property.id, 30)]);
      setLosses(l); setExpiring(e);
    } catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  }, [property?.id, days]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    const m = new Map<string, { count: number; cost: number }>();
    for (const l of losses) {
      const t = (l.lossType ?? "other") as StockLossType;
      const cur = m.get(t) ?? { count: 0, cost: 0 };
      cur.count += 1; cur.cost += Number(l.totalCost);
      m.set(t, cur);
    }
    return m;
  }, [losses]);
  const totalCost = useMemo(() => losses.reduce((s, l) => s + Number(l.totalCost), 0), [losses]);
  const maxCost = useMemo(() => Math.max(1, ...Array.from(summary.values()).map((v) => v.cost)), [summary]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const money = (n: number) => `R$ ${n.toFixed(2)}`;
  const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  return (
    <PageShell>
      <PageHeader
        icon={AlertOctagon}
        title="Perdas"
        subtitle={<>Total no período: <span className="font-bold text-red-500">{money(totalCost)}</span></>}
        actions={(<><div className="flex gap-1 bg-secondary/40 p-1 rounded-xl">
          {PERIODS.map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {d} dias
            </button>
          ))}
        </div></>)}
      />

      {loading ? (
        <SkeletonList rows={5} avatar={false} />
      ) : (
        <div className="space-y-6">
          {/* Validade */}
          {expiring.length > 0 && (
            <section className="bg-card border border-border rounded-2xl p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5"><CalendarClock size={14} /> Vencendo / vencidos (30 dias)</h2>
              <div className="space-y-1.5">
                {expiring.map((b) => {
                  const expired = !!b.expiryDate && b.expiryDate < todayStr;
                  return (
                    <div key={b.id} onClick={() => b.productId && setProductId(b.productId)}
                      className="flex items-center justify-between text-sm cursor-pointer hover:bg-secondary/30 -mx-2 px-2 py-0.5 rounded">
                      <span className="text-foreground">{b.product?.name ?? "—"} <span className="text-xs text-muted-foreground">· {b.location?.name ?? ""}</span></span>
                      <span className="flex items-center gap-3">
                        <span className="text-muted-foreground tabular-nums">{Number(b.quantity)} {b.product?.unit ?? ""}</span>
                        <span className={cn("tabular-nums font-bold w-20 text-right", expired ? "text-red-500" : "text-amber-500")}>
                          {b.expiryDate ? fmtDate(b.expiryDate) : "—"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Perdas por tipo */}
          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Perdas por tipo</h2>
            {totalCost === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma perda no período.</p>
            ) : (
              <div className="space-y-3">
                {Object.keys(LOSS_META).map((t) => {
                  const v = summary.get(t);
                  if (!v) return null;
                  const meta = LOSS_META[t];
                  const pct = Math.round((v.cost / totalCost) * 100);
                  return (
                    <div key={t}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-foreground">{meta.label} <span className="text-xs text-muted-foreground">({v.count})</span></span>
                        <span className="tabular-nums text-muted-foreground">{money(v.cost)} · {pct}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(v.cost / maxCost) * 100}%`, background: meta.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Lista */}
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2.5">
            {losses.map((l) => {
              const meta = LOSS_META[(l.lossType ?? "other")];
              return (
                <div key={l.id} onClick={() => l.productId && setProductId(l.productId)}
                  className="bg-card border border-border rounded-2xl p-4 cursor-pointer">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{fmtDate(l.createdAt)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 mt-1.5">
                    <p className="font-bold text-foreground truncate">{l.product?.name ?? "—"}</p>
                    <p className="text-base font-bold tabular-nums shrink-0">{Number(l.quantity)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{money(Number(l.totalCost))}</p>
                </div>
              );
            })}
            {losses.length === 0 && (
              <div className="bg-card border border-border rounded-2xl px-4 py-12 text-center text-sm text-muted-foreground">Nenhuma perda registrada no período.</div>
            )}
          </div>

          {/* Desktop: tabela */}
          <section className="hidden md:block bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th className="text-left px-4 py-3">Data</th>
                  <th className="text-left px-4 py-3">Produto</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-right px-4 py-3">Qtd.</th>
                  <th className="text-right px-4 py-3">Custo</th>
                </tr>
              </thead>
              <tbody>
                {losses.map((l) => {
                  const meta = LOSS_META[(l.lossType ?? "other")];
                  return (
                    <tr key={l.id} onClick={() => l.productId && setProductId(l.productId)}
                      className="border-b border-border/50 last:border-0 hover:bg-secondary/30 cursor-pointer">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                      <td className="px-4 py-3 text-foreground">{l.product?.name ?? "—"}</td>
                      <td className="px-4 py-3"><span className="font-bold" style={{ color: meta.color }}>{meta.label}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums">{Number(l.quantity)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(Number(l.totalCost))}</td>
                    </tr>
                  );
                })}
                {losses.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Nenhuma perda registrada no período.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {productId && property && (
        <ProductDetailModal propertyId={property.id} productId={productId} onClose={() => setProductId(null)} />
      )}
    </PageShell>
  );
}
