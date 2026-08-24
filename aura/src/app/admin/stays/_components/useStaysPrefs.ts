"use client";

// Modo de visualização das Estadias (cartão / compacto / lista), por aba e por usuário.
//
// Fica no `staff` e não no localStorage de propósito: o computador da recepção é
// compartilhado por vários logins, e uma preferência gravada no navegador passaria
// de uma pessoa para a outra. Mesmo caminho de `uiTheme` e `sidebarDefaultCollapsed`
// (rota PUT /api/admin/staff, que libera estes campos para o próprio usuário).
//
// A escrita é otimista: o estado local manda enquanto a gravação viaja, então trocar
// de modo é instantâneo mesmo em rede ruim. Se falhar, volta ao valor do servidor.
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { StaffService } from "@/services/staff-service";
import type { StaysViewMode } from "@/types/aura";

/** Só as abas operacionais têm alternador — Encerradas tem layout próprio. */
export type PrefTab = "ativas" | "futuras";

const COLUMN: Record<PrefTab, "staysViewAtivas" | "staysViewFuturas"> = {
  ativas: "staysViewAtivas",
  futuras: "staysViewFuturas",
};

export const DEFAULT_VIEW: StaysViewMode = "card";

export function useStaysPrefs() {
  const { userData, refreshUserData } = useAuth();
  const [pending, setPending] = useState<Partial<Record<PrefTab, StaysViewMode>>>({});

  const getView = useCallback(
    (tab: PrefTab): StaysViewMode => pending[tab] ?? (userData?.[COLUMN[tab]] as StaysViewMode | undefined) ?? DEFAULT_VIEW,
    [pending, userData],
  );

  const setView = useCallback(
    (tab: PrefTab, mode: StaysViewMode) => {
      setPending(prev => ({ ...prev, [tab]: mode }));
      if (!userData?.id) return;
      StaffService.updateStaff(userData.id, { [COLUMN[tab]]: mode })
        .then(() => refreshUserData())
        .catch(() => {
          setPending(prev => {
            const next = { ...prev };
            delete next[tab];
            return next;
          });
          toast.error("Não foi possível salvar o modo de visualização.");
        });
    },
    [userData?.id, refreshUserData],
  );

  return { getView, setView };
}
