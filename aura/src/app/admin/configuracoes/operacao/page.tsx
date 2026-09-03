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
  acceptsPetExceptions: boolean;
  /** null = sem teto: a exceção analisa qualquer caso. */
  petExceptionMaxPets: number | null;
  petExceptionMaxWeight: number | null;
  petExceptionAlert: MultiLangObj;
  /** Janela de alta ("MM-DD"). Critério interno: nunca aparece para o hóspede. */
  petExceptionBlackoutFrom: string;
  petExceptionBlackoutTo: string;
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
      acceptsPetExceptions: s.acceptsPetExceptions !== false,
      petExceptionMaxPets: s.petExceptionMaxPets ?? null,
      petExceptionMaxWeight: s.petExceptionMaxWeight ?? null,
      petExceptionAlert: parseMultiLang(s.petExceptionAlert),
      petExceptionBlackoutFrom: s.petExceptionBlackout?.[0]?.from ?? "12-15",
      petExceptionBlackoutTo: s.petExceptionBlackout?.[0]?.to ?? "03-15",
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
              Estes são os limites da <strong>Política Pet</strong>. Passar deles não bloqueia
              nada: vira pedido de exceção, abaixo.
            </p>

            <div className="border-t border-border" />

            <SettingRow
              title="Aceita pedidos de exceção"
              description="Desligado, passar dos limites acima bloqueia o pré-check-in."
              icon={Dog}
              onClick={() => patch({ acceptsPetExceptions: !draft.acceptsPetExceptions })}
            >
              <Toggle checked={draft.acceptsPetExceptions} label="Aceita exceção" />
            </SettingRow>

            {draft.acceptsPetExceptions && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">Teto de pets (vazio = sem teto)</label>
                    <input
                      type="number" min={1} max={5} className="field-input w-full"
                      value={draft.petExceptionMaxPets ?? ""}
                      onChange={(e) => patch({ petExceptionMaxPets: e.target.value === "" ? null : parseInt(e.target.value) || null })}
                    />
                  </div>
                  <div>
                    <label className="field-label">Teto de peso, kg (vazio = sem teto)</label>
                    <input
                      type="number" min={1} max={100} className="field-input w-full"
                      value={draft.petExceptionMaxWeight ?? ""}
                      onChange={(e) => patch({ petExceptionMaxWeight: e.target.value === "" ? null : parseInt(e.target.value) || null })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Acima do teto o pedido <strong>nem é analisado</strong> — é o único bloqueio que
                  sobrou no formulário. Deixando vazio, qualquer caso pode ser pedido e a recepção
                  decide. Entre a política e o teto, o hóspede declara, aceita a Política Pet —
                  Exceção e fica em análise.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">Alta temporada — de (MM-DD)</label>
                    <input
                      className="field-input w-full" placeholder="12-15"
                      value={draft.petExceptionBlackoutFrom}
                      onChange={(e) => patch({ petExceptionBlackoutFrom: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">até (MM-DD)</label>
                    <input
                      className="field-input w-full" placeholder="03-15"
                      value={draft.petExceptionBlackoutTo}
                      onChange={(e) => patch({ petExceptionBlackoutTo: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Critério <strong>interno</strong>: aparece para quem decide, nunca no texto que o
                  hóspede lê. Não recusa sozinho — a direção segue podendo liberar, e a liberação
                  contra o critério fica registrada com nome.
                </p>

                <MultiLangField
                  label="Aviso de exceção em análise"
                  desc="Mostrado ao hóspede quando o que ele informou passa da Política Pet."
                  rows={4}
                  value={draft.petExceptionAlert}
                  onChange={(v) => patch({ petExceptionAlert: v })}
                />
              </>
            )}

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

      <SaveBar dirty={dirty} saving={saving} onReset={reset} onSave={() => save((d) => {
        const { petExceptionBlackoutFrom, petExceptionBlackoutTo, ...rest } = d;
        const ok = /^\d{2}-\d{2}$/;
        return {
          patch: {
            ...rest,
            // Formato inválido não vira janela vazia silenciosa: cai fora e o
            // serviço usa o padrão 15/12–15/03.
            petExceptionBlackout: ok.test(petExceptionBlackoutFrom) && ok.test(petExceptionBlackoutTo)
              ? [{ from: petExceptionBlackoutFrom, to: petExceptionBlackoutTo }]
              : [],
          },
        };
      })} />
    </div>
  );
}
