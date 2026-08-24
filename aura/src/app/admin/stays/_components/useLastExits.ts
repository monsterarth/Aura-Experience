"use client";

// A última saída de cada cabana — a grade fixa do topo de "Encerradas".
//
// Consulta própria (não é uma fatia do histórico): uma cabana parada há meses
// tem que aparecer do mesmo jeito que a que virou ontem.
import { useCallback, useEffect, useState } from "react";
import type { StayRow } from "./stay-utils";

export interface LastExit {
  cabinId: string;
  cabinName: string;
  cabinNumber?: string;
  /** null = cabana sem saída registrada (card vazio, para a grade não ter buracos). */
  stay: StayRow | null;
}

export function useLastExits(propertyId: string | undefined, enabled: boolean) {
  const [exits, setExits] = useState<LastExit[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stays?propertyId=${propertyId}&view=last-exits`);
      const data = res.ok ? await res.json() : [];
      setExits(Array.isArray(data) ? data : []);
    } catch {
      setExits([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { exits, loading, reload: load };
}
