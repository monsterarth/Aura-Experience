"use client";

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
import { Blocks, Boxes, Loader2 } from "lucide-react";

interface Draft { hasStock: boolean }

export default function ModulosPage() {
  const { isSuperAdmin } = useAuth();
  const { draft, patch, dirty, saving, reset, save } = usePropertySection<Draft>((p) => ({
    // Default LIGADO: `hasStock` só desliga quando é explicitamente false.
    hasStock: (p.settings as { hasStock?: boolean })?.hasStock !== false,
  }));

  if (!draft) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

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
      </SectionCard>

      {isSuperAdmin && (
        <SaveBar
          dirty={dirty} saving={saving} onReset={reset}
          onSave={() => save((d) => ({ patch: { hasStock: d.hasStock } }))}
          warning={draft.hasStock ? undefined : "Com o módulo desligado, o grupo Compras & Estoque some do menu para todos."}
        />
      )}
    </div>
  );
}
