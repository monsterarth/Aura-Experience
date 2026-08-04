// Aba Orçamento — a tela do dia a dia da recepção: parâmetros ACFP, ajustes
// comerciais, resultado por categoria com breakdown, disponibilidade real e
// cópia da mensagem de WhatsApp (simples ou detalhada).
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Check, Copy, Heart, Home, PartyPopper, PawPrint,
} from "lucide-react";
import { RateAvailability, RateQuoteCategory, RateQuoteInput } from "@/types/aura";
import type { RateBundle } from "@/services/rate-service";
import {
  addDays, buildCategoryBlock, buildEventNotices, computeQuote, dateToIso, formatBRL,
  formatDateBR, processTemplate, DEFAULT_MSG_TEMPLATE, DEFAULT_MSG_SINGLE_TEMPLATE,
} from "@/lib/rate-engine";

interface Props {
  propertyId: string;
  bundle: RateBundle;
  attendantName: string;
}

// Data LOCAL (não UTC): à noite no fuso do Brasil, toISOString já virou o dia seguinte.
const todayIso = () => dateToIso(new Date());

export default function QuoteTab({ propertyId, bundle, attendantName }: Props) {
  const { settings } = bundle;

  const [checkIn, setCheckIn] = useState(todayIso());
  const [checkOut, setCheckOut] = useState(addDays(todayIso(), 2));
  // Como string para o campo poder ficar vazio enquanto se digita.
  const [adultsRaw, setAdultsRaw] = useState("2");
  const [childrenRaw, setChildrenRaw] = useState("0");
  const [babiesRaw, setBabiesRaw] = useState("0");
  const [petsRaw, setPetsRaw] = useState("0");
  const adults = Math.max(1, parseInt(adultsRaw) || 1);
  const children = Math.max(0, parseInt(childrenRaw) || 0);
  const babies = Math.max(0, parseInt(babiesRaw) || 0);
  const pets = Math.max(0, parseInt(petsRaw) || 0);
  const [weddingId, setWeddingId] = useState("");
  const [fluctuationPct, setFluctuationPct] = useState(0);
  const [discountIds, setDiscountIds] = useState<string[]>([]);
  const [adhocValue, setAdhocValue] = useState("");
  const [adhocType, setAdhocType] = useState<"pct" | "brl">("pct");
  const [detailed, setDetailed] = useState(false);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  const [availability, setAvailability] = useState<Record<string, RateAvailability>>({});
  const [events, setEvents] = useState<{ title: string; date: string }[]>([]);

  const input: RateQuoteInput = useMemo(
    () => ({
      checkIn, checkOut, adults, children, babies, pets,
      fluctuationPct,
      discountIds,
      adhocValue: parseFloat(adhocValue) || 0,
      adhocType,
    }),
    [checkIn, checkOut, adults, children, babies, pets, fluctuationPct, discountIds, adhocValue, adhocType]
  );

  const quote = useMemo(
    () => computeQuote(input, { tables: bundle.tables, periods: bundle.periods, settings }),
    [input, bundle.tables, bundle.periods, settings]
  );

  // Disponibilidade real + eventos publicados no período.
  useEffect(() => {
    if (!checkIn || !checkOut || checkIn >= checkOut) { setAvailability({}); setEvents([]); return; }
    let cancelled = false;
    fetch(`/api/admin/tarifario/context?propertyId=${propertyId}&in=${checkIn}&out=${checkOut}`)
      .then((r) => (r.ok ? r.json() : { availability: {}, events: [] }))
      .then((data) => {
        if (cancelled) return;
        setAvailability(data.availability || {});
        setEvents(data.events || []);
      })
      .catch(() => { if (!cancelled) { setAvailability({}); setEvents([]); } });
    return () => { cancelled = true; };
  }, [propertyId, checkIn, checkOut]);

  const applyWedding = (id: string) => {
    setWeddingId(id);
    const w = bundle.weddings.find((x) => x.id === id);
    if (w) {
      setCheckIn(w.checkin.slice(0, 10));
      setCheckOut(w.checkout.slice(0, 10));
    }
  };

  const toggleDiscount = (id: string) =>
    setDiscountIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleSelected = (category: string) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  const msgCtx = { attendantName, input, isWedding: !!weddingId };

  const copyToClipboard = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMsg);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  };

  const copySingle = (cat: RateQuoteCategory) => {
    const block = buildCategoryBlock(
      cat,
      settings.categoryLinks?.[cat.category],
      settings.msgSingleTemplate || DEFAULT_MSG_SINGLE_TEMPLATE,
      detailed
    );
    let extras = "";
    if (babies > 0) extras += ` (+${babies} criança${babies > 1 ? "s" : ""} isenta${babies > 1 ? "s" : ""})`;
    if (pets > 0) extras += ` (+${pets} pet${pets > 1 ? "s" : ""})`;
    copyToClipboard(processTemplate(block, msgCtx) + extras, `${cat.category} copiada!`);
  };

  const copyFull = () => {
    const selected = quote.categories.filter((c) => !deselected.has(c.category));
    if (selected.length === 0) return toast.error("Selecione pelo menos uma categoria.");
    const resumo = selected
      .map((c) =>
        buildCategoryBlock(
          c,
          settings.categoryLinks?.[c.category],
          settings.msgSingleTemplate || DEFAULT_MSG_SINGLE_TEMPLATE,
          detailed
        )
      )
      .join("\n");
    const avisos = buildEventNotices(events, settings.eventTemplate);
    const msg = processTemplate(settings.msgTemplate || DEFAULT_MSG_TEMPLATE, msgCtx, resumo, avisos);
    copyToClipboard(msg, detailed ? "Cotação detalhada copiada!" : "Cotação copiada!");
  };

  return (
    <div className="space-y-5">
      {/* Parâmetros */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold text-foreground">👥 Composição e período</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Adultos</label>
              <input type="number" min={1} className="field-input" value={adultsRaw}
                onChange={(e) => setAdultsRaw(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Crianças (pagantes)</label>
              <input type="number" min={0} className="field-input" value={childrenRaw}
                onChange={(e) => setChildrenRaw(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Bebês / isentos</label>
              <input type="number" min={0} className="field-input" value={babiesRaw}
                onChange={(e) => setBabiesRaw(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Pets</label>
              <input type="number" min={0} className="field-input" value={petsRaw}
                onChange={(e) => setPetsRaw(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Check-in</label>
              <input type="date" className="field-input" value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Check-out</label>
              <input type="date" className="field-input" value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label flex items-center gap-1">
              <Heart size={12} className="text-pink-500" /> Vínculo com casamento
            </label>
            <select className="field-input" value={weddingId} onChange={(e) => applyWedding(e.target.value)}>
              <option value="">Não (turista)</option>
              {bundle.weddings.map((w) => (
                <option key={w.id} value={w.id}>
                  💍 {w.couple} · {formatDateBR(w.checkin.slice(0, 10))}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <h3 className="font-semibold text-foreground">📊 Ajustes comerciais</h3>
          <div>
            <label className="field-label">Flutuação de ocupação</label>
            <select className="field-input" value={fluctuationPct}
              onChange={(e) => setFluctuationPct(parseFloat(e.target.value) || 0)}>
              <option value={0}>Padrão (0%)</option>
              {settings.fluctuations.map((f) => (
                <option key={f.id} value={f.pct}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Descontos padrão</label>
            {settings.discounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum desconto cadastrado (aba Comercial).</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {settings.discounts.map((d) => (
                  <label key={d.id}
                    className="flex items-center gap-2 text-sm bg-secondary rounded-lg px-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={discountIds.includes(d.id)}
                      onChange={() => toggleDiscount(d.id)} />
                    <span>{d.name} <b className="text-emerald-600">-{d.pct}%</b></span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="field-label">Extra / negociação</label>
              <input type="number" min={0} className="field-input" placeholder="0"
                value={adhocValue} onChange={(e) => setAdhocValue(e.target.value)} />
            </div>
            <div className="w-24">
              <label className="field-label">Tipo</label>
              <select className="field-input" value={adhocType}
                onChange={(e) => setAdhocType(e.target.value as "pct" | "brl")}>
                <option value="pct">%</option>
                <option value="brl">R$</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Avisos */}
      {quote.nights <= 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
          Datas inválidas — o check-out precisa ser depois do check-in.
        </div>
      )}
      {quote.uncoveredDates.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Sem regra de tarifário para {quote.uncoveredDates.length === 1 ? "a noite" : "as noites"}:{" "}
            <b>{quote.uncoveredDates.map(formatDateBR).join(", ")}</b>. Cadastre na aba Calendário.
          </span>
        </div>
      )}
      {quote.nights > 0 && quote.nights < quote.minNightsRequired && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>O período consultado exige mínimo de <b>{quote.minNightsRequired} diárias</b> — a consulta tem {quote.nights}.</span>
        </div>
      )}
      {events.map((ev) => (
        <div key={`${ev.title}-${ev.date}`}
          className="rounded-xl border border-blue-200 bg-blue-50 text-blue-800 px-4 py-3 text-sm flex gap-2">
          <PartyPopper size={16} className="shrink-0 mt-0.5" />
          <span>Evento no período: <b>{ev.title}</b> ({formatDateBR(ev.date)}) — o aviso entra na mensagem.</span>
        </div>
      ))}

      {/* Resultados */}
      {quote.categories.length > 0 && (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {quote.categories.map((c) => {
              const avail = availability[c.category];
              const selected = !deselected.has(c.category);
              const showOldPrice = Math.abs(c.finalTotal - c.rawTotal) > 5;
              return (
                <div key={c.category}
                  className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/50">
                    <input type="checkbox" checked={selected} onChange={() => toggleSelected(c.category)}
                      className="w-4 h-4 cursor-pointer" />
                    <Home size={15} className="text-muted-foreground" />
                    <span className="font-semibold text-sm text-foreground flex-1">{c.category}</span>
                    {avail && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        avail.free > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}
                        title={avail.freeCabins.join(", ") || "Nenhuma cabana livre"}>
                        {avail.free > 0 ? `${avail.free}/${avail.total} livre${avail.free > 1 ? "s" : ""}` : "Ocupada"}
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-2.5 mb-3 space-y-0.5">
                      {Object.entries(c.periodNights).map(([name, n]) => (
                        <div key={name} className="flex justify-between gap-2">
                          <span>• {n} diária{n > 1 ? "s" : ""}</span>
                          <span className="truncate">{name}</span>
                        </div>
                      ))}
                      {c.breakdown.filter((b) => b.kind !== "base").map((b, i) => (
                        <div key={i} className={`flex justify-between gap-2 font-medium ${
                          b.value < 0 ? "text-emerald-600" : b.kind === "fee" ? "text-foreground" : "text-orange-600"
                        }`}>
                          <span>• {b.label}</span>
                          <span>{b.value < 0 ? "-" : "+"}R$ {formatBRL(Math.abs(b.value))}</span>
                        </div>
                      ))}
                      {c.daysWithoutPrice > 0 && (
                        <div className="text-amber-600 font-medium">
                          ⚠ {c.daysWithoutPrice} noite{c.daysWithoutPrice > 1 ? "s" : ""} sem preço para esse nº de pessoas
                        </div>
                      )}
                    </div>
                    <div className="mt-auto">
                      <div className="text-2xl font-extrabold text-foreground">
                        {showOldPrice && (
                          <span className="text-sm font-medium text-muted-foreground line-through mr-2">
                            R$ {formatBRL(c.rawTotal)}
                          </span>
                        )}
                        R$ {formatBRL(c.finalTotal)}
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        Total para {c.nights} noite{c.nights > 1 ? "s" : ""} · média R$ {formatBRL(c.avgNightly)}/noite
                        {pets > 0 && <PawPrint size={11} className="inline ml-1" />}
                      </div>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => copySingle(c)}>
                        <Copy size={13} className="mr-1.5" /> Copiar só esta
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-card border-2 border-emerald-500/40 rounded-2xl p-5 text-center space-y-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} />
              📝 Detalhar cálculos na mensagem
            </label>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => setDeselected(new Set())}>
                <Check size={15} className="mr-1.5" /> Selecionar tudo
              </Button>
              <Button className="px-8" onClick={copyFull}>
                <Copy size={15} className="mr-1.5" /> Copiar WhatsApp
              </Button>
            </div>
          </div>
        </>
      )}

      {quote.nights > 0 && quote.uncoveredDates.length === 0 && quote.categories.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-muted-foreground text-sm">
          Nenhuma categoria com preço para esses parâmetros — confira as tabelas de preço
          (nº de pessoas acima da capacidade some da lista, igual ao SIT).
        </div>
      )}
    </div>
  );
}
