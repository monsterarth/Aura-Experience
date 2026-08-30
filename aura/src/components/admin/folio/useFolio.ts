"use client";

// O fólio de uma estadia — carga, realtime e lançamentos.
//
// A mesma lista aparece na ficha completa e no modal da Conta. Antes só existia
// dentro da ficha (com o canal realtime e os handlers embutidos nas 1200 linhas
// dela); duplicar isso no modal novo era pedir para as duas telas divergirem.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase, safeRemoveChannel } from "@/lib/supabase";
import { StayService } from "@/services/stay-service";
import { FinanceService } from "@/services/finance-service";
import { folioBalance } from "@/lib/stay-account";
import { FOLIO_CLOSED_MESSAGE, isFolioClosedError } from "@/lib/folio-guard";
import type { FolioItem } from "@/types/aura";

export interface UseFolioActor {
  id?: string;
  name?: string;
}

export function useFolio(propertyId: string | undefined, stayId: string | undefined, actor: UseFolioActor, active = true) {
  const [items, setItems] = useState<FolioItem[]>([]);
  const [loading, setLoading] = useState(false);

  const actorId = actor.id || "unknown";
  const actorName = actor.name || "Recepção";

  const reload = useCallback(async () => {
    if (!propertyId || !stayId) return;
    setLoading(true);
    try {
      setItems(await StayService.getStayFolio(propertyId, stayId));
    } catch {
      toast.error("Erro ao carregar o extrato.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, stayId]);

  useEffect(() => {
    if (!active) return;
    void reload();
  }, [active, reload]);

  // Realtime: consumo lançado pelo garçom/camareira aparece sem recarregar a tela.
  useEffect(() => {
    if (!active || !stayId) return;
    let subscribed = false;
    const channel = supabase.channel(`folio_${stayId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "folio_items", filter: `stayId=eq.${stayId}` }, () => { void reload(); })
      .subscribe((status: string) => { if (status === "SUBSCRIBED") subscribed = true; });
    return () => { safeRemoveChannel(channel, subscribed); };
  }, [active, stayId, reload]);

  const addDebit = useCallback(async (description: string, quantity: number, unitPrice: number) => {
    if (!propertyId || !stayId) return;
    setLoading(true);
    try {
      await StayService.addFolioItemManual(
        propertyId, stayId,
        { description, quantity, unitPrice, totalPrice: Math.round(quantity * unitPrice * 100) / 100, category: "other", addedBy: actorId },
        actorId, actorName,
      );
      toast.success("Item adicionado à conta.");
      await reload();
    } catch (e) {
      toast.error(isFolioClosedError(e) ? FOLIO_CLOSED_MESSAGE : "Erro ao adicionar item.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, stayId, actorId, actorName, reload]);

  const addCredit = useCallback(async (description: string, amount: number) => {
    if (!propertyId || !stayId) return;
    setLoading(true);
    try {
      await FinanceService.addPayment(propertyId, stayId, description, amount, actorId, actorName);
      toast.success("Pagamento lançado como crédito.");
      await reload();
    } catch (e) {
      toast.error(isFolioClosedError(e) ? FOLIO_CLOSED_MESSAGE : "Erro ao lançar pagamento.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, stayId, actorId, actorName, reload]);

  const remove = useCallback(async (itemId: string, description: string) => {
    if (!propertyId || !stayId) return;
    setLoading(true);
    try {
      await StayService.deleteFolioItem(propertyId, stayId, itemId, description, actorId, actorName);
      toast.success("Item estornado.");
      await reload();
    } catch {
      toast.error("Erro ao estornar.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, stayId, actorId, actorName, reload]);

  return { items, loading, reload, addDebit, addCredit, remove, balance: folioBalance(items) };
}
