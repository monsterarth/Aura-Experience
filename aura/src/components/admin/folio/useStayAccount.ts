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
import { useFolio, type UseFolioActor } from "./useFolio";

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

  const chips = useMemo(() => accountChips(local ?? {}, folio.items), [local, folio.items]);
  const pending = openChips(chips);
  const closed = !!local?.billClosedAt;

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
      toast.error(msg.endsWith("_CHARGE_INVALID") ? "Informe um valor maior que zero." : "Não foi possível registrar.");
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

  return {
    propertyId, stay, local, actor, actorId, actorName,
    folio, chips, pending, closed, debits, credits,
    resolving, setResolving, busy, chargeAmount, setChargeAmount, chargeValue,
    kind, setKind, desc, setDesc, qty, setQty, price, setPrice,
    runResolve, submitEntry, fillPayment, closeBill, reopenBill, removeItem,
  };
}

export type StayAccountState = ReturnType<typeof useStayAccount>;
