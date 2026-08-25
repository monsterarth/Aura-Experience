// src/app/admin/estoque/compras/_components/ImportXmlDialog.tsx
// Lançar a compra pelo XML da NF-e. Três telas dentro do mesmo modal:
//
//   upload  → arrasta o .xml (ou o .zip do contador)
//   fila    → só quando vem mais de uma nota no pacote
//   revisão → o DE-PARA: cada linha da nota ao lado do produto daqui
//
// Nada entra no estoque por aqui: a nota nasce em RASCUNHO e continua sendo o
// botão "Receber" da tela de compras que mexe em saldo, custo médio e validade.
"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  InvoiceImportCommitLine, InvoiceImportPreview, InvoiceLineTarget,
  StockCategory, StockLocation, StockProduct, StockUnit,
} from "@/types/aura";
import { StockClient } from "@/lib/stock-client";
import { Dialog, Button, Pill } from "@/components/aura";
import StockLocationSelect from "@/components/admin/StockLocationSelect";
import { cn } from "@/lib/utils";
import {
  UploadCloud, FileCode2, Loader2, AlertTriangle, CheckCircle2, ArrowLeft,
  Package, Sparkles, Ban, Armchair, Link2, Barcode, Lightbulb,
} from "lucide-react";

const UNITS: StockUnit[] = ["un", "kg", "g", "L", "ml", "cx", "pct", "par", "rolo"];
const brl = (n: number) => `R$ ${n.toFixed(2)}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface LineState {
  target: InvoiceLineTarget;
  productId: string;
  factor: string;
  remember: boolean;
  newName: string;
  newUnit: StockUnit;
}

interface Props {
  propertyId: string;
  products: StockProduct[];
  locations: StockLocation[];
  categories: StockCategory[];
  onClose: () => void;
  /** Chamado após lançar — a página recarrega a lista e os produtos. */
  onImported: () => void;
}

/** Palpite de unidade a partir do que veio no XML (uCom). */
function guessUnit(xmlUnit: string): StockUnit {
  const u = xmlUnit.toLowerCase().replace(/[^a-z]/g, "");
  const map: Record<string, StockUnit> = {
    un: "un", und: "un", unid: "un", pc: "un", peca: "un", fr: "un", frasco: "un",
    kg: "kg", g: "g", l: "L", lt: "L", litro: "L", ml: "ml",
    cx: "cx", caixa: "cx", pct: "pct", pacote: "pct", fd: "pct", fardo: "pct",
    par: "par", rl: "rolo", rolo: "rolo",
  };
  return map[u] ?? "un";
}

export default function ImportXmlDialog({ propertyId, products, locations, categories, onClose, onImported }: Props) {
  const [reading, setReading] = useState(false);
  const [queue, setQueue] = useState<InvoiceImportPreview[]>([]);
  const [failures, setFailures] = useState<{ fileName: string; error: string }[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<InvoiceImportPreview | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Estado da nota aberta
  const [lines, setLines] = useState<LineState[]>([]);
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [includeTaxes, setIncludeTaxes] = useState(false);
  const [createSupplier, setCreateSupplier] = useState(true);
  const [freightOverride, setFreightOverride] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const openPreview = useCallback((p: InvoiceImportPreview) => {
    setActive(p);
    setFreightOverride(null);
    setIncludeTaxes(false);
    setCreateSupplier(true);
    setLines(p.lines.map((l) => ({
      target: l.target,
      productId: l.productId ?? "",
      factor: String(l.factor ?? 1),
      remember: true,
      newName: l.description,
      newUnit: guessUnit(l.unit),
    })));
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setReading(true);
    try {
      const r = await StockClient.readInvoiceFiles(propertyId, Array.from(files));
      setFailures(r.failures);
      const previews = r.previews.map((p) => p.preview);
      setQueue(previews);
      if (r.truncated > 0) toast.warning(`${r.truncated} nota(s) ficaram de fora — o lote lê ${previews.length} por vez.`);
      if (previews.length === 1) openPreview(previews[0]);
      else if (previews.length === 0) toast.error("Nenhuma nota válida no arquivo.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const setLine = (idx: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  // ── Contas da nota aberta ───────────────────────────────────────────────────
  const calc = useMemo(() => {
    if (!active) return null;
    const cost = (i: number) => {
      const l = active.lines[i];
      const base = l.total > 0 ? l.total : l.unitValue * l.quantity;
      return round2(base + (includeTaxes ? l.ipi + l.icmsSt : 0));
    };
    // Linha que sai da compra (patrimônio / ignorada) leva o frete e o desconto
    // dela junto — senão o desconto de uma TV sobraria pesando no refrigerante.
    const landed = (i: number) => round2(cost(i) + active.lines[i].freight - active.lines[i].discount);
    let items = 0, assets = 0, ignored = 0, pending = 0, outFreight = 0, outDiscount = 0;
    active.lines.forEach((l, i) => {
      const st = lines[i];
      if (!st) return;
      if (st.target === "ignore" || st.target === "asset") {
        outFreight += l.freight;
        outDiscount += l.discount;
        if (st.target === "ignore") ignored += landed(i); else assets += landed(i);
        return;
      }
      if (st.target === "product" && !st.productId) pending++;
      items += cost(i);
    });
    const freight = freightOverride ?? round2(Math.max(0, active.totals.freight - outFreight));
    const discount = round2(Math.max(0, active.totals.discount - outDiscount));
    const total = round2(items + freight - discount);
    // O que o AURA lança + o que saiu para patrimônio + o que foi ignorado, contra o vNF.
    const difference = round2(total + assets + ignored - active.totals.declared);
    return { items: round2(items), assets: round2(assets), ignored: round2(ignored), freight, discount, total, difference, pending, cost, landed };
  }, [active, lines, includeTaxes, freightOverride]);

  const commit = async () => {
    if (!active || !calc) return;
    if (active.duplicate) { toast.error("Esta nota já foi lançada."); return; }
    if (calc.pending > 0) { toast.error(`${calc.pending} linha(s) sem produto. Vincule, crie ou marque como ignorar.`); return; }

    const payloadLines: InvoiceImportCommitLine[] = active.lines.map((l, i) => {
      const st = lines[i];
      return {
        n: l.n,
        target: st.target,
        productId: st.target === "product" ? st.productId : null,
        factor: Number(st.factor) > 0 ? Number(st.factor) : 1,
        remember: st.remember,
        ...(st.target === "new_product" && {
          newProduct: { name: st.newName.trim() || l.description, unit: st.newUnit, categoryId: categoryId || null },
        }),
        ...(st.target === "asset" && {
          asset: { name: st.newName.trim() || l.description, categoryId: categoryId || null, locationId: locationId || null },
        }),
      };
    });

    setSaving(true);
    try {
      const r = await StockClient.importInvoice({
        propertyId, xml: active.xml, fileName: active.fileName,
        supplierId: active.supplier.matchedId,
        createSupplier: !active.supplier.matchedId && createSupplier,
        locationId: locationId || null,
        includeTaxesInCost: includeTaxes,
        // Só manda o frete quando a pessoa mexeu nele. Sem isso o servidor faz a
        // própria conta (frete da nota menos o das linhas que saíram).
        ...(freightOverride !== null && { freightValue: freightOverride }),
        lines: payloadLines,
      });
      toast.success(
        `NF ${active.invoice.number} lançada em rascunho — ${r.mappedLines} item(ns)` +
        `${r.createdProducts ? `, ${r.createdProducts} produto(s) novo(s)` : ""}` +
        `${r.createdAssets ? `, ${r.createdAssets} ativo(s)` : ""}.`,
      );
      const key = active.invoice.key ?? active.fileName ?? active.invoice.number;
      setDone((d) => new Set(d).add(key));
      onImported();
      const rest = queue.filter((q) => !done.has(q.invoice.key ?? q.fileName ?? q.invoice.number) && q !== active);
      if (rest.length > 0) setActive(null);   // volta para a fila
      else onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const keyOf = (p: InvoiceImportPreview) => p.invoice.key ?? p.fileName ?? p.invoice.number;

  // ── Tela 1: upload ──────────────────────────────────────────────────────────
  if (!active) {
    return (
      <Dialog open onClose={onClose} presentation="auto" size="lg" title="Importar nota pelo XML"
        subtitle="O XML da NF-e traz fornecedor, itens, quantidades e valores prontos.">
        <div className="space-y-4">
          <input ref={inputRef} type="file" multiple accept=".xml,.zip,text/xml,application/xml,application/zip"
            className="hidden" onChange={(e) => handleFiles(e.target.files)} />

          {queue.length === 0 ? (
            <button type="button" onClick={() => inputRef.current?.click()} disabled={reading}
              className="w-full flex flex-col items-center gap-2 px-4 py-10 rounded-2xl border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
              {reading ? <Loader2 size={28} className="animate-spin" /> : <UploadCloud size={28} />}
              <span className="text-sm font-semibold">{reading ? "Lendo a nota…" : "Escolher o XML da nota"}</span>
              <span className="text-xs">um .xml, vários de uma vez, ou o .zip que o contador manda</span>
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{queue.length} nota(s) no arquivo. Abra uma para conferir antes de lançar.</p>
                <Button variant="ghost" onClick={() => inputRef.current?.click()}>Trocar arquivo</Button>
              </div>
              <div className="space-y-2">
                {queue.map((p) => {
                  const isDone = done.has(keyOf(p));
                  return (
                    <button key={keyOf(p)} type="button" onClick={() => !isDone && openPreview(p)} disabled={isDone}
                      className={cn("w-full text-left px-3 py-2.5 rounded-xl border border-border flex items-center gap-3 transition-colors",
                        isDone ? "opacity-50" : "hover:bg-secondary/40")}>
                      <FileCode2 size={16} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          NF {p.invoice.number} · {p.supplier.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.invoice.issuedAt ?? "sem data"} · {p.lines.length} item(ns) · {brl(p.totals.declared)}
                        </div>
                      </div>
                      {isDone ? <Pill tone="emerald" icon={CheckCircle2} label="Lançada" />
                        : p.duplicate ? <Pill tone="amber" icon={AlertTriangle} label="Já lançada" />
                        : <Pill tone="neutral" label="Conferir" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {failures.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-1">
              {failures.map((f) => (
                <p key={f.fileName} className="text-xs text-amber-600 dark:text-amber-400">
                  <b>{f.fileName}</b> — {f.error}
                </p>
              ))}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            A nota entra como <b>rascunho</b>: nada mexe em saldo, custo médio ou validade até você clicar em
            <b> Receber</b> na tela de compras. A chave de acesso impede lançar a mesma nota duas vezes.
          </p>
        </div>
      </Dialog>
    );
  }

  // ── Tela 2: revisão (o de-para) ─────────────────────────────────────────────
  const p = active;
  const sup = p.supplier;

  return (
    <Dialog open onClose={onClose} presentation="auto" size="xl"
      title={`NF ${p.invoice.number}${p.invoice.series ? `-${p.invoice.series}` : ""} · ${sup.name}`}
      subtitle={[p.invoice.issuedAt, p.invoice.operation, p.invoice.model === "65" ? "NFC-e" : "NF-e"].filter(Boolean).join(" · ")}
      headerActions={queue.length > 1 ? (
        <Button variant="ghost" icon={ArrowLeft} onClick={() => setActive(null)}>Fila</Button>
      ) : undefined}
      footerRow
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} loadingText="Lançando…" onClick={commit}
            disabled={!!p.duplicate || (calc?.pending ?? 0) > 0}>
            Lançar como rascunho
          </Button>
        </>
      )}>
      <div className="space-y-4">
        {p.duplicate && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Esta nota já está lançada {p.duplicate.invoiceNumber ? <>como <b>NF {p.duplicate.invoiceNumber}</b></> : null} (
              {p.duplicate.status === "received" ? "recebida" : "em aberto"}). A chave de acesso é única — não dá para lançar de novo.
            </p>
          </div>
        )}

        {/* Fornecedor + destino */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Fornecedor</label>
            {sup.matchedId ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/40 border border-border">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span className="text-sm text-foreground truncate">{sup.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">CNPJ confere</span>
              </div>
            ) : (
              <label className="flex items-start gap-2 px-3 py-2 rounded-xl border border-dashed border-border cursor-pointer">
                <input type="checkbox" checked={createSupplier} onChange={(e) => setCreateSupplier(e.target.checked)} className="w-4 h-4 mt-0.5 accent-current" />
                <span className="text-xs text-foreground">
                  Cadastrar <b>{sup.suggestion.name}</b>
                  <span className="block text-muted-foreground">CNPJ {sup.cnpj || "—"}{sup.suggestion.address ? ` · ${sup.suggestion.address}` : ""}</span>
                </span>
              </label>
            )}
          </div>
          <div>
            <label className="field-label">Local de recebimento</label>
            <StockLocationSelect locations={locations} value={locationId} placeholder="Definir depois"
              onChange={(id) => setLocationId(id)} />
          </div>
        </div>

        {/* Opções da nota */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={includeTaxes} onChange={(e) => setIncludeTaxes(e.target.checked)} className="w-4 h-4 accent-current" />
            <span className="text-xs text-foreground">
              Somar IPI e ICMS-ST ao custo
              <span className="text-muted-foreground"> ({brl(p.totals.ipi + p.totals.icmsSt)})</span>
            </span>
          </label>
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Categoria dos itens novos:</span>
              <select className="field-input py-1 text-xs" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Linhas da nota */}
        <div className="space-y-2">
          <label className="field-label">Itens da nota ({p.lines.length})</label>
          {p.lines.map((l, i) => {
            const st = lines[i];
            if (!st) return null;
            const factor = Number(st.factor) > 0 ? Number(st.factor) : 1;
            const qty = l.quantity * factor;
            // Linha que sai da compra mostra o custo cheio (com o frete/desconto dela).
            const cost = !calc ? l.total : st.target === "asset" || st.target === "ignore" ? calc.landed(i) : calc.cost(i);
            const unitCost = qty > 0 ? cost / qty : 0;
            const missing = st.target === "product" && !st.productId;

            return (
              <div key={l.n} className={cn("rounded-xl border px-3 py-2.5 space-y-2",
                missing ? "border-amber-500/50 bg-amber-500/5" : "border-border")}>
                {/* O que o fornecedor escreveu */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{l.description}</div>
                    <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2">
                      <span>cód. {l.code || "—"}</span>
                      {l.ean && <span className="flex items-center gap-1"><Barcode size={10} />{l.ean}</span>}
                      <span>{l.quantity} {l.unit} × {brl(l.unitValue)}</span>
                      <span className="text-foreground">= {brl(l.total)}</span>
                      {(l.ipi > 0 || l.icmsSt > 0) && <span>+ imp. {brl(l.ipi + l.icmsSt)}</span>}
                    </div>
                  </div>
                  {st.target === "product" && !missing && (
                    <Pill size="sm"
                      tone={l.matchedBy === "map" ? "emerald" : l.matchedBy === "barcode" ? "blue" : "neutral"}
                      icon={l.matchedBy === "map" ? Link2 : l.matchedBy === "barcode" ? Barcode : Package}
                      label={l.matchedBy === "map" ? "lembrado" : l.matchedBy === "barcode" ? "código de barras" : "escolhido"} />
                  )}
                </div>

                {/* O que fazer com a linha */}
                <div className="flex flex-wrap gap-1">
                  {([
                    { k: "product", label: "Vincular", icon: Package },
                    { k: "new_product", label: "Criar produto", icon: Sparkles },
                    { k: "asset", label: "Patrimônio", icon: Armchair },
                    { k: "ignore", label: "Ignorar", icon: Ban },
                  ] as const).map((opt) => (
                    <button key={opt.k} type="button" onClick={() => setLine(i, { target: opt.k })}
                      className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors",
                        st.target === opt.k ? "bg-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground hover:text-foreground")}>
                      <opt.icon size={11} /> {opt.label}
                    </button>
                  ))}
                </div>

                {st.target === "product" && (
                  <select className={cn("field-input w-full", missing && "border-amber-500/60")}
                    value={st.productId} onChange={(e) => setLine(i, { productId: e.target.value })}>
                    <option value="">Escolha o produto…</option>
                    {l.candidates.length > 0 && (
                      <optgroup label="Parecidos com esta descrição">
                        {l.candidates.map((c) => <option key={c.productId} value={c.productId}>{c.name} ({c.unit})</option>)}
                      </optgroup>
                    )}
                    <optgroup label="Todos os produtos">
                      {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.name} ({pr.unit})</option>)}
                    </optgroup>
                  </select>
                )}

                {(st.target === "new_product" || st.target === "asset") && (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-2">
                    <input className="field-input w-full" value={st.newName} placeholder="Nome aqui dentro"
                      onChange={(e) => setLine(i, { newName: e.target.value })} />
                    {st.target === "new_product" && (
                      <select className="field-input w-full" value={st.newUnit} onChange={(e) => setLine(i, { newUnit: e.target.value as StockUnit })}>
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {/* Fator de embalagem + o que vai entrar de fato */}
                {st.target !== "ignore" && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">1 {l.unit} =</span>
                    <input type="number" min="0" step="any" className="field-input w-16 py-1 text-xs" value={st.factor}
                      onChange={(e) => setLine(i, { factor: e.target.value })} />
                    <span className="text-muted-foreground">
                      {st.target === "asset" ? "unidade(s)" : `${products.find((x) => x.id === st.productId)?.unit ?? "un"} aqui`}
                    </span>
                    <span className="ml-auto tabular-nums text-foreground">
                      entra <b>{qty.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</b> a {brl(unitCost)}
                    </span>
                  </div>
                )}

                {st.target !== "ignore" && l.suggestedFactor && Number(st.factor) !== l.suggestedFactor && (
                  <button type="button" onClick={() => setLine(i, { factor: String(l.suggestedFactor) })}
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                    <Lightbulb size={11} /> a própria nota diz que 1 {l.unit} = {l.suggestedFactor} — usar
                  </button>
                )}

                {l.code && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={st.remember} onChange={(e) => setLine(i, { remember: e.target.checked })} className="w-3.5 h-3.5 accent-current" />
                    <span className="text-[10px] text-muted-foreground">Lembrar para as próximas notas deste fornecedor</span>
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {/* Fechamento contra o total da nota */}
        {calc && (
          <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 space-y-1 text-xs">
            <Row label="Itens para o estoque" value={brl(calc.items)} />
            {calc.assets > 0 && <Row label="Linhas em patrimônio" value={brl(calc.assets)} muted />}
            {calc.ignored > 0 && <Row label="Linhas ignoradas" value={brl(calc.ignored)} muted />}
            <Row label="Taxa de entrega / frete" value={brl(calc.freight)} muted />
            {calc.discount > 0 && <Row label="Desconto da nota" value={`− ${brl(calc.discount)}`} muted />}
            <div className="h-px bg-border my-1" />
            <Row label="Total da compra no AURA" value={brl(calc.total)} strong />
            <Row label="Total da nota (vNF)" value={brl(p.totals.declared)} muted />
            {Math.abs(calc.difference) >= 0.01 && (
              <div className="pt-1.5 space-y-1.5">
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>
                    Faltam <b>{brl(Math.abs(calc.difference))}</b> para fechar com a nota.
                    {p.totals.ipi + p.totals.icmsSt > 0 && !includeTaxes && " Costuma ser IPI/ICMS-ST — marque a opção acima para somá-los ao custo."}
                    {p.totals.other > 0 && ` A nota também traz ${brl(p.totals.other)} de outras despesas.`}
                  </span>
                </p>
                {calc.difference < 0 && (
                  <button type="button" onClick={() => setFreightOverride(round2(calc.freight - calc.difference))}
                    className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline">
                    Jogar a diferença na taxa de entrega
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      <span className={cn("tabular-nums", strong ? "font-bold text-foreground" : muted ? "text-muted-foreground" : "text-foreground")}>{value}</span>
    </div>
  );
}
