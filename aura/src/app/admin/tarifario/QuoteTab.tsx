// Aba Orçamento — a tela do dia a dia da recepção: parâmetros ACFP, ajustes
// comerciais, resultado por categoria com breakdown, disponibilidade real e
// cópia da mensagem de WhatsApp (simples ou detalhada).
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Check, Copy, Heart, Home, Loader2, PartyPopper, PawPrint,
  Save, Search, X,
} from "lucide-react";
import { Guest, RateAvailability, RateQuoteCategory, RateQuoteInput } from "@/types/aura";
import { GuestService } from "@/services/guest-service";
import type { RateBundle } from "@/services/rate-service";
import {
  addDays, buildCategoryBlock, buildEventNotices, computeQuote, dateToIso, formatBRL,
  formatDateBR, processTemplate, DEFAULT_MSG_TEMPLATE, DEFAULT_MSG_SINGLE_TEMPLATE,
} from "@/lib/rate-engine";

interface Props {
  propertyId: string;
  bundle: RateBundle;
  attendantName: string;
  /** Notifica a aba Funil que um orçamento novo foi salvo. */
  onQuoteSaved?: () => void;
}

// Data LOCAL (não UTC): à noite no fuso do Brasil, toISOString já virou o dia seguinte.
const todayIso = () => dateToIso(new Date());

export default function QuoteTab({ propertyId, bundle, attendantName, onQuoteSaved }: Props) {
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

  // ── Cliente (lead) — todos opcionais; vinculável a um hóspede existente ────
  const [clientName, setClientName] = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [linkedGuest, setLinkedGuest] = useState<{ id: string; name: string } | null>(null);
  const [guestQuery, setGuestQuery] = useState("");
  const [guestResults, setGuestResults] = useState<Guest[]>([]);
  const [searchingGuest, setSearchingGuest] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [saved, setSaved] = useState<{ id: string; key: string } | null>(null);
  const guestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (guestDebounce.current) clearTimeout(guestDebounce.current);
    if (guestQuery.trim().length < 2) { setGuestResults([]); return; }
    guestDebounce.current = setTimeout(async () => {
      setSearchingGuest(true);
      const data = await GuestService.listGuests(propertyId, guestQuery.trim());
      setGuestResults(data.slice(0, 6));
      setSearchingGuest(false);
    }, 300);
  }, [guestQuery, propertyId]);

  const selectGuest = (g: Guest) => {
    setLinkedGuest({ id: g.id, name: g.fullName });
    setClientName(g.fullName || "");
    setClientDocument(g.document?.number || "");
    setClientPhone(g.phone || "");
    setClientEmail(g.email || "");
    setGuestQuery("");
    setGuestResults([]);
  };

  const hasClient = Boolean(
    linkedGuest || clientName.trim() || clientDocument.trim() || clientPhone.trim() || clientEmail.trim()
  );

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
    () => computeQuote(input, {
      tables: bundle.tables, periods: bundle.periods, settings, categories: bundle.categories,
    }),
    [input, bundle.tables, bundle.periods, settings, bundle.categories]
  );

  /** Link do site: da categoria (fonte atual) com fallback no config legado. */
  const linkOf = (q: RateQuoteCategory) =>
    bundle.categories.find((c) => c.id === q.categoryId)?.siteUrl ||
    settings.categoryLinks?.[q.category] ||
    undefined;

  // Identidade do orçamento atual: mudou parâmetro ou cliente = orçamento novo.
  const quoteKey = useMemo(
    () => JSON.stringify([input, clientName, clientDocument, clientPhone, clientEmail, linkedGuest?.id ?? null, weddingId]),
    [input, clientName, clientDocument, clientPhone, clientEmail, linkedGuest, weddingId]
  );
  const isSavedCurrent = saved?.key === quoteKey;

  const saveToFunnel = async (status: "open" | "sent"): Promise<string | null> => {
    if (quote.categories.length === 0) {
      toast.error("Calcule um orçamento válido antes de salvar.");
      return null;
    }
    if (!hasClient) {
      toast.error("Informe ao menos um dado do cliente para salvar no funil.");
      return null;
    }
    setSavingQuote(true);
    try {
      const res = await fetch("/api/admin/tarifario/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          quote: {
            clientName, clientDocument, clientPhone, clientEmail,
            guestId: linkedGuest?.id ?? null,
            weddingId: weddingId || null,
            checkIn, checkOut, adults, children, babies, pets,
            fluctuationPct,
            discountIds,
            adhocValue: parseFloat(adhocValue) || 0,
            adhocType,
            snapshot: quote.categories,
            status,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);
      setSaved({ id: data.id, key: quoteKey });
      onQuoteSaved?.();
      return data.id as string;
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao salvar o orçamento.");
      return null;
    } finally {
      setSavingQuote(false);
    }
  };

  const markSent = (id: string) => {
    fetch("/api/admin/tarifario/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, id, patch: { status: "sent" } }),
    })
      .then(() => onQuoteSaved?.())
      .catch(() => {});
  };

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
      linkOf(cat),
      settings.msgSingleTemplate || DEFAULT_MSG_SINGLE_TEMPLATE,
      detailed
    );
    let extras = "";
    if (babies > 0) extras += ` (+${babies} criança${babies > 1 ? "s" : ""} isenta${babies > 1 ? "s" : ""})`;
    if (pets > 0) extras += ` (+${pets} pet${pets > 1 ? "s" : ""})`;
    copyToClipboard(processTemplate(block, msgCtx) + extras, `${cat.category} copiada!`);
  };

  const copyFull = async () => {
    const selected = quote.categories.filter((c) => !deselected.has(c.categoryId));
    if (selected.length === 0) return toast.error("Selecione pelo menos uma categoria.");
    const resumo = selected
      .map((c) =>
        buildCategoryBlock(
          c,
          linkOf(c),
          settings.msgSingleTemplate || DEFAULT_MSG_SINGLE_TEMPLATE,
          detailed
        )
      )
      .join("\n");
    const avisos = buildEventNotices(events, settings.eventTemplate);
    const msg = processTemplate(settings.msgTemplate || DEFAULT_MSG_TEMPLATE, msgCtx, resumo, avisos);
    await copyToClipboard(msg, detailed ? "Cotação detalhada copiada!" : "Cotação copiada!");

    // CRM: cliente preenchido → registra o envio no funil.
    if (hasClient && quote.categories.length > 0) {
      if (isSavedCurrent && saved) {
        markSent(saved.id);
      } else {
        const id = await saveToFunnel("sent");
        if (id) toast.success("Orçamento salvo no funil como Enviado.");
      }
    }
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

      {/* Cliente / funil de vendas */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-foreground">
            🤝 Cliente{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (opcional — alimenta o funil de vendas)
            </span>
          </h3>
          {isSavedCurrent ? (
            <span className="text-xs font-bold text-emerald-600">Salvo no funil ✓</span>
          ) : (
            <Button size="sm" variant="secondary"
              disabled={savingQuote || !hasClient || quote.categories.length === 0}
              onClick={async () => {
                const id = await saveToFunnel("open");
                if (id) toast.success("Orçamento salvo no funil.");
              }}>
              {savingQuote
                ? <Loader2 size={13} className="mr-1 animate-spin" />
                : <Save size={13} className="mr-1" />}
              Salvar no funil
            </Button>
          )}
        </div>

        <div className="relative max-w-md">
          <label className="field-label">Buscar hóspede existente</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="field-input !pl-9" placeholder="Nome, CPF, telefone…"
              value={guestQuery} onChange={(e) => setGuestQuery(e.target.value)} />
            {searchingGuest && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {guestResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-background border border-border rounded-xl shadow-xl overflow-hidden">
              {guestResults.map((g) => (
                <button key={g.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors"
                  onClick={() => selectGuest(g)}>
                  <span className="font-semibold">{g.fullName}</span>
                  <span className="text-xs text-muted-foreground"> · {g.document?.type} {g.document?.number}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {linkedGuest && (
          <div className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
            <Check size={14} className="shrink-0" />
            <span>Vinculado ao hóspede <b>{linkedGuest.name}</b></span>
            <button className="ml-auto hover:text-red-600" title="Desvincular"
              onClick={() => setLinkedGuest(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="field-label">Nome do cliente</label>
            <input className="field-input" value={clientName}
              onChange={(e) => setClientName(e.target.value)} placeholder="Nome" />
          </div>
          <div>
            <label className="field-label">CPF / documento</label>
            <input className="field-input" value={clientDocument}
              onChange={(e) => setClientDocument(e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div>
            <label className="field-label">Telefone / WhatsApp</label>
            <input className="field-input" value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="5548999999999" />
          </div>
          <div>
            <label className="field-label">E-mail</label>
            <input className="field-input" type="email" value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Copiar o WhatsApp com cliente preenchido salva/atualiza o orçamento no funil como <b>Enviado</b>.
        </p>
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
              const avail = availability[c.categoryId];
              const selected = !deselected.has(c.categoryId);
              const showOldPrice = Math.abs(c.finalTotal - c.rawTotal) > 5;
              return (
                <div key={c.categoryId}
                  className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/50">
                    <input type="checkbox" checked={selected} onChange={() => toggleSelected(c.categoryId)}
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
