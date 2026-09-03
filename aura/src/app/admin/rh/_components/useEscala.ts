"use client";

// Estado da tela do mês. Uma requisição traz a grade inteira já materializada —
// a tela NÃO recalcula escala, que era o vício do modelo velho (o cálculo rodava
// no navegador de onze lugares e por isso nada agregado tinha resposta).

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { MonthGrid } from "@/types/hr";

export function mesAtualBrt(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
}

export function hojeBrt(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

export function useEscala(propertyId: string | undefined) {
  const [month, setMonth] = useState<string>(mesAtualBrt);
  const [grid, setGrid] = useState<MonthGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [moduloDesligado, setModuloDesligado] = useState(false);

  const carregar = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch(`/api/admin/rh?section=escala&propertyId=${propertyId}&month=${month}`);
      const data = await r.json();
      if (!r.ok) {
        if (data?.code === "MODULE_OFF") { setModuloDesligado(true); setGrid(null); return; }
        throw new Error(data?.error ?? "Falha ao carregar a escala.");
      }
      setModuloDesligado(false);
      setGrid(data as MonthGrid);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar a escala.");
    } finally {
      setLoading(false);
    }
  }, [propertyId, month]);

  useEffect(() => { void carregar(); }, [carregar]);

  /** Toda escrita passa por aqui: uma ação, um recarregamento, um toast. */
  const acao = useCallback(
    async (body: Record<string, unknown>, msgs: { loading: string; success: string }) => {
      if (!propertyId) return;
      const p = (async () => {
        const r = await fetch("/api/admin/rh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, propertyId, month }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Falha na operação.");
        await carregar();
        return data;
      })();
      toast.promise(p, { loading: msgs.loading, success: msgs.success, error: (e) => e.message });
      return p;
    },
    [propertyId, month, carregar],
  );

  return { month, setMonth, grid, loading, erro, moduloDesligado, recarregar: carregar, acao };
}
