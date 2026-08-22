"use client";

import { SkeletonList } from "@/components/aura";

// src/app/admin/configuracoes/operacao/page.tsx
// Horários da hospedagem e o que o hóspede lê no pré-check-in quando chega fora
// da janela. Os avisos são trilíngues porque o portal é.
import React from "react";
import { usePropertySection } from "../_lib/usePropertySection";
import { SaveBar } from "../_components/SaveBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingRow } from "@/components/ui/SettingRow";
import { Toggle } from "@/components/ui/Toggle";
import { MultiLangField } from "@/components/admin/settings/MultiLangField";
import { parseMultiLang } from "@/lib/multilang";
import { MultiLangObj } from "@/types/aura";
import { Clock, Dog, MessageSquareWarning } from "lucide-react";

interface Draft {
  checkInTime: string;
  checkOutTime: string;
  receptionStartTime: string;
  receptionEndTime: string;
  earlyCheckInMessage: MultiLangObj;
  lateCheckInMessage: MultiLangObj;
  petPolicyAlert: MultiLangObj;
  acceptsPets: boolean;
  petMinWeight: number;
  petMaxWeight: number;
  maxPets: number;
}

export default function OperacaoPage() {
  const { draft, patch, dirty, saving, reset, save } = usePropertySection<Draft>((p) => {
    const s = p.settings as Record<string, any>;
    return {
      checkInTime: s.checkInTime ?? "14:00",
      checkOutTime: s.checkOutTime ?? "12:00",
      receptionStartTime: s.receptionStartTime ?? "08:00",
      receptionEndTime: s.receptionEndTime ?? "20:00",
      earlyCheckInMessage: parseMultiLang(s.earlyCheckInMessage),
      lateCheckInMessage: parseMultiLang(s.lateCheckInMessage),
      petPolicyAlert: parseMultiLang(s.petPolicyAlert),
      acceptsPets: s.acceptsPets ?? false,
      petMinWeight: Number(s.petMinWeight ?? 1),
      petMaxWeight: Number(s.petMaxWeight ?? 15),
      maxPets: Number(s.maxPets ?? 1),
    };
  });

  if (!draft) return <SkeletonList rows={4} avatar={false} />;

  const time = (label: string, key: keyof Draft, hint?: string) => (
    <div>
      <label className="field-label">{label}</label>
      <input
        type="time"
        className="field-input w-full [color-scheme:light] dark:[color-scheme:dark]"
        value={draft[key] as string}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<Draft>)}
      />
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <SectionCard title="Horários" icon={Clock} description="Valem no pré-check-in, no lançamento de estadias e nos avisos ao hóspede.">
        <div className="grid grid-cols-2 gap-4">
          {time("Início do check-in", "checkInTime")}
          {time("Limite do check-out", "checkOutTime")}
          {time("Abertura da recepção", "receptionStartTime")}
          {time("Fechamento da recepção", "receptionEndTime")}
        </div>
      </SectionCard>

      <SectionCard
        title="Avisos de chegada" icon={MessageSquareWarning}
        description="Aparecem no pré-check-in quando o horário informado pelo hóspede cai fora da janela."
      >
        <MultiLangField
          label="Chegada antecipada (early check-in)"
          desc="Mostrado quando o horário é anterior ao início do check-in. Variáveis: [expectedArrivalTime], [checkintime]"
          value={draft.earlyCheckInMessage}
          onChange={(v) => patch({ earlyCheckInMessage: v })}
        />
        <div className="border-t border-border" />
        <MultiLangField
          label="Chegada tardia (recepção fechada)"
          desc="Mostrado quando o horário é posterior ao fechamento da recepção. Variáveis: [expectedArrivalTime], [receptionendtime]"
          value={draft.lateCheckInMessage}
          onChange={(v) => patch({ lateCheckInMessage: v })}
        />
      </SectionCard>

      <SectionCard title="Pets" icon={Dog}>
        <SettingRow
          title="Aceita pets"
          description="Desligado, a seção de pets some do pré-check-in."
          icon={Dog}
          onClick={() => patch({ acceptsPets: !draft.acceptsPets })}
        >
          <Toggle checked={draft.acceptsPets} label="Aceita pets" />
        </SettingRow>

        {draft.acceptsPets && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Peso mínimo (kg)</label>
                <input
                  type="number" min={1} max={40} className="field-input w-full"
                  value={draft.petMinWeight}
                  onChange={(e) => patch({ petMinWeight: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div>
                <label className="field-label">Peso máximo (kg)</label>
                <input
                  type="number" min={1} max={40} className="field-input w-full"
                  value={draft.petMaxWeight}
                  onChange={(e) => patch({ petMaxWeight: parseInt(e.target.value) || 15 })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Pet fora desta faixa é bloqueado no formulário de pré-check-in.
            </p>

            <div className="border-t border-border" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Máximo de pets</label>
                <input
                  type="number" min={1} max={5} className="field-input w-full"
                  value={draft.maxPets}
                  onChange={(e) => patch({ maxPets: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Diferente do peso, este número <strong>não bloqueia</strong>: o hóspede consegue
              informar mais pets do que a política prevê e o formulário só avisa que a recepção
              vai confirmar antes da chegada. Bloquear faria ele omitir o segundo pet e chegar
              com ele mesmo assim.
            </p>

            <div className="border-t border-border" />
            <MultiLangField
              label="Aviso curto de pet"
              desc="Aparece assim que o hóspede marca a opção de pet na ficha."
              rows={2}
              value={draft.petPolicyAlert}
              onChange={(v) => patch({ petPolicyAlert: v })}
            />
          </>
        )}
      </SectionCard>

      <SaveBar dirty={dirty} saving={saving} onReset={reset} onSave={() => save((d) => ({ patch: { ...d } }))} />
    </div>
  );
}
