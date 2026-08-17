// src/components/admin/StockBatchPanel.tsx
"use client";

// Detalhe de um lote de movimentações — o que foi lançado junto, na íntegra.
//
// Por que existe: a etiqueta "LOTE" era um BOTÃO DE ESTORNO disfarçado de rótulo.
// Quem clicava esperando ver o conteúdo do lote acabava numa confirmação de
// estorno — e a confirmação contava só as linhas carregadas na tela (as últimas
// 80), enquanto o servidor invertia o lote inteiro. Dava para ler "1" e inverter 12.
//
// Agora a etiqueta faz o que aparenta: abre a lista. O estorno só existe onde
// `onReverted` é passado (a tela de Histórico) e vive DENTRO deste painel — não dá
// para estornar sem antes ver o que vai ser invertido, e a contagem é a do servidor.

import React, { useState, useEffect, useCallback } from "react";
import { StockClient } from "@/lib/stock-client";
import { StockBatchDetail, StockMovementType } from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Loader2, ArrowDownToLine, ArrowUpFromLine, Repeat, SlidersHorizontal,
  AlertOctagon, Undo2,
} from "lucide-react";

const TYPE_META: Record<StockMovementType, { label: string; icon: React.ElementType; color: string }> = {
  entry:      { label: "Entrada",       icon: ArrowDownToLine,   color: "text-emerald-500" },
  exit:       { label: "Saída",         icon: ArrowUpFromLine,   color: "text-orange-500" },
  transfer:   { label: "Transferência", icon: Repeat,            color: "text-blue-500" },
  adjustment: { label: "Ajuste",        icon: SlidersHorizontal, color: "text-violet-500" },
  loss:       { label: "Perda",         icon: AlertOctagon,      color: "text-red-500" },
};

export default function StockBatchPanel({ propertyId, batchRef, onReverted }: {
  propertyId: string;
  batchRef: string;
  /** Passe para habilitar o estorno. Sem isto o painel é só leitura. */
  onReverted?: () => void;
}) {
  const [detail, setDetail] = useState<StockBatchDetail | null>(null);
  const [reverting, setReverting] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await StockClient.batchMovements(propertyId, batchRef));
    } catch (e) {
      toast.error((e as Error).message);
      setDetail({ movements: [], reversalCount: 0 });
    }
  }, [propertyId, batchRef]);

  useEffect(() => { load(); }, [load]);

  const rows = detail?.movements ?? null;
  // Lote já revertido não pode convidar a uma segunda inversão: estornar duas vezes
  // RE-APLICA o movimento original no saldo, sem erro nenhum na tela.
  const alreadyReverted = (detail?.reversalCount ?? 0) > 0;

  const revert = async () => {
    if (!rows?.length) return;
    if (!confirm(
      `Estornar o lote inteiro?\n\n` +
      `${rows.length} movimentação(ões) receberão uma movimentação INVERSA, incluindo as que ` +
      `não aparecem na tela. Nada é apagado do histórico — o estorno entra como lançamento novo.`
    )) return;
    setReverting(true);
    try {
      const r = await StockClient.revertBatch(propertyId, batchRef);
      toast.success(`${r.reverted} movimentação(ões) estornada(s).`);
      onReverted?.();
      load();
    } catch (e) { toast.error((e as Error).message); } finally { setReverting(false); }
  };

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
        <Loader2 size={13} className="animate-spin" /> Carregando o lote…
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="px-4 py-3 text-xs text-muted-foreground">Lote não encontrado.</div>;
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border bg-background/40">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-secondary/30">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Lote {batchRef.slice(0, 8)} · {rows.length} movimentação(ões)
        </span>
        {onReverted && (
          alreadyReverted ? (
            <span title="Estornar de novo re-aplicaria o movimento original no saldo."
              className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20">
              Lote já estornado
            </span>
          ) : (
            <button onClick={revert} disabled={reverting}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50">
              {reverting ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
              Estornar lote
            </button>
          )
        )}
      </div>

      <div className="divide-y divide-border/60">
        {rows.map((m) => {
          const meta = TYPE_META[m.type];
          const Icon = meta.icon;
          return (
            <div key={m.id} className="flex items-start gap-3 px-4 py-2 text-xs">
              <span className="font-mono text-muted-foreground whitespace-nowrap mt-0.5">
                {new Date(m.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className={cn("inline-flex items-center gap-1 font-bold whitespace-nowrap", meta.color)}>
                <Icon size={12} /> {meta.label}
              </span>
              <span className="flex-1 min-w-0 text-foreground">
                {m.product?.name ?? "—"}
                {m.notes && <span className="block text-[11px] text-muted-foreground mt-0.5">{m.notes}</span>}
              </span>
              <span className="tabular-nums font-bold text-foreground whitespace-nowrap">{Number(m.quantity)}</span>
              <span className="text-muted-foreground whitespace-nowrap hidden sm:block">
                {m.fromLocation?.name}{m.fromLocation?.name && m.toLocation?.name ? " → " : ""}{m.toLocation?.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
