"use client";

// Dados da lista de estadias: busca por aba + realtime na tabela `stays`.
// O canal assina UMA vez por propriedade (antes reassinava a cada troca de aba)
// e chama o `load` mais recente via ref.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, safeRemoveChannel } from "@/lib/supabase";
import { TAB_STATUS, type StayRow, type TabStatus } from "./stay-utils";

export function useStaysLive(propertyId: string | undefined, tab: TabStatus) {
  const [stays, setStays] = useState<StayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const load = useCallback(async (forTab?: TabStatus) => {
    if (!propertyId) return;
    const t = forTab ?? tabRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ propertyId, status: TAB_STATUS[t].join(",") });
      const res = await fetch(`/api/admin/stays?${params}`);
      if (!res.ok) throw new Error("fetch-error");
      const data = await res.json();
      // Resposta de uma aba antiga não sobrescreve a atual.
      if (tabRef.current === t) setStays(Array.isArray(data) ? data : []);
    } catch {
      if (tabRef.current === t) setError("Não foi possível carregar as estadias.");
    } finally {
      if (tabRef.current === t) setLoading(false);
    }
  }, [propertyId]);

  const loadRef = useRef(load);
  loadRef.current = load;

  // Troca de aba: limpa a lista (skeleton) e carrega a nova.
  useEffect(() => {
    setStays([]);
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

  return { stays, setStays, loading, error, reload: load };
}
