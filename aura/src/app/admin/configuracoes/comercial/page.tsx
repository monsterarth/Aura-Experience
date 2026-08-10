"use client";

// src/app/admin/configuracoes/comercial/page.tsx
// Config comercial do tarifário — o que muda RARAMENTE saiu da página
// operacional: taxa de pet, presets de flutuação (as opções que o funil e a
// aba Flutuações do Tarifário oferecem) e os textos do orçamento (templates
// de WhatsApp + "o que está incluso" da proposta pública).
// Descontos e promoções moram em Comercial › Marketing; regras POR PERÍODO
// (calendário e flutuações) moram no Tarifário.
//
// Não usa usePropertySection: os dados são de rate_settings (tabela própria),
// não de properties.settings — carrega do bundle e salva no PUT do tarifário.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useProperty } from "@/context/PropertyContext";
import { SaveBar } from "../_components/SaveBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { CircleDollarSign, Loader2, MessageSquareText, PawPrint, Percent, Plus, Trash2 } from "lucide-react";
import { RateFluctuation, RateSettings } from "@/types/aura";
import {
  DEFAULT_EVENT_TEMPLATE, DEFAULT_INCLUSIONS_TEXT, DEFAULT_MSG_SINGLE_TEMPLATE,
  DEFAULT_MSG_TEMPLATE,
} from "@/lib/rate-engine";

/** Só o recorte desta tela — descontos/promos (Marketing) ficam intactos. */
type Draft = Pick<
  RateSettings,
  "petFee" | "fluctuations" | "msgTemplate" | "msgSingleTemplate" | "eventTemplate" | "inclusionsText"
>;

export default function ComercialConfigPage() {
  const { currentProperty: property } = useProperty();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newFluct, setNewFluct] = useState({ name: "", pct: "" });

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const res = await fetch(`/api/admin/tarifario?propertyId=${property.id}`);
      if (!res.ok) throw new Error();
      const bundle = await res.json();
      const s: RateSettings = bundle.settings;
      setDraft({
        petFee: s.petFee ?? 50,
        fluctuations: s.fluctuations ?? [],
        msgTemplate: s.msgTemplate ?? null,
        msgSingleTemplate: s.msgSingleTemplate ?? null,
        eventTemplate: s.eventTemplate ?? null,
        inclusionsText: s.inclusionsText ?? null,
      });
      setDirty(false);
    } catch {
      toast.error("Erro ao carregar a configuração comercial.");
    }
  }, [property?.id]);

  useEffect(() => { setDraft(null); load(); }, [load]);

  const patch = (partial: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
    setDirty(true);
  };

  const addFluct = () => {
    if (!draft) return;
    const pct = parseFloat(newFluct.pct.replace(",", "."));
    if (!newFluct.name.trim() || isNaN(pct)) return toast.error("Preencha nome e percentual.");
    const item: RateFluctuation = { id: crypto.randomUUID(), name: newFluct.name.trim(), pct };
    patch({ fluctuations: [...draft.fluctuations, item] });
    setNewFluct({ name: "", pct: "" });
  };

  const save = async () => {
    if (!draft || !property?.id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tarifario/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Só as chaves desta tela: descontos/promos (Marketing) não passam
        // por aqui, então não há como um save antigo sobrescrever os deles.
        body: JSON.stringify({ propertyId: property.id, settings: draft }),
      });
      if (!res.ok) throw new Error();
      setDirty(false);
      toast.success("Configuração comercial salva.");
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (!draft) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;
  }

  const templateField = (
    label: string, key: "msgTemplate" | "msgSingleTemplate" | "eventTemplate" | "inclusionsText",
    fallback: string, rows: number, hint?: string
  ) => (
    <div>
      <label className="field-label">{label}</label>
      <textarea
        className="field-input w-full font-mono text-xs leading-relaxed"
        rows={rows}
        placeholder={fallback}
        value={draft[key] ?? ""}
        onChange={(e) => patch({ [key]: e.target.value || null } as Partial<Draft>)}
      />
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <SectionCard title="Taxa de pet" icon={PawPrint} description="Por pet, por diária — somada depois de todos os descontos.">
        <div className="max-w-[180px]">
          <label className="field-label">Valor (R$)</label>
          <input
            type="number" min={0} step={5} className="field-input w-full"
            value={draft.petFee}
            onChange={(e) => patch({ petFee: Math.max(0, parseFloat(e.target.value) || 0) })}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Flutuações de ocupação" icon={Percent}
        description="As opções de ajuste que o orçamento oferece. Positivo encarece; negativo desconta. A atribuição por PERÍODO (para o modo Automática) é feita em Tarifário › Flutuações."
      >
        <div className="space-y-2">
          {draft.fluctuations.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma flutuação cadastrada.</p>
          )}
          {draft.fluctuations.map((f) => (
            <div key={f.id} className="flex items-center gap-3 bg-secondary border border-border rounded-xl px-3 py-2">
              <span className="flex-1 text-sm font-medium text-foreground truncate">{f.name}</span>
              <span className={`text-sm font-bold ${f.pct > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                {f.pct > 0 ? "+" : ""}{f.pct}%
              </span>
              <button
                onClick={() => patch({ fluctuations: draft.fluctuations.filter((x) => x.id !== f.id) })}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                title="Remover (períodos já atribuídos não mudam — o % fica congelado na regra)"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input
              className="field-input flex-1" placeholder="Nome (ex.: Baixa ocupação)"
              value={newFluct.name} onChange={(e) => setNewFluct((p) => ({ ...p, name: e.target.value }))}
            />
            <input
              className="field-input w-24" placeholder="±%" inputMode="decimal"
              value={newFluct.pct} onChange={(e) => setNewFluct((p) => ({ ...p, pct: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") addFluct(); }}
            />
            <button onClick={addFluct} className="px-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20">
              <Plus size={15} />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Remover uma flutuação não altera períodos já atribuídos — o percentual fica congelado na regra.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Templates do orçamento" icon={MessageSquareText}
        description="Os textos que a cotação copia para o WhatsApp. Vazio = usa o padrão (mostrado no campo)."
      >
        <div className="space-y-4">
          {templateField(
            "Mensagem principal", "msgTemplate", DEFAULT_MSG_TEMPLATE, 10,
            "Variáveis: {ATENDENTE} {DATA_IN} {DATA_OUT} {QTD_PESSOAS} {PAGANTES} {FREE} {RESUMO_CABANAS} {AVISO_EVENTO} {QUOTE_LINK} {CASAMENTO_HEADER}"
          )}
          {templateField(
            "Bloco por cabana", "msgSingleTemplate", DEFAULT_MSG_SINGLE_TEMPLATE, 4,
            "Variáveis: {CABANA_NOME} {CABANA_VALOR} {CABANA_LINK}"
          )}
          {templateField(
            "Aviso de evento", "eventTemplate", DEFAULT_EVENT_TEMPLATE, 3,
            "Variáveis: {NOME_EVENTO} {DATA_EVENTO}"
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="O que está incluso" icon={CircleDollarSign}
        description="Lista exibida na proposta pública (/cotacao), acima das regras da pousada. Uma linha por item."
      >
        {templateField("Itens (um por linha)", "inclusionsText", DEFAULT_INCLUSIONS_TEXT, 6)}
      </SectionCard>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => { setDirty(false); load(); }} />
    </div>
  );
}
