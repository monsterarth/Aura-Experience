// src/app/admin/patrimonio/etiquetas/page.tsx
// Folha A4 de etiquetas de patrimônio (QR + nº + nome) para colar nas plaquetas.
//
// O domínio impresso aparece em destaque na tela ANTES de imprimir: ele vai
// gravado no metal e não muda depois. Quem manda o arquivo para o gravador
// precisa ver qual endereço está indo.
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useProperty } from "@/context/PropertyContext";
import { StockClient } from "@/lib/stock-client";
import { AssetLabel } from "@/types/aura";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, Printer, Search, CheckSquare, Square, ShieldAlert } from "lucide-react";
import PrintReport from "@/components/admin/PrintReport";
import AssetQr from "@/components/admin/AssetQr";
import PatrimonioTabs from "../PatrimonioTabs";

type LabelSize = "large" | "small";

/**
 * Host de fallback do Aura — o que `publicBaseUrl` (asset-service) usa quando a
 * propriedade não tem `settings.customDomain`. Gravar ESTE domínio numa plaqueta
 * de metal amarra o patrimônio ao Aura para sempre: se um dia a pousada trocar de
 * sistema, não há como repontar. Por isso a impressão é bloqueada aqui.
 * Duplicado de propósito: asset-service importa supabaseAdmin e não pode vir para
 * o bundle do cliente só por causa de uma string.
 */
const AURA_FALLBACK_HOST = "aaura.app.br";

const SIZES: Record<LabelSize, { label: string; cols: number; qr: number; hint: string }> = {
  large: { label: "Grande (2 colunas)", cols: 2, qr: 108, hint: "≈ 90 × 45 mm — equipamentos maiores" },
  small: { label: "Pequena (3 colunas)", cols: 3, qr: 78, hint: "≈ 60 × 35 mm — móveis e eletrônicos pequenos" },
};

export default function EtiquetasPage() {
  const { currentProperty: property } = useProperty();
  const [labels, setLabels] = useState<AssetLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [size, setSize] = useState<LabelSize>("large");
  const [printing, setPrinting] = useState(false);

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

  const cfg = SIZES[size];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/admin/patrimonio" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={15} /> Patrimônio
      </Link>

      <header className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Etiquetas de patrimônio</h1>
        <p className="text-sm text-muted-foreground">
          Cada etiqueta traz o QR da plaqueta, o nº de patrimônio e o nome do ativo.
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

      <div className="flex gap-3 flex-wrap items-center my-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="field-input w-full pl-9" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="field-input text-sm" value={size} onChange={(e) => setSize(e.target.value as LabelSize)}>
          {(Object.entries(SIZES) as [LabelSize, { label: string }][]).map(([v, s]) => (
            <option key={v} value={v}>{s.label}</option>
          ))}
        </select>
        <button
          onClick={() => setPrinting(true)}
          disabled={toPrint.length === 0 || onFallbackDomain}
          title={onFallbackDomain ? "Cadastre um domínio próprio da pousada antes de gerar plaquetas." : undefined}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Printer size={15} /> Imprimir {toPrint.length} etiqueta(s)
        </button>
      </div>
      <p className="text-xs text-muted-foreground -mt-2 mb-4">{cfg.hint}</p>

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
              <div
                key={l.id}
                style={{ breakInside: "avoid" }}
                className="flex items-center gap-3 border border-black/40 rounded-lg p-2.5"
              >
                <AssetQr url={l.url} size={cfg.qr} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest">Patrimônio</p>
                  <p className="font-mono text-base font-bold leading-tight">{l.assetTag || l.publicCode}</p>
                  <p className="text-[11px] leading-snug break-words">{l.name}</p>
                  <p className="font-mono text-[10px] tracking-widest opacity-70">{l.publicCode}</p>
                </div>
              </div>
            ))}
          </div>
        </PrintReport>
      )}
    </div>
  );
}
