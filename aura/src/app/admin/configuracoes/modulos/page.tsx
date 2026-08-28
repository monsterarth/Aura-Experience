"use client";

import { SkeletonList } from "@/components/aura";

// src/app/admin/configuracoes/modulos/page.tsx
// Blocos do sistema ligados nesta pousada. Só super_admin altera: é decisão de
// plano/contrato, não preferência de operação. Os demais veem o estado.
import React from "react";
import { useAuth } from "@/context/AuthContext";
import { usePropertySection } from "../_lib/usePropertySection";
import { SaveBar } from "../_components/SaveBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingRow } from "@/components/ui/SettingRow";
import { Toggle } from "@/components/ui/Toggle";
import { isModuleOn } from "@/lib/modules";
import { Blocks, Boxes, Car } from "lucide-react";

interface Draft { hasStock: boolean; hasGuarita: boolean }

export default function ModulosPage() {
  const { isSuperAdmin } = useAuth();
  const { draft, patch, dirty, saving, reset, save } = usePropertySection<Draft>((p) => ({
    // O default de cada módulo mora em src/lib/modules.ts — o mesmo que o menu
    // e as rotas leem. Duas cópias da regra é como um módulo some do menu e
    // continua aberto na API.
    hasStock: isModuleOn(p.settings, "estoque"),
    hasGuarita: isModuleOn(p.settings, "guarita"),
  }));

  if (!draft) return <SkeletonList rows={4} avatar={false} />;

  const warning = !draft.hasStock
    ? "Com o módulo desligado, o grupo Compras & Estoque some do menu para todos."
    : !draft.hasGuarita
      ? "Com a Guarita desligada, a página some do menu e o app do porteiro para de responder."
      : undefined;

  return (
    <div className="max-w-2xl space-y-4">
      <SectionCard
        title="Módulos" icon={Blocks}
        description={isSuperAdmin
          ? "Desligar um módulo esconde o grupo inteiro do menu e desativa suas automações. Nada é apagado."
          : "Somente leitura — a contratação de módulos é gerida pela plataforma."}
      >
        <SettingRow
          title="Compras & Estoque"
          icon={Boxes}
          description="Estoque, compras, patrimônio e baixa automática no consumo do Concierge e do F&B. Desligado, o resto do sistema segue normal."
          onClick={isSuperAdmin ? () => patch({ hasStock: !draft.hasStock }) : undefined}
        >
          <Toggle checked={draft.hasStock} disabled={!isSuperAdmin} label="Compras & Estoque" />
        </SettingRow>

        <SettingRow
          title="Guarita & Estacionamento"
          icon={Car}
          description="Venda de estacionamento na portaria, tarifa por dia, fechamento de turno e o app do porteiro. Só faz sentido em pousada que cobra estacionamento."
          onClick={isSuperAdmin ? () => patch({ hasGuarita: !draft.hasGuarita }) : undefined}
        >
          <Toggle checked={draft.hasGuarita} disabled={!isSuperAdmin} label="Guarita & Estacionamento" />
        </SettingRow>
      </SectionCard>

      {isSuperAdmin && (
        <SaveBar
          dirty={dirty} saving={saving} onReset={reset}
          onSave={() => save((d) => ({ patch: { hasStock: d.hasStock, hasGuarita: d.hasGuarita } }))}
          warning={warning}
        />
      )}
    </div>
  );
}
