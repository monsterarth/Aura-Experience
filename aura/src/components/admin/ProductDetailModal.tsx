// src/components/admin/ProductDetailModal.tsx
// Ficha do produto — saldo por local, lotes/validade e histórico.
// Extraída de admin/estoque/produtos para ser a MESMA ficha em qualquer lugar
// que mostre um produto (lista de produtos, conteúdo de um estoque, etc.).
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ProductDetail } from "@/types/aura";
import { StockClient } from "@/lib/stock-client";
import { toast } from "sonner";
import { Dialog, SkeletonList } from "@/components/aura";
import { cn } from "@/lib/utils";
import { Package, MapPin, CalendarClock, History, ChevronRight, MessageSquareText } from "lucide-react";

const MOV_LABEL: Record<string, { label: string; color: string }> = {
  entry: { label: "Entrada", color: "text-emerald-500" },
  exit: { label: "Saída", color: "text-orange-500" },
  transfer: { label: "Transferência", color: "text-blue-500" },
  adjustment: { label: "Ajuste", color: "text-violet-500" },
  loss: { label: "Perda", color: "text-red-500" },
};

const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtDateTime = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

interface Props {
  propertyId: string;
  productId: string;
  onClose: () => void;
  /** Destaca o local de onde a ficha foi aberta, no "saldo por local". */
  highlightLocationId?: string;
}

export default function ProductDetailModal({ propertyId, productId, onClose, highlightLocationId }: Props) {
  const [detail, setDetail] = useState<ProductDetail | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    StockClient.productDetail(propertyId, productId)
      .then((d) => { if (alive) setDetail(d); })
      .catch((e) => toast.error((e as Error).message));
    return () => { alive = false; };
  }, [propertyId, productId]);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open onClose={onClose} presentation="auto" size="lg" icon={Package} title={detail ? detail.product.name : "Produto"} subtitle={detail ? <>{detail.product.category?.name ?? "Sem categoria"} · unidade {detail.product.unit}{detail.product.sku ? ` · ${detail.product.sku}` : ""}</> : undefined}>
        {!detail ? (
          <SkeletonList rows={5} avatar={false} />
        ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-secondary/40 rounded-xl p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Saldo total</div>
                  <div className="text-lg font-bold tabular-nums text-foreground">
                    {detail.balances.reduce((s, b) => s + Number(b.quantity), 0)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">{detail.product.unit}</span>
                  </div>
                </div>
                <div className="bg-secondary/40 rounded-xl p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Estoque mínimo</div>
                  <div className="text-lg font-bold tabular-nums text-foreground">{Number(detail.product.minStock)}</div>
                </div>
                <div className="bg-secondary/40 rounded-xl p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Locais com saldo</div>
                  <div className="text-lg font-bold tabular-nums text-foreground">
                    {detail.balances.filter((b) => Number(b.quantity) !== 0).length}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5"><MapPin size={13} /> Saldo por local</h3>
                {detail.balances.length ? (
                  <div className="space-y-0.5">
                    {detail.balances.map((b) => {
                      const here = b.locationId === highlightLocationId;
                      // Já estamos na página deste estoque: vira só destaque, sem link para si mesmo.
                      if (here) {
                        return (
                          <div key={b.id} className="flex justify-between text-sm font-bold -mx-2 px-2 py-1.5 rounded-lg bg-primary/10">
                            <span className="text-primary">{b.locationName} <span className="text-[10px] font-bold uppercase tracking-wider">· aqui</span></span>
                            <span className="tabular-nums text-primary">{Number(b.quantity)} {detail.product.unit}</span>
                          </div>
                        );
                      }
                      return (
                        <Link key={b.id} href={`/admin/estoque/locais/${b.locationId}`} onClick={onClose}
                          className="group flex justify-between items-center text-sm -mx-2 px-2 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors">
                          <span className="text-foreground flex items-center gap-1.5">
                            {b.locationName}
                            <ChevronRight size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                          <span className="tabular-nums text-muted-foreground">{Number(b.quantity)} {detail.product.unit}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : <p className="text-xs text-muted-foreground">Sem saldo em nenhum local.</p>}
              </div>

              {detail.product.trackExpiry && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5"><CalendarClock size={13} /> Lotes &amp; validade</h3>
                  {detail.batches.length ? (
                    <div className="space-y-1">
                      {detail.batches.map((b) => {
                        const expired = !!b.expiryDate && b.expiryDate < todayStr;
                        return (
                          <div key={b.id} className="flex justify-between text-sm">
                            <span className="text-foreground">
                              {b.locationName}{b.batchCode ? <span className="text-xs text-muted-foreground"> · lote {b.batchCode}</span> : null}
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="tabular-nums text-muted-foreground">{Number(b.quantity)} {detail.product.unit}</span>
                              <span className={cn("tabular-nums font-bold w-24 text-right", b.expiryDate ? (expired ? "text-red-500" : "text-amber-500") : "text-muted-foreground")}>
                                {b.expiryDate ? fmtDate(b.expiryDate) : "sem validade"}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">Nenhum lote com saldo.</p>}
                </div>
              )}

              <div>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><History size={13} /> Histórico de movimentação</h3>
                  <Link href={`/admin/estoque/movimentacoes/historico?productId=${encodeURIComponent(productId)}`} onClick={onClose}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground shrink-0">
                    Ver tudo →
                  </Link>
                </div>
                {detail.movements.length ? (
                  <table className="w-full text-sm">
                    <tbody>
                      {detail.movements.map((m) => {
                        const meta = MOV_LABEL[m.type] ?? { label: m.type, color: "text-foreground" };
                        return (
                          <React.Fragment key={m.id}>
                            <tr className={cn(!m.notes && "border-b border-border/40")}>
                              <td className="py-1.5 text-muted-foreground whitespace-nowrap pr-2">{fmtDateTime(m.createdAt)}</td>
                              <td className="py-1.5 pr-2"><span className={cn("font-bold", meta.color)}>{meta.label}</span></td>
                              <td className="py-1.5 text-right tabular-nums pr-2">{Number(m.quantity)}</td>
                              <td className="py-1.5 text-xs text-muted-foreground">
                                {m.fromLocation?.name}{m.fromStaffName ? ` · ${m.fromStaffName}` : ""}
                                {m.fromLocation?.name && m.toLocation?.name ? " → " : ""}
                                {m.toLocation?.name}{m.toStaffName ? ` · ${m.toStaffName}` : ""}
                              </td>
                            </tr>
                            {m.notes && (
                              <tr className="border-b border-border/40">
                                <td colSpan={4} className="pb-1.5">
                                  <p className="flex items-start gap-1.5 text-xs text-foreground/80 bg-secondary/40 rounded-lg px-2 py-1">
                                    <MessageSquareText size={12} className="shrink-0 mt-0.5 text-muted-foreground" />
                                    <span className="whitespace-pre-wrap">{m.notes}</span>
                                  </p>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                ) : <p className="text-xs text-muted-foreground">Sem movimentações.</p>}
              </div>
            </div>
        )}
    </Dialog>
  );
}
