// Painel de diárias da estadia: uma linha por noite, com valor efetivo,
// situação (lançada / a lançar) e as ações de negociação.
//
// Toda escrita passa pelo gate de gerência: se o operador não for gerente, a
// ação abre o modal de autorização e só então é enviada (a credencial vai
// junto da requisição e é conferida no servidor).
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BadgePercent, CalendarDays, Check, Loader2, Pause, Play, RotateCcw, X, XCircle,
} from "lucide-react";
import { LodgingNight } from "@/types/aura";
import { ManagerApprovalModal, ManagerOverride } from "./ManagerApprovalModal";

interface PendingAction {
  action: "pause" | "resume" | "setNight";
  refDate?: string;
  value?: number | null;
  /** Texto mostrado ao gerente: o que ele está autorizando. */
  description: string;
}

const fmtBR = (iso: string) => iso.split("-").reverse().join("/");
const money = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function LodgingPanel({
  propertyId, stayId, onChanged, readOnly,
}: {
  propertyId: string;
  stayId: string;
  /** Avisa o modal-pai para recarregar o fólio (valores mudaram). */
  onChanged: () => void;
  /** Conta encerrada: as diárias viram extrato, sem pausa nem negociação. */
  readOnly?: boolean;
}) {
  const [nights, setNights] = useState<LodgingNight[]>([]);
  const [paused, setPaused] = useState(false);
  const [effectiveTotal, setEffectiveTotal] = useState(0);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/finance/lodging?propertyId=${propertyId}&stayId=${stayId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNights(data.nights || []);
      setPaused(!!data.paused);
      setEffectiveTotal(Number(data.effectiveTotal) || 0);
      setIsManager(!!data.isManager);
    } catch {
      toast.error("Erro ao carregar as diárias.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, stayId]);

  useEffect(() => { load(); }, [load]);

  /** Envia a ação; se o servidor exigir gerente, abre o modal. */
  const run = async (a: PendingAction, override?: ManagerOverride) => {
    setBusy(true);
    setApprovalError(null);
    try {
      const res = await fetch("/api/admin/finance/lodging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId, stayId,
          action: a.action, refDate: a.refDate, value: a.value,
          ...(override ? { override } : {}),
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.status === 403 && data?.error === "MANAGER_APPROVAL_REQUIRED") {
        setPending(a);            // pede autorização e repete a mesma ação
        return;
      }
      if (!res.ok) {
        const msg = data?.message || data?.error || "Falha na operação.";
        if (pending) setApprovalError(msg); else toast.error(msg);
        return;
      }

      setNights(data.nights || []);
      setPaused(!!data.paused);
      setEffectiveTotal(Number(data.effectiveTotal) || 0);
      setPending(null);
      setEditing(null);
      toast.success(
        data.approvedBy && override
          ? `Autorizado por ${data.approvedBy}.`
          : "Diárias atualizadas."
      );
      onChanged();
    } catch {
      const msg = "Erro de conexão.";
      if (pending) setApprovalError(msg); else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const togglePause = () => run({
    action: paused ? "resume" : "pause",
    description: paused
      ? "Retomar o lançamento automático das diárias desta estadia."
      : "Pausar o lançamento automático das diárias desta estadia.",
  });

  const saveNight = (n: LodgingNight) => {
    const v = parseFloat(editValue.replace(",", "."));
    if (!isFinite(v) || v < 0) return toast.error("Valor inválido.");
    run({
      action: "setNight", refDate: n.date, value: v,
      description: `Alterar a diária de ${fmtBR(n.date)} de R$ ${money(n.value)} para R$ ${money(v)}${n.posted ? " (já lançada no fólio)" : ""}.`,
    });
  };

  const waiveNight = (n: LodgingNight) => run({
    action: "setNight", refDate: n.date, value: 0,
    description: `Não cobrar a diária de ${fmtBR(n.date)}${n.posted ? " e estornar o lançamento do fólio" : ""}.`,
  });

  const resetNight = (n: LodgingNight) => run({
    action: "setNight", refDate: n.date, value: null,
    description: `Voltar a diária de ${fmtBR(n.date)} ao valor padrão (R$ ${money(n.baseValue)}).`,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
        <Loader2 size={14} className="animate-spin mr-2" /> Carregando diárias…
      </div>
    );
  }
  if (nights.length === 0) return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-secondary/40 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays size={13} className="text-primary shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-foreground">Diárias</span>
          {paused && (
            <span className="text-[8px] font-black uppercase bg-amber-500/15 text-amber-600 px-2 py-0.5 rounded">
              Automático pausado
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">
            Total <b className="text-foreground">R$ {money(effectiveTotal)}</b>
          </span>
          {!readOnly && (
            <button type="button" onClick={togglePause} disabled={busy}
              className={cn("flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50",
                paused ? "bg-green-500/15 text-green-600 hover:bg-green-500/25"
                       : "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25")}>
              {paused ? <><Play size={10} /> Retomar</> : <><Pause size={10} /> Pausar</>}
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-border">
        {nights.map((n) => {
          const waived = n.value === 0;
          return (
            <div key={n.date} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/20">
              <span className="w-20 font-semibold text-foreground shrink-0">{fmtBR(n.date)}</span>

              <span className={cn("text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0",
                n.posted ? "bg-primary/10 text-primary"
                  : n.due ? "bg-amber-500/15 text-amber-600"
                  : "bg-secondary text-muted-foreground")}>
                {n.posted ? "lançada" : n.due ? "a lançar" : "futura"}
              </span>

              {editing === n.date ? (
                <div className="flex items-center gap-1 ml-auto">
                  <input type="number" step="0.01" min="0" autoFocus value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveNight(n); if (e.key === "Escape") setEditing(null); }}
                    className="w-24 bg-background border border-border px-2 py-1 rounded-lg text-xs outline-none focus:border-primary text-foreground" />
                  <button type="button" onClick={() => saveNight(n)} disabled={busy}
                    className="p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50" title="Salvar">
                    <Check size={12} />
                  </button>
                  <button type="button" onClick={() => setEditing(null)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground" title="Cancelar">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 ml-auto">
                  {n.overridden && !waived && (
                    <span className="text-[10px] text-muted-foreground line-through">R$ {money(n.baseValue)}</span>
                  )}
                  <span className={cn("font-black tabular-nums",
                    waived ? "text-muted-foreground line-through" : "text-foreground")}>
                    R$ {money(waived ? n.baseValue : n.value)}
                  </span>
                  {n.overridden && (
                    <span title="Valor negociado" className="text-amber-500"><BadgePercent size={11} /></span>
                  )}

                  <div className="flex items-center gap-0.5" hidden={readOnly}>
                    <button type="button" title="Alterar valor" disabled={busy}
                      onClick={() => { setEditing(n.date); setEditValue(String(n.value || n.baseValue)); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-50">
                      <BadgePercent size={12} />
                    </button>
                    {!waived && (
                      <button type="button" title="Não cobrar esta noite" disabled={busy}
                        onClick={() => waiveNight(n)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-50">
                        <XCircle size={12} />
                      </button>
                    )}
                    {n.overridden && (
                      <button type="button" title="Voltar ao valor padrão" disabled={busy}
                        onClick={() => resetNight(n)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50">
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {readOnly ? (
        <p className="px-3 py-2 text-[10px] text-muted-foreground bg-secondary/30 border-t border-border">
          Conta encerrada — reabra a conta para mexer nas diárias.
        </p>
      ) : !isManager && (
        <p className="px-3 py-2 text-[10px] text-muted-foreground bg-secondary/30 border-t border-border">
          Alterações em diárias exigem autorização de um gerente.
        </p>
      )}

      {pending && (
        <ManagerApprovalModal
          title="Autorização de gerente"
          description={pending.description}
          submitting={busy}
          error={approvalError}
          onCancel={() => { setPending(null); setApprovalError(null); }}
          onConfirm={(override) => run(pending, override)}
        />
      )}
    </div>
  );
}
