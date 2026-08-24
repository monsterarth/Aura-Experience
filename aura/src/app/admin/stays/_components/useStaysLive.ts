"use client";

// Dados da lista de estadias: busca por aba + realtime na tabela `stays`.
// O canal assina UMA vez por propriedade (antes reassinava a cada troca de aba)
// e chama o `load` mais recente via ref.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, safeRemoveChannel } from "@/lib/supabase";
import { TAB_SCOPE, type StayRow, type TabStatus } from "./stay-utils";

/** Espelha o `CLOSED_STAYS_LIMIT` da rota — página cheia significa que há mais. */
const PAGE_SIZE = 100;

export function useStaysLive(propertyId: string | undefined, tab: TabStatus) {
  const [stays, setStays] = useState<StayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const load = useCallback(async (forTab?: TabStatus) => {
    if (!propertyId) return;
    const t = forTab ?? tabRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ propertyId, scope: TAB_SCOPE[t] });
      const res = await fetch(`/api/admin/stays?${params}`);
      if (!res.ok) throw new Error("fetch-error");
      const data = await res.json();
      // Resposta de uma aba antiga não sobrescreve a atual.
      if (tabRef.current === t) {
        const rows = Array.isArray(data) ? data : [];
        setStays(rows);
        setHasMore(t === "encerradas" && rows.length >= PAGE_SIZE);
      }
    } catch {
      if (tabRef.current === t) setError("Não foi possível carregar as estadias.");
    } finally {
      if (tabRef.current === t) setLoading(false);
    }
  }, [propertyId]);

  /**
   * Histórico das Encerradas: a rota devolve as 100 saídas mais recentes. Aqui a
   * página pede a seguinte a partir da saída mais antiga que já tem — antes o
   * corte em 100 era mudo e o resto do histórico simplesmente não existia.
   */
  const loadMore = useCallback(async () => {
    if (!propertyId || tabRef.current !== "encerradas") return;
    const oldest = stays.reduce<string | null>((acc, s) => {
      if (!s.checkOut) return acc;
      return !acc || s.checkOut < acc ? s.checkOut : acc;
    }, null);
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ propertyId, scope: "encerradas", before: oldest });
      const res = await fetch(`/api/admin/stays?${params}`);
      if (!res.ok) throw new Error("fetch-error");
      const data = await res.json();
      const rows: StayRow[] = Array.isArray(data) ? data : [];
      setStays(prev => {
        const seen = new Set(prev.map(s => s.id));
        return [...prev, ...rows.filter(r => !seen.has(r.id))];
      });
      setHasMore(rows.length >= PAGE_SIZE);
    } catch {
      /* silencioso: o que já está na tela continua válido */
    } finally {
      setLoadingMore(false);
    }
  }, [propertyId, stays]);

  const loadRef = useRef(load);
  loadRef.current = load;

  // Troca de aba: limpa a lista (skeleton) e carrega a nova.
  useEffect(() => {
    setStays([]);
    setHasMore(false);
    if (propertyId) void load(tab);
  }, [propertyId, tab, load]);

  // Realtime: qualquer mudança em stays da propriedade recarrega a aba atual.
  useEffect(() => {
    if (!propertyId) return;
    let subscribed = false;
    const channel = supabase.channel(`stays_${propertyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stays", filter: `propertyId=eq.${propertyId}` }, () => { void loadRef.current(); })
      .subscribe((status: string) => { if (status === "SUBSCRIBED") subscribed = true; });
    return () => { safeRemoveChannel(channel, subscribed); };
  }, [propertyId]);

  return { stays, setStays, loading, error, reload: load, loadMore, loadingMore, hasMore };
}
