// Wizard "Nova cotação" — a cotação nasce NO funil, sem pular pro Tarifário:
// 1) dados do lead (nome + origem + um contato obrigatórios)
// 2) "é essa pessoa?" — cruza com a base (telefone/nome/CPF) + anti-duplicidade
// 3) a calculadora SIT embutida (computeQuote puro no cliente, mesmo motor do
//    Tarifário; o save recalcula no servidor) → salvar / copiar → "enviado?"
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Copy, Loader2, Phone, Save, X,
} from "lucide-react";
import { T } from "@/lib/admin-tokens";
import {
  computeQuote, processTemplate, buildCategoryBlock, buildEventNotices,
  DEFAULT_MSG_TEMPLATE, DEFAULT_MSG_SINGLE_TEMPLATE,
  addDays, dateToIso, formatBRL,
} from "@/lib/rate-engine";
import type { RateBundle } from "@/services/rate-service";
import {
  CrmChannel, Guest, RateAvailability, RateQuoteInput, RateQuoteRecord,
} from "@/types/aura";
import { S, fmtBR, pillS } from "./shared";

const todayIso = () => dateToIso(new Date());

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
  color: T.muted, marginBottom: 5, display: "block",
};

type MatchContext = {
  phoneMatches: Guest[];
  nameMatches: Guest[];
  quotes: RateQuoteRecord[];
};

export function NewQuoteWizard({
  propertyId, channels, attendantName, initialBundle, onBundleLoaded,
  onClose, onSaved, onOpenExisting,
}: {
  propertyId: string;
  channels: CrmChannel[];
  attendantName: string;
  /** Cache do RateBundle mantido pela página (evita refetch a cada abertura). */
  initialBundle: RateBundle | null;
  onBundleLoaded: (b: RateBundle) => void;
  onClose: () => void;
  /** Orçamento salvo — a página recarrega o pipeline. */
  onSaved: (id: string) => void;
  /** Anti-duplicidade: abrir o lead existente em vez de criar outro. */
  onOpenExisting: (quoteId: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Passo 1: lead ──────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [document, setDocument] = useState("");
  const [checkIn, setCheckIn] = useState(todayIso());
  const [checkOut, setCheckOut] = useState(addDays(todayIso(), 2));
  const [adultsRaw, setAdultsRaw] = useState("2");
  const [childrenRaw, setChildrenRaw] = useState("0");
  const [babiesRaw, setBabiesRaw] = useState("0");
  const [petsRaw, setPetsRaw] = useState("0");
  const [linkedGuest, setLinkedGuest] = useState<{ id: string; name: string } | null>(null);

  const adults = Math.max(1, parseInt(adultsRaw) || 1);
  const children = Math.max(0, parseInt(childrenRaw) || 0);
  const babies = Math.max(0, parseInt(babiesRaw) || 0);
  const pets = Math.max(0, parseInt(petsRaw) || 0);

  const step1Error = !name.trim() ? "Informe o nome do cliente."
    : !source ? "Informe a origem do lead."
    : !phone.trim() && !email.trim() ? "Informe telefone ou e-mail."
    : !checkIn || !checkOut || checkIn >= checkOut ? "Período inválido."
    : null;

  // ── Passo 2: match ─────────────────────────────────────────────────────────
  const [checking, setChecking] = useState(false);
  const [matches, setMatches] = useState<MatchContext | null>(null);

  const goNext = async () => {
    if (step1Error) { toast.error(step1Error); return; }
    setChecking(true);
    try {
      const qs = new URLSearchParams({ propertyId });
      if (phone.trim()) qs.set("phone", phone.trim());
      qs.set("q", document.trim() || name.trim());
      const res = await fetch(`/api/admin/comercial/client?${qs}`);
      const d = res.ok ? await res.json() : null;
      const ctx: MatchContext = {
        phoneMatches: d?.phoneMatches ?? [],
        nameMatches: d?.nameMatches ?? [],
        quotes: (d?.quotes ?? []).filter((q: RateQuoteRecord) =>
          ["open", "sent", "negotiating"].includes(q.status)),
      };
      setMatches(ctx);
      // Nada para confirmar → direto para a calculadora.
      const hasSomething = ctx.phoneMatches.length + ctx.nameMatches.length + ctx.quotes.length > 0;
      setStep(hasSomething ? 2 : 3);
    } catch {
      setMatches({ phoneMatches: [], nameMatches: [], quotes: [] });
      setStep(3);
    } finally {
      setChecking(false);
    }
  };

  const confirmGuest = (g: Guest) => {
    setLinkedGuest({ id: g.id, name: g.fullName });
    setName(g.fullName);
    if (!document.trim() && g.document?.number) setDocument(g.document.number);
    if (!email.trim() && g.email) setEmail(g.email);
    if (!phone.trim() && g.phone) setPhone(g.phone);
    setStep(3);
  };

  // ── Passo 3: calculadora ───────────────────────────────────────────────────
  const [bundle, setBundle] = useState<RateBundle | null>(initialBundle);
  const [fluctuationPct, setFluctuationPct] = useState(0);
  const [discountIds, setDiscountIds] = useState<string[]>([]);
  const [adhocValue, setAdhocValue] = useState("");
  const [adhocType, setAdhocType] = useState<"pct" | "brl">("pct");
  const [detailed, setDetailed] = useState(false);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<Record<string, RateAvailability>>({});
  const [events, setEvents] = useState<{ title: string; date: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [askSent, setAskSent] = useState(false);
  const savedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (bundle) return;
    fetch(`/api/admin/tarifario?propertyId=${propertyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (b) { setBundle(b); onBundleLoaded(b); } })
      .catch(() => toast.error("Erro ao carregar o tarifário."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Disponibilidade real + eventos do período (mesma rota do Tarifário).
  useEffect(() => {
    if (step !== 3 || !checkIn || !checkOut || checkIn >= checkOut) return;
    let cancelled = false;
    fetch(`/api/admin/tarifario/context?propertyId=${propertyId}&in=${checkIn}&out=${checkOut}`)
      .then((r) => (r.ok ? r.json() : { availability: {}, events: [] }))
      .then((d) => { if (!cancelled) { setAvailability(d.availability || {}); setEvents(d.events || []); } })
      .catch(() => { if (!cancelled) { setAvailability({}); setEvents([]); } });
    return () => { cancelled = true; };
  }, [step, propertyId, checkIn, checkOut]);

  const input: RateQuoteInput = useMemo(() => ({
    checkIn, checkOut, adults, children, babies, pets,
    fluctuationPct, discountIds,
    adhocValue: parseFloat(adhocValue) || 0, adhocType,
  }), [checkIn, checkOut, adults, children, babies, pets, fluctuationPct, discountIds, adhocValue, adhocType]);

  const quote = useMemo(() => {
    if (!bundle) return null;
    return computeQuote(input, {
      tables: bundle.tables, periods: bundle.periods,
      settings: bundle.settings, categories: bundle.categories,
    });
  }, [input, bundle]);

  // Mudou o cálculo/cliente → o save anterior não representa mais o orçamento.
  const quoteKey = JSON.stringify([input, name, document, phone, email, linkedGuest?.id ?? null, source]);
  const isSavedCurrent = savedId !== null && savedKeyRef.current === quoteKey;

  const save = async (status: "open" | "sent"): Promise<string | null> => {
    if (!quote || quote.categories.length === 0) {
      toast.error("Nenhuma categoria com preço para esses parâmetros.");
      return null;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tarifario/quotes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          quote: {
            id: savedId ?? undefined,   // re-salvar atualiza o MESMO lead
            clientName: name.trim(), clientDocument: document.trim(),
            clientPhone: phone.trim(), clientEmail: email.trim(),
            guestId: linkedGuest?.id ?? null,
            weddingId: null, source: source || null,
            checkIn, checkOut, adults, children, babies, pets,
            fluctuationPct, discountIds,
            adhocValue: parseFloat(adhocValue) || 0, adhocType,
            status,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error);
      setSavedId(data.id);
      savedKeyRef.current = quoteKey;
      return data.id as string;
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Erro ao salvar o orçamento.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveAndClose = async () => {
    const id = await save("open");
    if (!id) return;
    toast.success("Salvo no funil — follow-up e validade criados automaticamente.");
    onSaved(id);
    onClose();
  };

  const markSent = async (id: string) => {
    await fetch("/api/admin/tarifario/quotes", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, id, patch: { status: "sent" } }),
    }).catch(() => {});
  };

  const copyQuote = async () => {
    if (!bundle || !quote) return;
    const selected = quote.categories.filter((c) => !deselected.has(c.categoryId));
    if (selected.length === 0) { toast.error("Selecione pelo menos uma categoria."); return; }

    const settings = bundle.settings;
    const linkOf = (categoryId: string) =>
      bundle.categories.find((c) => c.id === categoryId)?.siteUrl || undefined;
    const msgCtx = { attendantName, input, isWedding: false };
    const resumo = selected
      .map((c) => buildCategoryBlock(c, linkOf(c.categoryId), settings.msgSingleTemplate || DEFAULT_MSG_SINGLE_TEMPLATE, detailed))
      .join("\n");
    const avisos = buildEventNotices(events, settings.eventTemplate);
    const msg = processTemplate(settings.msgTemplate || DEFAULT_MSG_TEMPLATE, msgCtx, resumo, avisos);

    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Cotação copiada!");
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
      return;
    }
    // Garante o lead salvo (como Aberto) antes de perguntar sobre o envio.
    if (!isSavedCurrent) {
      const id = await save("open");
      if (!id) return;
    }
    setAskSent(true);
  };

  const answerSent = async (sent: boolean) => {
    setAskSent(false);
    if (!savedId) return;
    if (sent) {
      await markSent(savedId);
      toast.success("Orçamento marcado como Enviado.");
      onSaved(savedId);
      onClose();
    } else {
      onSaved(savedId);   // já existe como Aberto — pipeline atualiza
    }
  };

  const toggleDiscount = (id: string) =>
    setDiscountIds((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  const toggleCategory = (id: string) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ── Render ─────────────────────────────────────────────────────────────────

  const numField = (label: string, value: string, set: (v: string) => void) => (
    <div>
      <label style={fieldLabel}>{label}</label>
      <input style={S.input} type="number" min={0} value={value}
        onChange={(e) => set(e.target.value)} />
    </div>
  );

  const stepDot = (n: 1 | 2 | 3, label: string) => (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
      color: step === n ? T.g1 : T.muted2,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 999, fontSize: 10, fontWeight: 900,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: step === n ? T.gradSoft : T.glass2,
        border: `1px solid ${step === n ? T.g1Border : T.border}`,
        color: step === n ? T.g1 : T.muted,
      }}>{n}</span>
      {label}
    </span>
  );

  const dupQuotes = matches?.quotes ?? [];
  const candidates = [...(matches?.phoneMatches ?? []), ...(matches?.nameMatches ?? [])];

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 24,
      }}>
      <div style={{
        width: "100%", maxWidth: 720, maxHeight: "90vh", background: T.card,
        border: `1px solid ${T.border2}`, borderRadius: 20,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 32px 80px rgba(0,0,0,.7)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: T.text }}>Nova cotação</div>
            <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
              {stepDot(1, "Cliente")}
              {stepDot(2, "Confirmação")}
              {stepDot(3, "Cotação")}
            </div>
          </div>
          <button onClick={onClose}
            style={{ padding: 8, borderRadius: 10, background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>

          {step === 1 && (<>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel}>Nome do cliente *</label>
                <input style={S.input} value={name} autoFocus
                  onChange={(e) => { setName(e.target.value); setLinkedGuest(null); }} />
              </div>
              <div>
                <label style={fieldLabel}>Origem do lead *</label>
                <select style={{ ...S.input, background: T.card }} value={source}
                  onChange={(e) => setSource(e.target.value)}>
                  <option value="">—</option>
                  {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel}>Telefone (WhatsApp)</label>
                <input style={S.input} inputMode="tel" placeholder="Só dígitos" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <label style={fieldLabel}>E-mail</label>
                <input style={S.input} type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>CPF (opcional)</label>
                <input style={S.input} value={document}
                  onChange={(e) => setDocument(e.target.value)} />
              </div>
            </div>
            <p style={{ fontSize: 10.5, color: T.muted2, margin: "-6px 0 0" }}>
              Pelo menos UM meio de contato (telefone ou e-mail) é obrigatório.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel}>Check-in *</label>
                <input style={S.input} type="date" value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>Check-out *</label>
                <input style={S.input} type="date" value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              {numField("Adultos", adultsRaw, setAdultsRaw)}
              {numField("Crianças (pagantes)", childrenRaw, setChildrenRaw)}
              {numField("Bebês (isentos)", babiesRaw, setBabiesRaw)}
              {numField("Pets", petsRaw, setPetsRaw)}
            </div>
          </>)}

          {step === 2 && matches && (<>
            {dupQuotes.length > 0 && (
              <div style={{
                background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8,
              }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: T.amber, margin: 0 }}>
                  Este cliente já tem orçamento aberto
                </p>
                {dupQuotes.slice(0, 3).map((q) => (
                  <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: T.text }}>
                    <span>{fmtBR(q.checkIn)} → {fmtBR(q.checkOut)} · {q.clientName || "sem nome"}</span>
                    <button onClick={() => onOpenExisting(q.id)}
                      style={{
                        marginLeft: "auto", padding: "5px 10px", borderRadius: 9, border: "none",
                        background: "rgba(245,158,11,0.18)", color: T.amber,
                        fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                      }}>
                      Abrir esse
                    </button>
                  </div>
                ))}
                <p style={{ fontSize: 10.5, color: T.muted, margin: 0 }}>
                  Criar outro duplica o lead no funil — prefira reabrir e recalcular o existente.
                </p>
              </div>
            )}

            {candidates.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: T.text, margin: 0 }}>
                  Encontramos na base — é essa pessoa?
                </p>
                {candidates.map((g) => (
                  <div key={g.id} style={{ ...S.row, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                    <BadgeCheck size={15} color={T.emerald} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{g.fullName}</div>
                      <div style={{ fontSize: 11, color: T.muted }}>
                        {g.phone || "sem telefone"}{g.email ? ` · ${g.email}` : ""}
                      </div>
                    </div>
                    <button onClick={() => confirmGuest(g)}
                      style={{ ...S.gradBtn, padding: "7px 12px", fontSize: 12 }}>
                      Sim, é essa
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setStep(3)}
              style={{ ...S.ghostBtn, justifyContent: "center", padding: "10px 16px" }}>
              {candidates.length > 0 ? "Não é nenhuma dessas — seguir sem vínculo" : "Seguir mesmo assim"}
            </button>
          </>)}

          {step === 3 && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: T.muted }}>
              <b style={{ color: T.text }}>{name}</b>
              {linkedGuest && <span style={pillS(T.emeraldBg, T.emerald, T.emeraldBorder)}>hóspede vinculado</span>}
              <span>{fmtBR(checkIn)} → {fmtBR(checkOut)}</span>
              <span>{adults + children} pagante{adults + children !== 1 ? "s" : ""}</span>
              {babies > 0 && <span>+{babies} isento{babies > 1 ? "s" : ""}</span>}
              {pets > 0 && <span>+{pets} pet{pets > 1 ? "s" : ""}</span>}
              <button onClick={() => setStep(1)}
                style={{
                  marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4,
                  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 11, fontWeight: 700, color: T.muted, textDecoration: "underline", textUnderlineOffset: 2,
                }}>
                <ArrowLeft size={11} /> editar dados
              </button>
            </div>

            {!bundle || !quote ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 10, color: T.muted }}>
                <Loader2 size={18} className="animate-spin" color={T.g1} /> Carregando tarifário…
              </div>
            ) : (<>
              {quote.uncoveredDates.length > 0 && (
                <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 11, padding: "9px 13px", fontSize: 12, color: T.red }}>
                  Sem regra de tarifário para {quote.uncoveredDates.length} data(s) — cadastre no Tarifário → Calendário.
                </div>
              )}
              {quote.nights > 0 && quote.nights < quote.minNightsRequired && (
                <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 11, padding: "9px 13px", fontSize: 12, color: T.amber }}>
                  Período exige mínimo de {quote.minNightsRequired} diárias (cotação tem {quote.nights}).
                </div>
              )}
              {events.map((ev, i) => (
                <div key={i} style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 11, padding: "9px 13px", fontSize: 12, color: T.blue }}>
                  Evento no período: <b>{ev.title}</b> ({fmtBR(ev.date)}) — o aviso entra na mensagem.
                </div>
              ))}

              {/* Ajustes (a calculadora SIT) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={fieldLabel}>Flutuação de ocupação</label>
                  <select style={{ ...S.input, background: T.card }} value={fluctuationPct}
                    onChange={(e) => setFluctuationPct(Number(e.target.value))}>
                    <option value={0}>Padrão (0%)</option>
                    {bundle.settings.fluctuations.map((f) => (
                      <option key={f.id} value={f.pct}>{f.name} ({f.pct > 0 ? "+" : ""}{f.pct}%)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>Extra / cupom</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input style={{ ...S.input, flex: 1 }} inputMode="decimal" placeholder="0"
                      value={adhocValue} onChange={(e) => setAdhocValue(e.target.value)} />
                    <select style={{ ...S.input, width: 74, background: T.card }} value={adhocType}
                      onChange={(e) => setAdhocType(e.target.value === "brl" ? "brl" : "pct")}>
                      <option value="pct">%</option>
                      <option value="brl">R$</option>
                    </select>
                  </div>
                </div>
              </div>
              {bundle.settings.discounts.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {bundle.settings.discounts.map((d) => {
                    const on = discountIds.includes(d.id);
                    return (
                      <button key={d.id} onClick={() => toggleDiscount(d.id)}
                        style={{
                          padding: "6px 11px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
                          fontSize: 11.5, fontWeight: 700,
                          background: on ? T.gradSoft : T.glass,
                          border: `1px solid ${on ? T.g1Border : T.border}`,
                          color: on ? T.g1 : T.muted,
                        }}>
                        {d.name} (−{d.pct}%)
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Categorias */}
              {quote.categories.length === 0 ? (
                <p style={{ fontSize: 13, color: T.muted, textAlign: "center", padding: "24px 0", margin: 0 }}>
                  Nenhuma categoria com preço para esses parâmetros.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {quote.categories.map((c) => {
                    const off = deselected.has(c.categoryId);
                    const avail = availability[c.categoryId];
                    const discounted = Math.abs(c.finalTotal - c.rawTotal) > 5;
                    return (
                      <div key={c.categoryId}
                        onClick={() => toggleCategory(c.categoryId)}
                        style={{
                          ...S.row, display: "flex", alignItems: "center", gap: 10,
                          padding: "9px 12px", cursor: "pointer", opacity: off ? 0.45 : 1,
                          border: `1px solid ${off ? T.border : T.g1Border}`,
                        }}>
                        <input type="checkbox" readOnly checked={!off} style={{ accentColor: T.g1 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{c.category}</div>
                          <div style={{ fontSize: 10.5, color: T.muted }}>média R$ {formatBRL(c.avgNightly)}/noite</div>
                        </div>
                        {avail && (
                          <span title={avail.freeCabins.join(", ")}
                            style={pillS(
                              avail.free > 0 ? T.emeraldBg : "rgba(248,113,113,0.12)",
                              avail.free > 0 ? T.emerald : T.red,
                              avail.free > 0 ? T.emeraldBorder : "rgba(248,113,113,0.3)"
                            )}>
                            {avail.free > 0 ? `${avail.free}/${avail.total} livre${avail.free > 1 ? "s" : ""}` : "Ocupada"}
                          </span>
                        )}
                        {discounted && (
                          <span style={{ fontSize: 11, color: T.muted2, textDecoration: "line-through" }}>
                            R$ {formatBRL(c.rawTotal)}
                          </span>
                        )}
                        <span style={{ fontSize: 13, fontWeight: 900, color: T.text }}>R$ {formatBRL(c.finalTotal)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: T.muted, cursor: "pointer" }}>
                <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)}
                  style={{ accentColor: T.g1 }} />
                Detalhar cálculos na mensagem
              </label>
            </>)}
          </>)}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
          {step === 1 && (<>
            <button onClick={onClose} style={S.ghostBtn}>Cancelar</button>
            <button onClick={goNext} disabled={checking}
              style={{ ...S.gradBtn, marginLeft: "auto", opacity: checking ? 0.7 : 1 }}>
              {checking ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              Próximo
            </button>
          </>)}
          {step === 2 && (
            <button onClick={() => setStep(1)} style={S.ghostBtn}>
              <ArrowLeft size={13} /> Voltar
            </button>
          )}
          {step === 3 && !askSent && (<>
            {phone.trim() && (
              <a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                style={{
                  ...S.ghostBtn, textDecoration: "none",
                  background: T.emeraldBg, border: `1px solid ${T.emeraldBorder}`, color: T.emerald,
                }}>
                <Phone size={13} /> WhatsApp
              </a>
            )}
            <button onClick={saveAndClose} disabled={saving || !quote || quote.categories.length === 0}
              style={{ ...S.ghostBtn, marginLeft: "auto", opacity: saving ? 0.6 : 1 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Salvar no funil
            </button>
            <button onClick={copyQuote} disabled={saving || !quote || quote.categories.length === 0}
              style={{ ...S.gradBtn, opacity: saving ? 0.7 : 1 }}>
              <Copy size={14} /> Copiar orçamento
            </button>
          </>)}
          {step === 3 && askSent && (<>
            <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Orçamento enviado ao cliente?</span>
            <button onClick={() => answerSent(false)} style={{ ...S.ghostBtn, marginLeft: "auto" }}>
              Ainda não
            </button>
            <button onClick={() => answerSent(true)} style={S.gradBtn}>
              Sim, enviado — avançar no funil
            </button>
          </>)}
        </div>
      </div>
    </div>
  );
}
