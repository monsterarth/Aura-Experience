// src/app/admin/patrimonio/etiquetas/page.tsx
// Folha A4 de etiquetas de patrimônio, com painel de personalização.
//
// O domínio impresso aparece em destaque ANTES de imprimir: ele vai gravado na
// plaqueta física e não muda depois. Quem manda o arquivo para o gravador
// precisa ver qual endereço está indo — e sem domínio próprio a impressão é
// bloqueada, não só avisada.
//
// As preferências ficam em localStorage, por propriedade: são de quem imprime,
// e gravá-las em properties.settings daqui exigiria reescrever o objeto inteiro
// de configurações da propriedade, com risco de sobrescrever o que outra aba
// estivesse editando.
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { AssetLabel, AssetLabelOptions, DEFAULT_ASSET_LABEL_OPTIONS } from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Loader2, Printer, Search, CheckSquare, Square, ShieldAlert, SlidersHorizontal, RotateCcw,
} from "lucide-react";
import PrintReport from "@/components/admin/PrintReport";
import AssetLabelCard from "@/components/admin/AssetLabelCard";
import PatrimonioTabs from "../PatrimonioTabs";

/**
 * Host de fallback do Aura — o que `publicBaseUrl` (asset-service) usa quando a
 * propriedade não tem `settings.customDomain`. Gravar ESTE domínio numa plaqueta
 * de metal amarra o patrimônio ao Aura para sempre: se um dia a pousada trocar de
 * sistema, não há como repontar. Por isso a impressão é bloqueada aqui.
 * Duplicado de propósito: asset-service importa supabaseAdmin e não pode vir para
 * o bundle do cliente só por causa de uma string.
 */
const AURA_FALLBACK_HOST = "aaura.app.br";

/**
 * `width` é a largura REAL impressa: A4 retrato (210mm) menos as margens de
 * 12mm do PrintReport = 186mm de área útil, dividida pelas colunas, menos o
 * gap. A prévia usa esse número para mostrar a etiqueta no tamanho que sai no
 * papel — com uma largura inventada, o texto parece caber e depois estoura.
 */
const SIZES: Record<AssetLabelOptions["size"], { label: string; cols: number; qr: number; width: number; hint: string }> = {
  large: { label: "Grande · 2 por linha", cols: 2, qr: 120, width: 344, hint: "≈ 91 × 45 mm — equipamentos maiores" },
  small: { label: "Pequena · 3 por linha", cols: 3, qr: 80, width: 224, hint: "≈ 59 × 35 mm — móveis e eletrônicos pequenos" },
};

const storageKey = (propertyId: string) => `aura:assetLabel:${propertyId}`;

/** Alterna simples, para o painel de personalização. */
function Toggle({ label, hint, checked, disabled, onChange }: {
  label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className={cn("flex items-start gap-2.5 cursor-pointer", disabled && "opacity-50 cursor-not-allowed")}>
      <input
        type="checkbox" checked={checked} disabled={disabled} className="mt-0.5"
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm text-foreground leading-tight">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

export default function EtiquetasPage() {
  const { currentProperty: property } = useProperty();
  const [labels, setLabels] = useState<AssetLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [options, setOptions] = useState<AssetLabelOptions>(DEFAULT_ASSET_LABEL_OPTIONS);

  const logoFullUrl = property?.settings?.logoFullUrl;

  const load = useCallback(async () => {
    if (!property?.id) return;
    try {
      const data = await StockClient.assetLabels(property.id, []);
      setLabels(data);
      setSelected(new Set(data.map((l) => l.id)));
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [property?.id]);

  useEffect(() => { load(); }, [load]);

  // Restaura as preferências salvas desta propriedade.
  useEffect(() => {
    if (!property?.id) return;
    try {
      const raw = window.localStorage.getItem(storageKey(property.id));
      if (raw) setOptions({ ...DEFAULT_ASSET_LABEL_OPTIONS, ...JSON.parse(raw) });
      else setOptions(DEFAULT_ASSET_LABEL_OPTIONS);
    } catch { setOptions(DEFAULT_ASSET_LABEL_OPTIONS); }
  }, [property?.id]);

  const setOpt = (patch: Partial<AssetLabelOptions>) => {
    setOptions((o) => {
      const next = { ...o, ...patch };
      if (property?.id) {
        try { window.localStorage.setItem(storageKey(property.id), JSON.stringify(next)); } catch { /* quota/privado */ }
      }
      return next;
    });
  };

  const resetOptions = () => {
    setOptions(DEFAULT_ASSET_LABEL_OPTIONS);
    if (property?.id) {
      try { window.localStorage.removeItem(storageKey(property.id)); } catch { /* noop */ }
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return labels;
    return labels.filter((l) =>
      l.name.toLowerCase().includes(q) || l.assetTag.toLowerCase().includes(q) || l.publicCode.toLowerCase().includes(q));
  }, [labels, search]);

  const toPrint = useMemo(() => labels.filter((l) => selected.has(l.id)), [labels, selected]);

  // Todas as URLs compartilham a mesma origem — é ela que vai para o metal.
  const origin = useMemo(() => {
    const u = labels[0]?.url;
    try { return u ? new URL(u).origin : ""; } catch { return ""; }
  }, [labels]);

  // Sem domínio próprio, a plaqueta nasce presa ao Aura. Bloqueia a impressão.
  const onFallbackDomain = !!origin && origin.includes(AURA_FALLBACK_HOST);

  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected((s) => {
    const next = new Set(s);
    if (allFilteredSelected) filtered.forEach((l) => next.delete(l.id));
    else filtered.forEach((l) => next.add(l.id));
    return next;
  });

  if (!property) return <div className="p-8 text-muted-foreground">Selecione uma propriedade.</div>;

  const cfg = SIZES[options.size];

  return (
    <div className="max-w-5xl mx-auto">
      <Link href="/admin/patrimonio" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={15} /> Patrimônio
      </Link>

      <header className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Etiquetas de patrimônio</h1>
        <p className="text-sm text-muted-foreground">
          Monte a etiqueta, veja a prévia no tamanho real e imprima a folha A4.
        </p>
      </header>

      <PatrimonioTabs active="etiquetas" />

      {origin && !onFallbackDomain && (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm text-foreground">
            Os QRs desta folha apontam para <b className="font-mono">{origin}/p/…</b>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Esse endereço fica gravado na plaqueta física e não pode ser trocado depois. Confira antes de mandar
            imprimir. Para mudar, ajuste o domínio da propriedade em Configurações antes de gerar as etiquetas.
          </p>
        </div>
      )}

      {onFallbackDomain && (
        <div className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <ShieldAlert size={16} className="text-destructive" /> Impressão bloqueada: sem domínio próprio
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Os QRs sairiam apontando para <b className="font-mono">{origin}</b>, que é o domínio do Aura. Como a
            plaqueta é gravada em metal e não pode ser reimpressa, isso amarraria o patrimônio de{" "}
            <b className="text-foreground">{property.name}</b> a este sistema para sempre — se um dia vocês trocarem
            de software, não haveria como repontar os códigos.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Cadastre um domínio da própria pousada (ex.: <span className="font-mono">aura.suapousada.com.br</span>)
            em Configurações da propriedade e volte aqui. As etiquetas passam a apontar para ele automaticamente.
          </p>
          <Link
            href={`/admin/core/properties/${property.id}`}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-secondary text-foreground hover:opacity-90"
          >
            Configurar domínio da propriedade
          </Link>
        </div>
      )}

      {/* Personalização + prévia lado a lado: mexeu, viu. */}
      <div className="grid lg:grid-cols-[1fr_auto] gap-5 my-5 items-start">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <SlidersHorizontal size={13} /> Personalização
            </p>
            <button onClick={resetOptions} className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground">
              <RotateCcw size={11} /> Padrão
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="field-label">Tamanho</label>
              <select
                className="field-input w-full"
                value={options.size}
                onChange={(e) => setOpt({ size: e.target.value as AssetLabelOptions["size"] })}
              >
                {(Object.entries(SIZES) as [AssetLabelOptions["size"], { label: string }][]).map(([v, s]) => (
                  <option key={v} value={v}>{s.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">{cfg.hint}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              <Toggle
                label="Logo da pousada"
                hint={options.showLogo ? undefined : "Sem logo, entra o nome escrito"}
                checked={options.showLogo}
                onChange={(v) => setOpt({ showLogo: v })}
              />
              <Toggle
                label="Nome do ativo"
                hint="Ex.: NOTEBOOK ARTHUR"
                checked={options.showName}
                onChange={(v) => setOpt({ showName: v })}
              />
              <Toggle
                label="Moldura no número"
                checked={options.framed}
                onChange={(v) => setOpt({ framed: v })}
              />
              <Toggle
                label="Logo em preto e branco"
                disabled={!options.showLogo}
                checked={options.monochrome}
                onChange={(v) => setOpt({ monochrome: v })}
              />
              <Toggle
                label="Camaleão no centro do QR"
                checked={options.auraMark}
                onChange={(v) => setOpt({ auraMark: v })}
              />
              <Toggle
                label="“Powered by Aura”"
                checked={options.poweredBy}
                onChange={(v) => setOpt({ poweredBy: v })}
              />
            </div>

            {options.showLogo && (
              <div className="pt-1">
                <label className="field-label">Versão da logo</label>
                <select
                  className="field-input w-full"
                  value={options.logoVariant}
                  onChange={(e) => setOpt({ logoVariant: e.target.value as AssetLabelOptions["logoVariant"] })}
                >
                  <option value="full">Completa (marca + nome)</option>
                  <option value="simple">Simplificada (só a marca)</option>
                </select>
                {options.logoVariant === "full" && !logoFullUrl && (
                  <p className="text-xs text-amber-500 mt-1">
                    Logo completa não cadastrada — está usando a simplificada.{" "}
                    <Link href={`/admin/core/properties/${property.id}`} className="underline">Cadastrar</Link>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Prévia no tamanho impresso. Fundo branco fixo: é assim que sai no papel. */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Prévia · tamanho real
          </p>
          <div className="inline-block rounded-2xl bg-white p-4 text-black">
            <div style={{ width: cfg.width }}>
              {toPrint.length > 0 ? (
                <AssetLabelCard
                  label={toPrint[0]}
                  options={options}
                  propertyName={property.name}
                  logoUrl={property.logoUrl}
                  logoFullUrl={logoFullUrl}
                  qrSize={cfg.qr}
                />
              ) : (
                <p className="text-xs text-neutral-500 py-8 text-center">Selecione ao menos um ativo.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="field-input w-full pl-9" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          onClick={() => setPrinting(true)}
          disabled={toPrint.length === 0 || onFallbackDomain}
          title={onFallbackDomain ? "Cadastre um domínio próprio da pousada antes de gerar plaquetas." : undefined}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Printer size={15} /> Imprimir {toPrint.length} etiqueta(s)
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : labels.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          Nenhum ativo com plaqueta. Cadastre um ativo — o código é gerado automaticamente.
        </p>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <button onClick={toggleAll} className="w-full px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground border-b border-border">
            {allFilteredSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            {allFilteredSelected ? "Desmarcar" : "Marcar"} os {filtered.length} visíveis
          </button>
          <ul className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
            {filtered.map((l) => (
              <li key={l.id}>
                <button onClick={() => toggle(l.id)} className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-secondary/30">
                  {selected.has(l.id) ? <CheckSquare size={15} className="text-primary shrink-0" /> : <Square size={15} className="text-muted-foreground shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-foreground truncate">{l.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {l.assetTag && <span className="font-mono">#{l.assetTag} · </span>}
                      <span className="font-mono">{l.publicCode}</span>
                      {l.locationName && <> · {l.locationName}</>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {printing && (
        <PrintReport
          title="Etiquetas de patrimônio"
          subtitle={`${property.name} · ${toPrint.length} etiqueta(s) · ${origin}/p/`}
          onClose={() => setPrinting(false)}
        >
          <div className={cn("grid gap-3", cfg.cols === 2 ? "grid-cols-2" : "grid-cols-3")}>
            {toPrint.map((l) => (
              <AssetLabelCard
                key={l.id}
                label={l}
                options={options}
                propertyName={property.name}
                logoUrl={property.logoUrl}
                logoFullUrl={logoFullUrl}
                qrSize={cfg.qr}
              />
            ))}
          </div>
        </PrintReport>
      )}
    </div>
  );
}
