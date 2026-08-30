"use client";

// A conta da estadia — estado e regras, sem visual.
//
// Fólio, os quatro sinais (pagamento · chave · empréstimos · esquecidos), os
// desfechos de cada um e o encerramento da conta viviam só dentro do
// StayAccountModal. A ficha rápida tinha uma segunda implementação do mesmo
// extrato, mais pobre e já divergindo. Este hook + o StayAccountPanel são a
// fonte única: modal da Conta, ficha rápida e ficha completa renderizam o MESMO
// componente com o MESMO comportamento.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { StayService } from "@/services/stay-service";
import { accountChips, openChips, type ChipId } from "@/lib/stay-account";
import { FOLIO_CLOSED_MESSAGE, isFolioClosedError } from "@/lib/folio-guard";
import type { ConciergeGroup, ConciergeItem } from "@/types/aura";
import { useFolio, type UseFolioActor } from "./useFolio";

/** Pedido de concierge desta estadia, como a rota by-stay devolve. */
export interface StayRequest {
  id: string;
  itemId: string;
  itemName: string;
  category: "consumption" | "loan";
  price: number;
  lossPrice: number;
  quantity: number;
  status: string;
  urgent?: boolean;
  notes?: string | null;
  total_price?: number | null;
  createdAt: string;
  assignedName?: string | null;
  /** 'guest' = pedido do/para o hóspede · 'maid' = reposição interna da camareira. */
  requestedBy?: "guest" | "maid";
}

export function useStayAccount(
  propertyId: string | undefined,
  stay: any,
  actor: UseFolioActor,
  active = true,
  onChanged?: () => void,
) {
  const folio = useFolio(propertyId, stay?.id, actor, active);

  // Cópia local: resolver um sinal precisa refletir na hora, sem esperar o
  // recarregamento da lista inteira.
  const [local, setLocal] = useState<any>(stay);
  useEffect(() => { setLocal(stay); }, [stay]);

  const [resolving, setResolving] = useState<ChipId | null>(null);
  const [busy, setBusy] = useState(false);
  const [chargeAmount, setChargeAmount] = useState("");

  // Formulário de lançamento
  const [kind, setKind] = useState<"debit" | "credit">("debit");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");

  // ── Concierge desta estadia: pedidos em aberto e itens emprestados ─────────
  const [requests, setRequests] = useState<StayRequest[] | null>(null);
  const stayId = stay?.id as string | undefined;

  const reloadRequests = useCallback(async () => {
    if (!propertyId || !stayId) return;
    try {
      const res = await fetch(`/api/admin/concierge/by-stay?${new URLSearchParams({ propertyId, stayId })}`);
      const data = res.ok ? await res.json() : { requests: [] };
      setRequests((data?.requests ?? []) as StayRequest[]);
    } catch {
      setRequests([]);
    }
  }, [propertyId, stayId]);

  useEffect(() => {
    if (!active) { setRequests(null); return; }
    void reloadRequests();
  }, [active, reloadRequests]);

  const list = requests ?? [];
  /**
   * O que está fisicamente com o hóspede: item de empréstimo entregue e ainda
   * não devolvido — não importa quem entregou (governança, mensageiro ou
   * recepção), porque item de categoria `loan` é hoje exclusivamente coisa que
   * vai para o hóspede e volta. A reposição de enxoval e limpeza migrou para os
   * pedidos de estoque (`restock_requests`) e parou de usar o Concierge em
   * junho/2026 — pedidos `loan` anteriores a isso podem ser reposição antiga, e
   * só aparecem em estadias daquele período.
   */
  const loans = useMemo(
    () => list.filter(r => r.category === "loan" && r.status === "delivered"),
    [list],
  );
  const openRequests = useMemo(() => list.filter(r => r.status === "pending" || r.status === "in_progress"), [list]);

  const chips = useMemo(
    () => accountChips(local ?? {}, folio.items, loans.map(l => ({ id: l.id, itemName: l.itemName, quantity: l.quantity }))),
    [local, folio.items, loans],
  );
  const pending = openChips(chips);
  const closed = !!local?.billClosedAt;

  // ── Catálogo (sob demanda: só quando o seletor de itens abre) ──────────────
  const [catalog, setCatalog] = useState<{ items: ConciergeItem[]; groups: ConciergeGroup[] } | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const loadCatalog = useCallback(async () => {
    if (!propertyId || catalog || catalogLoading) return;
    setCatalogLoading(true);
    try {
      const res = await fetch(`/api/admin/concierge/catalog?${new URLSearchParams({ propertyId })}`);
      const data = res.ok ? await res.json() : { items: [], groups: [] };
      setCatalog({
        items: ((data?.items ?? []) as ConciergeItem[]).filter(i => i.active),
        groups: (data?.groups ?? []) as ConciergeGroup[],
      });
    } catch {
      toast.error("Não consegui carregar o catálogo.");
      setCatalog({ items: [], groups: [] });
    } finally {
      setCatalogLoading(false);
    }
  }, [propertyId, catalog, catalogLoading]);

  const debits = folio.items.filter(i => i.type !== "credit").reduce((a, i) => a + (i.totalPrice ?? 0), 0);
  const credits = folio.items.filter(i => i.type === "credit").reduce((a, i) => a + (i.totalPrice ?? 0), 0);

  const actorId = actor.id || "unknown";
  const actorName = actor.name || "Recepção";

  const patchLocal = (p: Record<string, unknown>) => setLocal((prev: any) => ({ ...prev, ...p }));
  const chargeValue = () => Math.round(parseFloat(chargeAmount.replace(",", ".")) * 100) / 100;

  const runResolve = async (fn: () => Promise<void>, patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fn();
      patchLocal(patch);
      setResolving(null);
      setChargeAmount("");
      onChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        isFolioClosedError(e) ? FOLIO_CLOSED_MESSAGE
          : msg.endsWith("_CHARGE_INVALID") ? "Informe um valor maior que zero."
          : "Não foi possível registrar.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitEntry = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = Math.round(parseFloat(price.replace(",", ".")) * 100) / 100;
    if (!desc.trim() || !(value > 0)) { toast.error("Preencha descrição e valor."); return; }
    if (kind === "credit") await folio.addCredit(desc.trim(), value * (qty || 1));
    else await folio.addDebit(desc.trim(), qty || 1, value);
    setDesc(""); setQty(1); setPrice("");
    onChanged?.();
  };

  /** Preenche o formulário com o pagamento que zera o saldo (atalho do chip). */
  const fillPayment = useCallback(() => {
    setKind("credit");
    setDesc("Pagamento");
    setPrice(folio.balance.toFixed(2));
    setResolving(null);
  }, [folio.balance]);

  const closeBill = async (summary?: string) => {
    if (!propertyId || !stay?.id) return false;
    setBusy(true);
    try {
      await StayService.closeStayBill(propertyId, stay.id, actorId, actorName, summary);
      toast.success("Conta encerrada.");
      patchLocal({ billClosedAt: new Date().toISOString() });
      onChanged?.();
      return true;
    } catch {
      toast.error("Erro ao encerrar a conta.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const reopenBill = async () => {
    if (!propertyId || !stay?.id) return;
    setBusy(true);
    try {
      await StayService.reopenStayBill(propertyId, stay.id, actorId, actorName);
      patchLocal({ billClosedAt: null });
      toast.success("Conta reaberta.");
      onChanged?.();
    } catch {
      toast.error("Erro ao reabrir a conta.");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (itemId: string, description: string) => {
    await folio.remove(itemId, description);
    onChanged?.();
  };

  // ── Ações de catálogo/empréstimo (passam pelo pipeline do Concierge) ───────
  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/admin/concierge/by-stay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, stayId, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Falha na operação.");
    return data;
  };

  /** Lança itens do catálogo: cobra o que tem preço, baixa estoque e registra a entrega. */
  const launchCart = async (cart: Record<string, number>) => {
    const units = Object.values(cart).reduce((a, b) => a + b, 0);
    if (units === 0) { toast.error("Escolha ao menos um item."); return false; }
    setBusy(true);
    try {
      await post({ action: "launch", cart, cabinId: stay?.cabinId ?? undefined });
      toast.success(units === 1 ? "Item lançado na conta." : `${units} itens lançados na conta.`);
      await Promise.all([folio.reload(), reloadRequests()]);
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao lançar itens.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Desfecho de um item emprestado: devolvido, ou extraviado (cobra o valor de perda). */
  const resolveLoan = async (requestId: string, action: "return" | "lost") => {
    setBusy(true);
    try {
      await post({ action, requestId });
      toast.success(action === "return" ? "Item devolvido." : "Item marcado como extraviado.");
      await Promise.all([folio.reload(), reloadRequests()]);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar.");
    } finally {
      setBusy(false);
    }
  };

  return {
    propertyId, stay, stayId, local, actor, actorId, actorName,
    folio, chips, pending, closed, debits, credits,
    resolving, setResolving, busy, chargeAmount, setChargeAmount, chargeValue,
    kind, setKind, desc, setDesc, qty, setQty, price, setPrice,
    runResolve, submitEntry, fillPayment, closeBill, reopenBill, removeItem,
    requests, loans, openRequests, reloadRequests,
    catalog, catalogLoading, loadCatalog, launchCart, resolveLoan,
  };
}

export type StayAccountState = ReturnType<typeof useStayAccount>;
