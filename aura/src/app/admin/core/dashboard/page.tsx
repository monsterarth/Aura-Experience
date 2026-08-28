"use client";

// src/app/admin/core/dashboard/page.tsx — Painel da Plataforma (super admin).
//
// A visão de quem é DONO do Aura, não de quem opera uma pousada: o que a
// plataforma executou, o que está quebrado, quanto de infraestrutura isso custa
// e como cada propriedade está de saúde.
//
// O que saiu daqui na reforma de 08/2026 e por quê:
//   · a tabela de auditoria global — /admin/logs já faz melhor (agrupa rajadas,
//     tem deep-link por entidade); duas telas para a mesma coisa é uma a mais;
//   · "propriedades ativas" como contagem crua de linhas — dizia 3 quando duas
//     eram teste e vazio. Agora cada propriedade aparece com o que de fato usa;
//   · o rodapé decorativo e o "v1.0.0-beta" chumbado.
//
// Este arquivo é só o invólucro: guarda de papel + busca. O desenho vive em
// _components/PlatformBody.tsx.
//
// Custo: UMA chamada a /api/admin/platform por carga, tudo já somado no banco.
// Deliberadamente SEM realtime — o polling de WAL do realtime já é o maior
// consumidor de tempo de banco da plataforma; vigiá-lo em tempo real seria piada.
import React, { useState, useEffect, useCallback } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import type { PlatformSnapshot } from "@/services/platform-health-service";
import { PlatformBody } from "./_components/PlatformBody";

export default function PlatformDashboard() {
  const [days, setDays] = useState("30");
  const [snap, setSnap] = useState<PlatformSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/platform?days=${d}`, { cache: "no-store" });
      setSnap(res.ok ? await res.json() : null);
    } catch {
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  return (
    <RoleGuard allowedRoles={["super_admin"]}>
      <PlatformBody
        snap={snap}
        loading={loading}
        days={days}
        onDays={setDays}
        onRefresh={() => load(days)}
      />
    </RoleGuard>
  );
}
