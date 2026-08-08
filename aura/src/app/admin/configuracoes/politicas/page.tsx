"use client";

// src/app/admin/configuracoes/politicas/page.tsx
// Textos que o hóspede precisa aceitar ("Li e concordo") para fechar o check-in.
// Por isso o editor trilíngue avisa o idioma sem texto: hóspede estrangeiro
// aceitando um termo em branco não é detalhe.
import React from "react";
import { usePropertySection } from "../_lib/usePropertySection";
import { SaveBar } from "../_components/SaveBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { MultiLangField } from "@/components/admin/settings/MultiLangField";
import { parseMultiLang } from "@/lib/multilang";
import { MultiLangObj } from "@/types/aura";
import { FileText, Loader2 } from "lucide-react";

interface Draft {
  generalPolicyText: MultiLangObj;
  privacyPolicyText: MultiLangObj;
  petPolicyText: MultiLangObj;
}

export default function PoliticasPage() {
  const { draft, patch, dirty, saving, reset, save } = usePropertySection<Draft>((p) => {
    const s = p.settings as Record<string, unknown>;
    return {
      generalPolicyText: parseMultiLang(s.generalPolicyText),
      privacyPolicyText: parseMultiLang(s.privacyPolicyText),
      petPolicyText: parseMultiLang(s.petPolicyText),
    };
  });

  if (!draft) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="max-w-3xl space-y-4">
      <SectionCard
        title="Documentos e termos" icon={FileText}
        description="Estes textos exigem o aceite obrigatório do hóspede antes de finalizar o check-in."
      >
        <MultiLangField
          label="Política geral da propriedade"
          desc="Regras de silêncio, uso da piscina, horários, multas."
          rows={6}
          value={draft.generalPolicyText}
          onChange={(v) => patch({ generalPolicyText: v })}
        />
        <div className="border-t border-border" />
        <MultiLangField
          label="Política de privacidade (LGPD)"
          desc="Como os dados coletados na FNRH são tratados."
          rows={6}
          value={draft.privacyPolicyText}
          onChange={(v) => patch({ privacyPolicyText: v })}
        />
        <div className="border-t border-border" />
        <MultiLangField
          label="Política pet completa"
          desc="Obrigações do tutor, vacinação e circulação do animal na pousada."
          rows={6}
          value={draft.petPolicyText}
          onChange={(v) => patch({ petPolicyText: v })}
        />
      </SectionCard>

      <SaveBar
        dirty={dirty} saving={saving} onReset={reset}
        onSave={() => save((d) => ({ patch: { ...d } }))}
      />
    </div>
  );
}
