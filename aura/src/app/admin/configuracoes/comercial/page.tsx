"use client";

import { SkeletonList } from "@/components/aura";

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
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useProperty } from "@/context/PropertyContext";
import { SaveBar } from "../_components/SaveBar";
import { SectionCard } from "@/components/ui/SectionCard";
import { Baby, CircleDollarSign, CreditCard, MessageSquareText, PawPrint, Percent, Plus, Trash2 } from "lucide-react";
import { DEFAULT_AGE_POLICY, RateFluctuation, RatePaymentOption, RateSettings } from "@/types/aura";
import {
  DEFAULT_EVENT_TEMPLATE, DEFAULT_INCLUSIONS_TEXT, DEFAULT_MSG_SINGLE_TEMPLATE,
  DEFAULT_MSG_TEMPLATE, DEFAULT_PAYMENT_OPTIONS,
} from "@/lib/rate-engine";

/** Só o recorte desta tela — descontos/promos (Marketing) ficam intactos. */
type Draft = Pick<
  RateSettings,
  | "petFee" | "agePolicy" | "fluctuations"
  | "msgTemplate" | "msgTemplate_en" | "msgTemplate_es"
  | "msgSingleTemplate" | "msgSingleTemplate_en" | "msgSingleTemplate_es"
  | "eventTemplate" | "eventTemplate_en" | "eventTemplate_es"
  | "inclusionsText" | "inclusionsText_en" | "inclusionsText_es"
  | "paymentOptions"
>;

type EditLang = "pt" | "en" | "es";
/** Chave da coluna real para um template base no idioma em edição — PT usa a
 *  coluna original, EN/ES usam a coluna irmã "_en"/"_es". */
const langKey = (base: string, lang: EditLang) => (lang === "pt" ? base : `${base}_${lang}`) as keyof Draft;

/**
 * Uma flutuação da lista — nome e % editáveis IN PLACE (antes só dava para
 * apagar e recriar). Commit no blur/Enter, como o resto do app: comitar a
 * cada tecla faria o campo perder o foco/valor no meio da digitação de "-5,5".
 */
function FluctuationRow({ f, onSave, onRemove }: {
  f: RateFluctuation;
  onSave: (id: string, patch: Partial<Pick<RateFluctuation, "name" | "pct">>) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(f.name);
  const [pctText, setPctText] = useState(String(f.pct));

  // Só resincroniza quando o dado vem de FORA (troca de propriedade, reset) —
  // não a cada render, senão a digitação em andamento seria apagada.
  useEffect(() => setName(f.name), [f.name]);
  useEffect(() => setPctText(String(f.pct)), [f.pct]);

  const commitName = () => {
    const v = name.trim();
    if (v && v !== f.name) onSave(f.id, { name: v });
    else setName(f.name);
  };
  const commitPct = () => {
    const v = parseFloat(pctText.replace(",", "."));
    if (Number.isFinite(v) && v !== f.pct) onSave(f.id, { pct: v });
    else setPctText(String(f.pct));
  };
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  const pctColor = f.pct > 0 ? "text-amber-500" : f.pct < 0 ? "text-emerald-500" : "text-muted-foreground";

  return (
    <div className="flex items-center gap-3 bg-secondary border border-border rounded-xl px-3 py-2">
      <input
        className="flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground outline-none border-b border-transparent focus:border-primary/50"
        value={name} onChange={(e) => setName(e.target.value)}
        onBlur={commitName} onKeyDown={blurOnEnter}
      />
      <span className="flex items-center gap-0.5 shrink-0">
        <input
          className={`w-14 bg-transparent text-sm font-bold text-right outline-none border-b border-transparent focus:border-primary/50 ${pctColor}`}
          inputMode="decimal" value={pctText}
          onChange={(e) => setPctText(e.target.value)}
          onBlur={commitPct} onKeyDown={blurOnEnter}
        />
        <span className={`text-sm font-bold ${pctColor}`}>%</span>
      </span>
      <button
        onClick={() => onRemove(f.id)}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0"
        title="Remover (períodos já atribuídos não mudam — o % fica congelado na regra)"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/**
 * Uma condição de pagamento — o rótulo é POR IDIOMA (a coluna PT é a base;
 * EN/ES vazios caem nela) e o % é o desconto que o cliente vê aplicado no
 * total da proposta. Mesmo commit-no-blur da flutuação.
 */
function PaymentRow({ opt, lang, onSave, onRemove }: {
  opt: RatePaymentOption;
  lang: EditLang;
  onSave: (id: string, patch: Partial<RatePaymentOption>) => void;
  onRemove: (id: string) => void;
}) {
  const labelKey = (lang === "pt" ? "label" : `label_${lang}`) as "label" | "label_en" | "label_es";
  const current = (opt[labelKey] as string | null) ?? "";
  const [label, setLabel] = useState(current);
  const [pctText, setPctText] = useState(String(opt.discountPct));

  useEffect(() => setLabel(current), [current]);
  useEffect(() => setPctText(String(opt.discountPct)), [opt.discountPct]);

  const commitLabel = () => {
    const v = label.trim();
    if (v !== current) onSave(opt.id, { [labelKey]: v || null } as Partial<RatePaymentOption>);
  };
  const commitPct = () => {
    const v = Math.min(100, Math.max(0, parseFloat(pctText.replace(",", ".")) || 0));
    if (v !== opt.discountPct) onSave(opt.id, { discountPct: v });
    else setPctText(String(opt.discountPct));
  };
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <div className="flex items-center gap-3 bg-secondary border border-border rounded-xl px-3 py-2">
      <input
        className="flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground outline-none border-b border-transparent focus:border-primary/50"
        value={label} onChange={(e) => setLabel(e.target.value)}
        placeholder={lang === "pt" ? "Ex.: À vista via Pix (5% de desconto)" : opt.label}
        onBlur={commitLabel} onKeyDown={blurOnEnter}
      />
      <span className="flex items-center gap-0.5 shrink-0" title="Desconto aplicado no total exibido ao cliente">
        <input
          className={`w-12 bg-transparent text-sm font-bold text-right outline-none border-b border-transparent focus:border-primary/50 ${
            opt.discountPct > 0 ? "text-emerald-500" : "text-muted-foreground"
          }`}
          inputMode="decimal" value={pctText}
          onChange={(e) => setPctText(e.target.value)}
          onBlur={commitPct} onKeyDown={blurOnEnter}
          disabled={lang !== "pt"}
        />
        <span className={`text-sm font-bold ${opt.discountPct > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>%</span>
      </span>
      <button
        onClick={() => onRemove(opt.id)} disabled={lang !== "pt"}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0 disabled:opacity-30"
        title={lang === "pt" ? "Remover condição" : "Remova pelo idioma Português"}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function ComercialConfigPage() {
  const { currentProperty: property } = useProperty();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newFluct, setNewFluct] = useState({ name: "", pct: "" });
  // Idioma em edição para "Templates do orçamento" e "O que está incluso" —
  // PT é sempre a coluna original; EN/ES editam as colunas irmãs "_en"/"_es".
  const [editLang, setEditLang] = useState<EditLang>("pt");

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const res = await fetch(`/api/admin/tarifario?propertyId=${property.id}`);
      if (!res.ok) throw new Error();
      const bundle = await res.json();
      const s: RateSettings = bundle.settings;
      setDraft({
        petFee: s.petFee ?? 50,
        agePolicy: s.agePolicy ?? DEFAULT_AGE_POLICY,
        fluctuations: s.fluctuations ?? [],
        msgTemplate: s.msgTemplate ?? null,
        msgTemplate_en: s.msgTemplate_en ?? null,
        msgTemplate_es: s.msgTemplate_es ?? null,
        msgSingleTemplate: s.msgSingleTemplate ?? null,
        msgSingleTemplate_en: s.msgSingleTemplate_en ?? null,
        msgSingleTemplate_es: s.msgSingleTemplate_es ?? null,
        eventTemplate: s.eventTemplate ?? null,
        eventTemplate_en: s.eventTemplate_en ?? null,
        eventTemplate_es: s.eventTemplate_es ?? null,
        inclusionsText: s.inclusionsText ?? null,
        inclusionsText_en: s.inclusionsText_en ?? null,
        inclusionsText_es: s.inclusionsText_es ?? null,
        paymentOptions: s.paymentOptions ?? null,
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

  // Updater FUNCIONAL (nunca lê `draft` do closure externo): add, editar e
  // remover em sequência rápida sem risco de um passo pisar no outro.
  const patchFluctuations = (updater: (list: RateFluctuation[]) => RateFluctuation[]) => {
    setDraft((prev) => (prev ? { ...prev, fluctuations: updater(prev.fluctuations) } : prev));
    setDirty(true);
  };

  const addFluct = () => {
    const pct = parseFloat(newFluct.pct.replace(",", "."));
    if (!newFluct.name.trim() || !Number.isFinite(pct)) return toast.error("Preencha nome e percentual.");
    const item: RateFluctuation = { id: crypto.randomUUID(), name: newFluct.name.trim(), pct };
    patchFluctuations((list) => [...list, item]);
    setNewFluct({ name: "", pct: "" });
  };

  const updateFluct = (id: string, item: Partial<Pick<RateFluctuation, "name" | "pct">>) =>
    patchFluctuations((list) => list.map((f) => (f.id === id ? { ...f, ...item } : f)));

  const removeFluct = (id: string) =>
    patchFluctuations((list) => list.filter((f) => f.id !== id));

  // ── Condições de pagamento (proposta pública) ──────────────────────────────
  // Lista vazia/nula = a proposta usa DEFAULT_PAYMENT_OPTIONS. Mexer em
  // qualquer linha materializa a lista inteira: meia configuração salva seria
  // pior que nenhuma (o cliente veria só uma condição).
  const paymentOptions = draft?.paymentOptions ?? null;
  const effectivePayments = paymentOptions?.length ? paymentOptions : DEFAULT_PAYMENT_OPTIONS;

  const patchPayments = (updater: (list: RatePaymentOption[]) => RatePaymentOption[]) => {
    setDraft((prev) => (prev
      ? { ...prev, paymentOptions: updater(prev.paymentOptions?.length ? prev.paymentOptions : DEFAULT_PAYMENT_OPTIONS) }
      : prev));
    setDirty(true);
  };

  const updatePayment = (id: string, item: Partial<RatePaymentOption>) =>
    patchPayments((list) => list.map((o) => (o.id === id ? { ...o, ...item } : o)));

  const removePayment = (id: string) =>
    patchPayments((list) => list.filter((o) => o.id !== id));

  const addPayment = () =>
    patchPayments((list) => [...list, {
      id: crypto.randomUUID(),
      label: "", label_en: null, label_es: null,
      discountPct: 0,
      order: (list.at(-1)?.order ?? 0) + 1,
    }]);

  const resetPayments = () => {
    setDraft((prev) => (prev ? { ...prev, paymentOptions: null } : prev));
    setDirty(true);
  };

  // Sempre por %: a lista não pode reordenar sozinha enquanto alguém digita
  // (o componente da linha só comita no blur), só reflete depois de salvar.
  const sortedFluctuations = useMemo(
    () => (draft ? [...draft.fluctuations].sort((a, b) => a.pct - b.pct) : []),
    [draft]
  );

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
    return <SkeletonList rows={4} avatar={false} />;
  }

  const templateField = (
    label: string, base: "msgTemplate" | "msgSingleTemplate" | "eventTemplate" | "inclusionsText",
    fallback: string, rows: number, hint?: string
  ) => {
    const key = langKey(base, editLang);
    // EN/ES vazio cai no texto PT na hora de usar — o placeholder mostra
    // exatamente esse texto, não o padrão genérico, para o vendedor saber o
    // que vai sair se deixar em branco.
    const placeholder = editLang === "pt" ? fallback : (draft[base] as string | null) || fallback;
    return (
      <div>
        <label className="field-label">{label}</label>
        <textarea
          className="field-input w-full font-mono text-xs leading-relaxed"
          rows={rows}
          placeholder={placeholder}
          value={(draft[key] as string | null) ?? ""}
          onChange={(e) => patch({ [key]: e.target.value || null } as Partial<Draft>)}
        />
        {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
        {editLang !== "pt" && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Vazio = usa o texto em Português.
          </p>
        )}
      </div>
    );
  };

  const langSwitcher = (
    <div className="inline-flex gap-1 bg-secondary/70 rounded-lg p-1 border border-border/40">
      {(["pt", "en", "es"] as const).map((l) => (
        <button key={l} type="button" onClick={() => setEditLang(l)}
          className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${
            editLang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}>
          {l}
        </button>
      ))}
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
        title="Idade dos acompanhantes" icon={Baby}
        description="Quem não paga, quem paga meia e quem paga inteiro. Vale para o orçamento e para classificar as reservas que chegam pelos canais."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
          <div>
            <label className="field-label">Isento até (anos)</label>
            <input
              type="number" min={0} max={17} step={1} className="field-input w-full"
              value={draft.agePolicy?.freeUpToAge ?? 5}
              onChange={(e) => patch({ agePolicy: {
                ...(draft.agePolicy ?? DEFAULT_AGE_POLICY),
                freeUpToAge: Math.max(0, Math.min(17, parseInt(e.target.value || "0", 10))),
              } })}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              0 a {draft.agePolicy?.freeUpToAge ?? 5} anos não entram como pagantes.
            </p>
          </div>
          <div>
            <label className="field-label">Meia diária até (anos)</label>
            <input
              type="number" min={0} max={17} step={1} className="field-input w-full"
              placeholder="sem meia"
              value={draft.agePolicy?.halfUpToAge ?? ""}
              onChange={(e) => patch({ agePolicy: {
                ...(draft.agePolicy ?? DEFAULT_AGE_POLICY),
                halfUpToAge: e.target.value === "" ? null : Math.max(0, Math.min(17, parseInt(e.target.value, 10))),
              } })}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Vazio = ninguém paga meia; a partir de {(draft.agePolicy?.freeUpToAge ?? 5) + 1} anos paga inteiro.
            </p>
          </div>
          <div>
            <label className="field-label">Meia equivale a (%)</label>
            <input
              type="number" min={0} max={100} step={5} className="field-input w-full"
              value={draft.agePolicy?.halfPercent ?? 50}
              disabled={draft.agePolicy?.halfUpToAge == null}
              onChange={(e) => patch({ agePolicy: {
                ...(draft.agePolicy ?? DEFAULT_AGE_POLICY),
                halfPercent: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)),
              } })}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          A faixa isenta já vale na importação de reservas dos canais: criança dentro dela entra como bebê,
          fora dela como criança. O desconto de meia diária ainda não é aplicado no cálculo do orçamento —
          a coluna do tarifário conta pagantes inteiros.
        </p>
      </SectionCard>

      <SectionCard
        title="Flutuações de ocupação" icon={Percent}
        description="As opções de ajuste que o orçamento oferece. Positivo encarece; negativo desconta. A atribuição por PERÍODO (para o modo Automática) é feita em Tarifário › Flutuações."
      >
        <div className="space-y-2">
          {sortedFluctuations.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma flutuação cadastrada.</p>
          )}
          {sortedFluctuations.map((f) => (
            <FluctuationRow key={f.id} f={f} onSave={updateFluct} onRemove={removeFluct} />
          ))}
          <div className="flex gap-2 pt-1">
            <input
              className="field-input flex-1" placeholder="Nome (ex.: Baixa ocupação)"
              value={newFluct.name} onChange={(e) => setNewFluct((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") addFluct(); }}
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
            Clique no nome ou no % para editar direto na lista — a ordem segue sempre o percentual.
            Remover não altera períodos já atribuídos: o valor fica congelado na regra.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Templates do orçamento" icon={MessageSquareText}
        description="Os textos que a cotação copia para o WhatsApp, em PT/EN/ES — o idioma escolhido no orçamento decide qual sai. Vazio em PT = usa o padrão (mostrado no campo); vazio em EN/ES = usa o texto em Português."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              Editando em
            </span>
            {langSwitcher}
          </div>
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
        description="Lista exibida na proposta pública (/cotacao), acima das regras da pousada, em PT/EN/ES. Uma linha por item."
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              Editando em
            </span>
            {langSwitcher}
          </div>
          {templateField("Itens (um por linha)", "inclusionsText", DEFAULT_INCLUSIONS_TEXT, 6)}
        </div>
      </SectionCard>

      <SectionCard
        title="Condições de pagamento" icon={CreditCard}
        description="As formas de pagamento que o cliente escolhe ao preencher o cadastro na proposta pública. O desconto recalcula o total EXIBIDO na tela — o valor do orçamento no funil não muda; quem fecha a conta é a recepção."
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              Editando em
            </span>
            {langSwitcher}
          </div>

          {!paymentOptions?.length && (
            <p className="text-xs text-muted-foreground">
              Usando as condições padrão. Editar qualquer linha abaixo passa a valer como
              configuração desta propriedade.
            </p>
          )}

          {effectivePayments.map((o) => (
            <PaymentRow key={o.id} opt={o} lang={editLang}
              onSave={updatePayment} onRemove={removePayment} />
          ))}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={addPayment} disabled={editLang !== "pt"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold disabled:opacity-40">
              <Plus size={14} /> Adicionar condição
            </button>
            {!!paymentOptions?.length && (
              <button onClick={resetPayments}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground">
                Voltar ao padrão
              </button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            O % só é editado no idioma Português (é o mesmo desconto nos três).
            Vazio em EN/ES = usa o texto em Português.
          </p>
        </div>
      </SectionCard>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={() => { setDirty(false); load(); }} />
    </div>
  );
}
