"use client";

import { SkeletonList } from "@/components/aura";

// src/app/admin/configuracoes/modulos/page.tsx
// Blocos do sistema ligados nesta pousada. Só super_admin altera: é decisão de
// plano/contrato, não preferência de operação. Os demais veem o estado.
//
// É o ÚNICO lugar onde módulo não contratado aparece (fora do card do Painel
// que vem na fatia 8) — decisão "informar sem poluir" de docs/MODULARIZATION.md §4.
//
// O rascunho guarda a flag PRÓPRIA de cada chave (`isModuleFlagOn`), não o
// estado resolvido pelo pai. Semear o Ponto já resolvido faria qualquer save —
// até ligar só a Guarita — gravar `hasTimeclock: false` numa pousada com Gente
// desligado e Ponto contratado, e "religar volta como estava" viraria mentira.
// O que a pessoa VÊ é o estado efetivo (`isModuleOn`); o que se GRAVA é a flag.
import React from "react";
import { useAuth } from "@/context/AuthContext";
import { usePropertySection } from "../_lib/usePropertySection";
import { SaveBar } from "../_components/SaveBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingRow } from "@/components/ui/SettingRow";
import { Toggle } from "@/components/ui/Toggle";
import { childModules, isModuleFlagOn, MODULES } from "@/lib/modules";
import { Blocks, Boxes, Car, Clock, CalendarDays, Plug } from "lucide-react";

interface Draft { hasStock: boolean; hasGuarita: boolean; hasHsystem: boolean; hasRH: boolean; hasTimeclock: boolean }

const RH_CHILDREN = childModules("rh").map((k) => MODULES[k].label).join(", ");

export default function ModulosPage() {
  const { isSuperAdmin } = useAuth();
  const { draft, patch, dirty, saving, reset, save } = usePropertySection<Draft>((p) => ({
    hasStock: isModuleFlagOn(p.settings, "estoque"),
    hasGuarita: isModuleFlagOn(p.settings, "guarita"),
    hasHsystem: isModuleFlagOn(p.settings, "hsystem"),
    hasRH: isModuleFlagOn(p.settings, "rh"),
    hasTimeclock: isModuleFlagOn(p.settings, "ponto"),
  }));

  if (!draft) return <SkeletonList rows={5} avatar={false} />;

  // Estado efetivo do Ponto: a flag dele E a do pai (mesma regra de isModuleOn).
  const pontoOn = draft.hasRH && draft.hasTimeclock;

  const warning = !draft.hasStock
    ? "Com o módulo desligado, Compras & Estoque e Patrimônio somem do menu e da busca, e as páginas mostram o aviso de módulo desligado. Nada é apagado."
    : !draft.hasGuarita
      ? "Com a Guarita desligada, a página some do menu e o app do porteiro para de responder."
      : !draft.hasHsystem
        ? "Com o Hsystem desligado, a página some do menu e o AURA para de buscar reservas no HUNIT. As reservas já importadas continuam."
        : !draft.hasRH
          ? `Com Gente desligado, as abas de Escala e Ausências param de responder e a escala dos meses seguintes deixa de ser gerada. ${RH_CHILDREN} desliga junto. O cadastro da equipe continua funcionando, e o que já foi lançado fica guardado.`
          : !draft.hasTimeclock
            ? "Com o Ponto desligado, a página sai do menu e o import do relógio para de responder. Quem já bate ponto pelo cadastro continua batendo; as batidas ficam guardadas."
            : undefined;

  return (
    <div className="max-w-2xl space-y-4">
      <SectionCard
        title="Módulos" icon={Blocks}
        description={isSuperAdmin
          ? "Desligar um módulo tira suas telas do menu e da busca. Nada é apagado — ligar de volta restaura tudo como estava."
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

        <SettingRow
          title="Hsystem (canais)"
          icon={Plug}
          description="Reservas das OTAs entrando sozinhas pelo HUNIT, com encaixe automático por categoria. Credenciais e modo (sombra/ativo) ficam na página do Hsystem, que também tem este interruptor."
          onClick={isSuperAdmin ? () => patch({ hasHsystem: !draft.hasHsystem }) : undefined}
        >
          <Toggle checked={draft.hasHsystem} disabled={!isSuperAdmin} label="Hsystem" />
        </SettingRow>

        <SettingRow
          title="Gente (escala e ausências)"
          icon={CalendarDays}
          description="Escala do mês gerada a partir da jornada de cada pessoa, férias, atestado e afastamento, e o turno do dia dentro dos apps de campo. O cadastro da equipe não depende deste módulo."
          onClick={isSuperAdmin ? () => patch({ hasRH: !draft.hasRH }) : undefined}
        >
          <Toggle checked={draft.hasRH} disabled={!isSuperAdmin} label="Gente" />
        </SettingRow>

        <SettingRow
          title="Ponto"
          icon={Clock}
          description={draft.hasRH
            ? "Relatório de horas por período e import do relógio de ponto. Quem bate ponto é definido pessoa a pessoa no cadastro da equipe. Parte de Gente."
            : draft.hasTimeclock
              ? "Contratado, mas desligado junto com Gente — volta sozinho quando Gente religar."
              : "Parte de Gente — ligue Gente para poder ligar o Ponto."}
          onClick={isSuperAdmin && draft.hasRH ? () => patch({ hasTimeclock: !draft.hasTimeclock }) : undefined}
        >
          <Toggle checked={pontoOn} disabled={!isSuperAdmin || !draft.hasRH} label="Ponto" />
        </SettingRow>
      </SectionCard>

      {isSuperAdmin && (
        <SaveBar
          dirty={dirty} saving={saving} onReset={reset}
          onSave={() => save((d) => ({
            patch: { hasStock: d.hasStock, hasGuarita: d.hasGuarita, hasHsystem: d.hasHsystem, hasRH: d.hasRH, hasTimeclock: d.hasTimeclock },
          }))}
          warning={warning}
        />
      )}
    </div>
  );
}
