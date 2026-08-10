// Aba Comercial — taxa pet, flutuações de ocupação, descontos manuais,
// promoções automáticas, links por categoria e templates de WhatsApp.
// Tudo edita um rascunho local e salva de uma vez (PUT rate_settings).
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link2, Loader2, PawPrint, Plus, Trash2 } from "lucide-react";
import { RateDiscount, RateFluctuation, RatePromo, RateSettings } from "@/types/aura";
import type { RateBundle } from "@/services/rate-service";
import {
  DEFAULT_EVENT_TEMPLATE, DEFAULT_INCLUSIONS_TEXT, DEFAULT_MSG_SINGLE_TEMPLATE,
  DEFAULT_MSG_TEMPLATE,
} from "@/lib/rate-engine";

interface Props {
  propertyId: string;
  bundle: RateBundle;
  onRefresh: () => Promise<void> | void;
}

const DAY_TYPE_LABEL: Record<RatePromo["dayType"], string> = {
  all: "📅 Todo o período",
  fds: "🏖️ Só FDS (sex/sáb)",
  week: "💼 Só dia de semana (dom–qui)",
};

export default function CommercialTab({ propertyId, bundle, onRefresh }: Props) {
  const [draft, setDraft] = useState<RateSettings>(bundle.settings);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(bundle.settings);
  }, [bundle.settings, dirty]);

  const patch = (partial: Partial<RateSettings>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  };

  // Formulários de item novo
  const [newFluct, setNewFluct] = useState({ name: "", pct: "" });
  const [newDisc, setNewDisc] = useState({ name: "", pct: "" });
  const [newPromo, setNewPromo] = useState({
    name: "", pct: "", startDate: "", endDate: "", minNights: "1", dayType: "all" as RatePromo["dayType"],
  });

  const categories = bundle.categories;

  const addFluct = () => {
    const pct = parseFloat(newFluct.pct);
    if (!newFluct.name.trim() || isNaN(pct)) return toast.error("Preencha nome e percentual.");
    const item: RateFluctuation = { id: crypto.randomUUID(), name: newFluct.name.trim(), pct };
    patch({ fluctuations: [...draft.fluctuations, item] });
    setNewFluct({ name: "", pct: "" });
  };

  const addDisc = () => {
    const pct = parseFloat(newDisc.pct);
    if (!newDisc.name.trim() || isNaN(pct)) return toast.error("Preencha nome e percentual.");
    const item: RateDiscount = { id: crypto.randomUUID(), name: newDisc.name.trim(), pct };
    patch({ discounts: [...draft.discounts, item] });
    setNewDisc({ name: "", pct: "" });
  };

  const addPromo = () => {
    const pct = parseFloat(newPromo.pct);
    if (!newPromo.name.trim() || isNaN(pct) || !newPromo.startDate || !newPromo.endDate) {
      return toast.error("Preencha nome, percentual e datas da promoção.");
    }
    if (newPromo.startDate > newPromo.endDate) return toast.error("Data inicial maior que a final.");
    const item: RatePromo = {
      id: crypto.randomUUID(),
      name: newPromo.name.trim(),
      pct,
      startDate: newPromo.startDate,
      endDate: newPromo.endDate,
      minNights: parseInt(newPromo.minNights) || 1,
      dayType: newPromo.dayType,
    };
    patch({ promos: [...draft.promos, item] });
    setNewPromo({ name: "", pct: "", startDate: "", endDate: "", minNights: "1", dayType: "all" });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tarifario/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, settings: draft }),
      });
      if (!res.ok) throw new Error();
      // Refresh antes de soltar o dirty, para o sync-effect já pegar o bundle novo.
      await onRefresh();
      setDirty(false);
      toast.success("Configurações salvas.");
    } catch {
      toast.error("Erro ao salvar as configurações.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Coluna esquerda */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <PawPrint size={16} /> Taxa pet (por pet, por diária)
            </h3>
            <input type="number" min={0} className="field-input !w-40" value={draft.petFee}
              onChange={(e) => patch({ petFee: parseFloat(e.target.value) || 0 })} />
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-3 border-l-4 border-l-orange-400">
            <h3 className="font-semibold text-foreground">🎁 Promoções automáticas</h3>
            <p className="text-xs text-muted-foreground">
              Aplicadas por diária dentro do intervalo, respeitando o mínimo de noites da consulta.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input className="field-input col-span-2" placeholder="Nome (ex.: FDS baixa 2027)"
                value={newPromo.name} onChange={(e) => setNewPromo({ ...newPromo, name: e.target.value })} />
              <input type="date" className="field-input" value={newPromo.startDate}
                onChange={(e) => setNewPromo({ ...newPromo, startDate: e.target.value })} />
              <input type="date" className="field-input" value={newPromo.endDate}
                onChange={(e) => setNewPromo({ ...newPromo, endDate: e.target.value })} />
              <select className="field-input" value={newPromo.dayType}
                onChange={(e) => setNewPromo({ ...newPromo, dayType: e.target.value as RatePromo["dayType"] })}>
                {Object.entries(DAY_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" className="field-input" placeholder="%"
                  value={newPromo.pct} onChange={(e) => setNewPromo({ ...newPromo, pct: e.target.value })} />
                <input type="number" min={1} className="field-input" placeholder="Mín. noites"
                  value={newPromo.minNights}
                  onChange={(e) => setNewPromo({ ...newPromo, minNights: e.target.value })} />
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={addPromo}>
              <Plus size={13} className="mr-1" /> Adicionar promoção
            </Button>
            <div className="space-y-1.5">
              {draft.promos.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 bg-secondary rounded-lg px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <b>{p.name}</b> <span className="text-emerald-600 font-bold">-{p.pct}%</span>
                    <span className="text-xs text-muted-foreground">
                      {" "}· {p.startDate.split("-").reverse().join("/")} a {p.endDate.split("-").reverse().join("/")}
                      {" "}· mín {p.minNights}n · {DAY_TYPE_LABEL[p.dayType]}
                    </span>
                  </div>
                  <button className="text-muted-foreground hover:text-red-600 shrink-0"
                    onClick={() => patch({ promos: draft.promos.filter((x) => x.id !== p.id) })}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-3 border-l-4 border-l-emerald-400">
            <h3 className="font-semibold text-foreground">📉 Descontos manuais (checkbox no orçamento)</h3>
            <div className="flex gap-2">
              <input className="field-input flex-1" placeholder="Nome (ex.: Pix à vista)"
                value={newDisc.name} onChange={(e) => setNewDisc({ ...newDisc, name: e.target.value })} />
              <input type="number" className="field-input !w-24" placeholder="%"
                value={newDisc.pct} onChange={(e) => setNewDisc({ ...newDisc, pct: e.target.value })} />
              <Button variant="secondary" size="sm" onClick={addDisc}><Plus size={14} /></Button>
            </div>
            <div className="space-y-1.5">
              {draft.discounts.map((d) => (
                <div key={d.id} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2 text-sm">
                  <span><b>{d.name}</b> <span className="text-emerald-600 font-bold">-{d.pct}%</span></span>
                  <button className="text-muted-foreground hover:text-red-600"
                    onClick={() => patch({ discounts: draft.discounts.filter((x) => x.id !== d.id) })}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-3 border-l-4 border-l-blue-400">
            <h3 className="font-semibold text-foreground">📊 Flutuações de ocupação</h3>
            <div className="flex gap-2">
              <input className="field-input flex-1" placeholder="Nome (ex.: Alta)"
                value={newFluct.name} onChange={(e) => setNewFluct({ ...newFluct, name: e.target.value })} />
              <input type="number" className="field-input !w-24" placeholder="+%"
                value={newFluct.pct} onChange={(e) => setNewFluct({ ...newFluct, pct: e.target.value })} />
              <Button variant="secondary" size="sm" onClick={addFluct}><Plus size={14} /></Button>
            </div>
            <div className="space-y-1.5">
              {draft.fluctuations.map((f) => (
                <div key={f.id} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2 text-sm">
                  <span><b>{f.name}</b> <span className="text-blue-600 font-bold">{f.pct > 0 ? "+" : ""}{f.pct}%</span></span>
                  <button className="text-muted-foreground hover:text-red-600"
                    onClick={() => patch({ fluctuations: draft.fluctuations.filter((x) => x.id !== f.id) })}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Link2 size={16} /> Links por categoria (site)
            </h3>
            <p className="text-xs text-muted-foreground">
              Os links do site agora vivem na própria categoria, junto do nome comercial —
              cadastre em <b>Cabanas → Categorias</b>. Eles entram na mensagem em {"{CABANA_LINK}"}.
            </p>
            <div className="space-y-1.5">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 text-sm bg-secondary rounded-lg px-3 py-2">
                  <span className="flex-1 truncate">
                    {cat.name}
                    {cat.shortName && <span className="text-muted-foreground"> · “{cat.shortName}”</span>}
                  </span>
                  {cat.siteUrl
                    ? <span className="text-xs font-bold text-emerald-600 shrink-0">link ok</span>
                    : <span className="text-xs text-muted-foreground shrink-0">sem link</span>}
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada ainda.</p>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-foreground">💬 Templates de WhatsApp</h3>
            <div>
              <label className="field-label">Cotação (principal)</label>
              <textarea className="field-input !h-44 text-xs font-mono"
                placeholder={DEFAULT_MSG_TEMPLATE}
                value={draft.msgTemplate || ""}
                onChange={(e) => patch({ msgTemplate: e.target.value || null })} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Vars: {"{ATENDENTE} {DATA_IN} {DATA_OUT} {QTD_PESSOAS} {PAGANTES} {FREE} {PETS} {RESUMO_CABANAS} {AVISO_EVENTO} {CASAMENTO_HEADER} {QUOTE_LINK}"}
                {" — "}<b>{"{QUOTE_LINK}"}</b> é a página onde o cliente escolhe a cabana e aceita;
                a linha inteira some quando o orçamento ainda não foi salvo.
              </p>
            </div>
            <div>
              <label className="field-label">Cabana única</label>
              <textarea className="field-input !h-24 text-xs font-mono"
                placeholder={DEFAULT_MSG_SINGLE_TEMPLATE}
                value={draft.msgSingleTemplate || ""}
                onChange={(e) => patch({ msgSingleTemplate: e.target.value || null })} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Vars: {"{CABANA_NOME} {CABANA_VALOR} {CABANA_LINK}"}
              </p>
            </div>
            <div>
              <label className="field-label">Aviso de evento</label>
              <textarea className="field-input !h-20 text-xs font-mono"
                placeholder={DEFAULT_EVENT_TEMPLATE}
                value={draft.eventTemplate || ""}
                onChange={(e) => patch({ eventTemplate: e.target.value || null })} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Vars: {"{NOME_EVENTO} {DATA_EVENTO}"} · em branco = template padrão
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-foreground">✅ O que está incluso</h3>
            <p className="text-xs text-muted-foreground">
              Aparece na página da proposta que o cliente abre, logo acima das regras
              da pousada. <b>Uma linha por item</b> — vira uma lista na tela.
            </p>
            <textarea className="field-input !h-40 text-xs"
              placeholder={DEFAULT_INCLUSIONS_TEXT}
              value={draft.inclusionsText || ""}
              onChange={(e) => patch({ inclusionsText: e.target.value || null })} />
            <p className="text-[10px] text-muted-foreground">
              Em branco = a seção não aparece na proposta.
            </p>
          </div>
        </div>
      </div>

      {/* Barra de salvar */}
      {dirty && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-background border border-border rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Alterações não salvas</span>
          <Button variant="ghost" size="sm" onClick={() => { setDraft(bundle.settings); setDirty(false); }}>
            Descartar
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1 animate-spin" />} Salvar configurações
          </Button>
        </div>
      )}
    </div>
  );
}
