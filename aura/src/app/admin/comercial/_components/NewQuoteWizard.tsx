// Wizard "Nova cotação" — a cotação nasce NO funil, sem pular pro Tarifário:
// 1) dados do lead (nome + origem + um contato) e a COMPOSIÇÃO do pedido —
//    quantas acomodações e o pax de cada uma (2 cabanas de casal, 1 casal +
//    1 família…). Tudo isso é UMA negociação, UM card no funil.
// 2) "é essa pessoa?" — cruza com a base (telefone/nome/CPF) + anti-duplicidade
// 3) a calculadora SIT embutida, POR acomodação (computeQuote puro no cliente,
//    mesmo motor do Tarifário; o save recalcula no servidor) → salvar /
//    copiar → "enviado?"
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Copy, Loader2, Phone, Plus, Save,
  Trash2, X,
} from "lucide-react";
import { T } from "@/lib/admin-tokens";
import {
  computeQuote, processTemplate, buildCategoryBlock, buildEventNotices,
  DEFAULT_MSG_TEMPLATE, DEFAULT_MSG_SINGLE_TEMPLATE,
  addDays, dateToIso, formatBRL,
} from "@/lib/rate-engine";
import type { RateBundle } from "@/services/rate-service";
import {
  CrmChannel, Guest, RateAvailability, RateQuoteCategory, RateQuoteInput,
  RateQuoteRecord, RateQuoteResult, RateQuoteRoom,
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

/** Acomodação em edição — pax como string para o campo poder ficar vazio.
 *  checkIn/checkOut vazios = herda o período do orçamento. */
type DraftRoom = {
  id: string;
  label: string;
  checkIn: string; checkOut: string;
  adults: string; children: string; babies: string; pets: string;
  selectedCategory: string | null;
};

let draftSeq = 0;
const newDraftRoom = (over?: Partial<DraftRoom>): DraftRoom => ({
  id: `r${++draftSeq}`, label: "",
  checkIn: "", checkOut: "",
  adults: "2", children: "0", babies: "0", pets: "0",
  selectedCategory: null,
  ...over,
});

const roomLabel = (r: DraftRoom, i: number) => r.label.trim() || `Acomodação ${i + 1}`;
const paxOf = (r: DraftRoom) => ({
  adults: Math.max(1, parseInt(r.adults) || 1),
  children: Math.max(0, parseInt(r.children) || 0),
  babies: Math.max(0, parseInt(r.babies) || 0),
  pets: Math.max(0, parseInt(r.pets) || 0),
});
const paxLabel = (r: DraftRoom) => {
  const p = paxOf(r);
  const parts = [`${p.adults + p.children} pagante${p.adults + p.children !== 1 ? "s" : ""}`];
  if (p.babies > 0) parts.push(`${p.babies} isento${p.babies > 1 ? "s" : ""}`);
  if (p.pets > 0) parts.push(`${p.pets} pet${p.pets > 1 ? "s" : ""}`);
  return parts.join(" · ");
};

/** Semente do wizard: reabrir para EDITAR ou clonar o cliente numa cotação nova. */
export type QuoteSeed = {
  /** Presente = edita o MESMO orçamento; ausente = cria um lead novo. */
  quoteId?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientDocument?: string | null;
  guestId?: string | null;
  source?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  /** Acomodações do orçamento existente (com a escolha de cada uma). */
  rooms?: RateQuoteRoom[] | null;
  adults?: number | null;
  children?: number | null;
  babies?: number | null;
  pets?: number | null;
  fluctuationPct?: number | null;
  discountIds?: string[] | null;
  adhocValue?: number | null;
  adhocType?: "pct" | "brl" | null;
};

function seedRooms(seed?: QuoteSeed | null): DraftRoom[] {
  if (seed?.rooms && seed.rooms.length > 0) {
    // Datas iguais às do orçamento voltam vazias (= "herda"), para o campo
    // por acomodação só aparecer preenchido quando REALMENTE difere.
    return seed.rooms.map((r) => newDraftRoom({
      id: r.id, label: r.label ?? "",
      checkIn: r.checkIn && r.checkIn !== seed.checkIn ? r.checkIn : "",
      checkOut: r.checkOut && r.checkOut !== seed.checkOut ? r.checkOut : "",
      adults: String(r.adults), children: String(r.children),
      babies: String(r.babies), pets: String(r.pets),
      selectedCategory: r.selectedCategory ?? null,
    }));
  }
  if (seed) {
    return [newDraftRoom({
      adults: String(seed.adults ?? 2), children: String(seed.children ?? 0),
      babies: String(seed.babies ?? 0), pets: String(seed.pets ?? 0),
    })];
  }
  return [newDraftRoom()];
}

export function NewQuoteWizard({
  propertyId, channels, attendantName, initialBundle, onBundleLoaded,
  onClose, onSaved, onOpenExisting, seed,
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
  /** Editar um orçamento existente ou nascer com o cliente preenchido. */
  seed?: QuoteSeed | null;
}) {
  const editingId = seed?.quoteId ?? null;
  const hasSeed = !!seed;
  // Com semente o cliente já está resolvido: começa direto na calculadora.
  const [step, setStep] = useState<1 | 2 | 3>(hasSeed ? 3 : 1);

  // ── Passo 1: lead + composição ─────────────────────────────────────────────
  const [name, setName] = useState(seed?.clientName ?? "");
  const [source, setSource] = useState(seed?.source ?? "");
  const [phone, setPhone] = useState(seed?.clientPhone ?? "");
  const [email, setEmail] = useState(seed?.clientEmail ?? "");
  const [document, setDocument] = useState(seed?.clientDocument ?? "");
  const [checkIn, setCheckIn] = useState(seed?.checkIn ?? todayIso());
  const [checkOut, setCheckOut] = useState(seed?.checkOut ?? addDays(todayIso(), 2));
  const [rooms, setRooms] = useState<DraftRoom[]>(() => seedRooms(seed));
  const [linkedGuest, setLinkedGuest] = useState<{ id: string; name: string } | null>(
    seed?.guestId ? { id: seed.guestId, name: seed.clientName || seed.guestId } : null
  );

  const patchRoom = (id: string, patch: Partial<DraftRoom>) =>
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRoom = () => setRooms((prev) => [...prev, newDraftRoom()]);
  const duplicateRoom = (id: string) => setRooms((prev) => {
    const src = prev.find((r) => r.id === id);
    if (!src) return prev;
    return [...prev, newDraftRoom({ ...src, id: `r${++draftSeq}`, selectedCategory: null })];
  });
  const removeRoom = (id: string) =>
    setRooms((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

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
    // Editando / cliente já resolvido: não há o que confirmar.
    if (hasSeed || linkedGuest) { setStep(3); return; }
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

  // ── Passo 3: calculadora (uma por acomodação) ──────────────────────────────
  const [bundle, setBundle] = useState<RateBundle | null>(initialBundle);
  const [fluctuationPct, setFluctuationPct] = useState(seed?.fluctuationPct ?? 0);
  const [discountIds, setDiscountIds] = useState<string[]>(seed?.discountIds ?? []);
  const [adhocValue, setAdhocValue] = useState(seed?.adhocValue ? String(seed.adhocValue) : "");
  const [adhocType, setAdhocType] = useState<"pct" | "brl">(seed?.adhocType === "brl" ? "brl" : "pct");
  const [detailed, setDetailed] = useState(false);
  /** Opções fora da mensagem, por acomodação: roomId → Set(categoryId). */
  const [deselected, setDeselected] = useState<Record<string, Set<string>>>({});
  /** Disponibilidade + eventos por período ("in|out") — acomodações podem diferir. */
  const [contextByPeriod, setContextByPeriod] = useState<Record<string, {
    availability: Record<string, RateAvailability>;
    events: { title: string; date: string }[];
  }>>({});
  const [saving, setSaving] = useState(false);
  // Editando: o "salvo" já é o orçamento existente desde o início.
  const [savedId, setSavedId] = useState<string | null>(editingId);
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

  // Disponibilidade real + eventos, POR PERÍODO distinto (acomodações podem
  // ter datas próprias). A rota é a mesma do Tarifário; a chave é "in|out".
  const periodKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) {
      const p = { checkIn: r.checkIn || checkIn, checkOut: r.checkOut || checkOut };
      if (p.checkIn && p.checkOut && p.checkIn < p.checkOut) set.add(`${p.checkIn}|${p.checkOut}`);
    }
    return Array.from(set).sort();
  }, [rooms, checkIn, checkOut]);

  useEffect(() => {
    if (step !== 3 || periodKeys.length === 0) return;
    let cancelled = false;
    Promise.all(periodKeys.map(async (key) => {
      const [ci, co] = key.split("|");
      const res = await fetch(`/api/admin/tarifario/context?propertyId=${propertyId}&in=${ci}&out=${co}`)
        .catch(() => null);
      const d = res?.ok ? await res.json() : { availability: {}, events: [] };
      return [key, d] as const;
    })).then((entries) => {
      if (cancelled) return;
      const byPeriod: Record<string, { availability: Record<string, RateAvailability>; events: { title: string; date: string }[] }> = {};
      for (const [key, d] of entries) {
        byPeriod[key] = { availability: d.availability || {}, events: d.events || [] };
      }
      setContextByPeriod(byPeriod);
    });
    return () => { cancelled = true; };
  }, [step, propertyId, periodKeys]);

  const commercial = useMemo(() => ({
    fluctuationPct, discountIds,
    adhocValue: parseFloat(adhocValue) || 0, adhocType,
  }), [fluctuationPct, discountIds, adhocValue, adhocType]);

  /** Período efetivo da acomodação: o próprio, ou o do orçamento. */
  const periodOf = (room: DraftRoom) => {
    const ci = room.checkIn || checkIn;
    const co = room.checkOut || checkOut;
    return { checkIn: ci, checkOut: co > ci ? co : checkOut };
  };

  /** Uma cotação por acomodação — mesmo motor; pax E período podem variar. */
  const roomQuotes = useMemo(() => {
    if (!bundle) return null;
    const data = {
      tables: bundle.tables, periods: bundle.periods,
      settings: bundle.settings, categories: bundle.categories,
    };
    return rooms.map((room) => {
      const input: RateQuoteInput = { ...periodOf(room), ...paxOf(room), ...commercial };
      return { room, input, result: computeQuote(input, data) as RateQuoteResult };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, checkIn, checkOut, commercial, bundle]);

  /** Pax somado — os placeholders da mensagem falam do grupo inteiro. */
  const totalInput: RateQuoteInput = useMemo(() => {
    const sum = rooms.reduce((acc, r) => {
      const p = paxOf(r);
      return {
        adults: acc.adults + p.adults, children: acc.children + p.children,
        babies: acc.babies + p.babies, pets: acc.pets + p.pets,
      };
    }, { adults: 0, children: 0, babies: 0, pets: 0 });
    return { checkIn, checkOut, ...sum, ...commercial };
  }, [rooms, checkIn, checkOut, commercial]);

  const blocked = roomQuotes?.some((rq) => rq.result.categories.length === 0) ?? true;

  /** Total do orçamento: escolhida quando houver, senão o mínimo ("a partir de"). */
  const totals = useMemo(() => {
    if (!roomQuotes) return { value: 0, approximate: false };
    let value = 0, approximate = false;
    for (const rq of roomQuotes) {
      const options = rq.result.categories;
      const chosen = rq.room.selectedCategory
        ? options.find((c) => c.categoryId === rq.room.selectedCategory)
        : undefined;
      if (chosen) { value += chosen.finalTotal; continue; }
      const mins = options.map((c) => c.finalTotal).filter((v) => v > 0);
      if (mins.length === 0) continue;
      value += Math.min(...mins);
      if (mins.length > 1) approximate = true;
    }
    return { value, approximate };
  }, [roomQuotes]);

  // Mudou o cálculo/cliente → o save anterior não representa mais o orçamento.
  const quoteKey = JSON.stringify([
    checkIn, checkOut, commercial, rooms, name, document, phone, email,
    linkedGuest?.id ?? null, source,
  ]);
  const isSavedCurrent = savedId !== null && savedKeyRef.current === quoteKey;

  const save = async (status: "open" | "sent"): Promise<string | null> => {
    if (blocked) {
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
            checkIn, checkOut,
            // Só a COMPOSIÇÃO vai — as opções e os preços são calculados no
            // servidor (o cliente nunca manda valor).
            rooms: rooms.map((r) => ({
              id: r.id, label: r.label.trim() || null,
              ...periodOf(r), ...paxOf(r),
              selectedCategory: r.selectedCategory,
            })),
            ...commercial,
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
    toast.success(editingId
      ? "Cotação atualizada — valores recalculados."
      : "Salvo no funil — follow-up e validade criados automaticamente.");
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
    if (!bundle || !roomQuotes) return;
    const settings = bundle.settings;
    const linkOf = (categoryId: string) =>
      bundle.categories.find((c) => c.id === categoryId)?.siteUrl || undefined;
    const single = settings.msgSingleTemplate || DEFAULT_MSG_SINGLE_TEMPLATE;

    // Com uma acomodação a mensagem sai idêntica à de sempre; com várias,
    // um bloco por acomodação para o cliente entender que escolhe uma de cada.
    // forEach com índice: o target do tsconfig não itera `.entries()`.
    const parts: string[] = [];
    roomQuotes.forEach((rq, i) => {
      const off = deselected[rq.room.id] ?? new Set<string>();
      const picked = rq.result.categories.filter((c) => !off.has(c.categoryId));
      if (picked.length === 0) return;
      const blocks = picked
        .map((c) => buildCategoryBlock(c, linkOf(c.categoryId), single, detailed))
        .join("\n");
      parts.push(roomQuotes.length === 1
        ? blocks
        : `*${roomLabel(rq.room, i)}* — ${paxLabel(rq.room)}\n${blocks}`);
    });
    if (parts.length === 0) { toast.error("Selecione pelo menos uma categoria."); return; }

    let resumo = parts.join("\n");
    if (roomQuotes.length > 1) {
      resumo += `\n💰 *Total ${totals.approximate ? "a partir de " : ""}R$ ${formatBRL(totals.value)}* (${roomQuotes.length} acomodações)`;
    }
    // Eventos de TODOS os períodos envolvidos, sem repetir.
    const allEvents = Object.values(contextByPeriod).flatMap((c) => c.events);
    const uniqueEvents = allEvents.filter(
      (ev, i) => allEvents.findIndex((o) => o.title === ev.title && o.date === ev.date) === i
    );
    const avisos = buildEventNotices(uniqueEvents, settings.eventTemplate);
    const msgCtx = { attendantName, input: totalInput, isWedding: false };
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

  const toggleCategory = (roomId: string, categoryId: string) =>
    setDeselected((prev) => {
      const next = new Set(prev[roomId] ?? []);
      if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
      return { ...prev, [roomId]: next };
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

  /** Uma opção de cabana dentro de uma acomodação. */
  const optionRow = (room: DraftRoom, c: RateQuoteCategory) => {
    const off = (deselected[room.id] ?? new Set()).has(c.categoryId);
    const p = periodOf(room);
    const avail = contextByPeriod[`${p.checkIn}|${p.checkOut}`]?.availability[c.categoryId];
    const discounted = Math.abs(c.finalTotal - c.rawTotal) > 5;
    const chosen = room.selectedCategory === c.categoryId;
    return (
      <div key={c.categoryId}
        style={{
          ...S.row, display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px", opacity: off ? 0.45 : 1,
          border: `1px solid ${chosen ? T.g1Border : off ? T.border : T.border2}`,
          background: chosen ? T.gradSoft : T.glass,
        }}>
        <input type="checkbox" checked={!off} onChange={() => toggleCategory(room.id, c.categoryId)}
          title="Incluir na mensagem" style={{ accentColor: T.g1, cursor: "pointer" }} />
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
        <span style={{ fontSize: 13, fontWeight: 900, color: chosen ? T.g1 : T.text }}>
          R$ {formatBRL(c.finalTotal)}
        </span>
        <button
          onClick={() => patchRoom(room.id, { selectedCategory: chosen ? null : c.categoryId })}
          title={chosen ? "Desmarcar" : "Marcar como escolhida pelo cliente"}
          style={{
            padding: "5px 9px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
            fontSize: 10, fontWeight: 800, flexShrink: 0,
            border: `1px solid ${chosen ? T.g1Border : T.border2}`,
            background: chosen ? T.gradSoft : "transparent",
            color: chosen ? T.g1 : T.muted,
          }}>
          {chosen ? "escolhida" : "escolher"}
        </button>
      </div>
    );
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 24,
      }}>
      <div style={{
        width: "100%", maxWidth: 780, maxHeight: "90vh", background: T.card,
        border: `1px solid ${T.border2}`, borderRadius: 20,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 32px 80px rgba(0,0,0,.7)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: T.text }}>
              {editingId ? "Editar cotação" : hasSeed ? "Nova cotação para o cliente" : "Nova cotação"}
            </div>
            {editingId && (
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
                Recalcula e substitui os valores deste orçamento.
              </div>
            )}
            <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
              {stepDot(1, "Pedido")}
              {!hasSeed && stepDot(2, "Confirmação")}
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

            {/* Composição do pedido */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <span style={{ ...fieldLabel, margin: 0 }}>Acomodações pedidas</span>
              <span style={{ fontSize: 10.5, color: T.muted2 }}>
                {rooms.length > 1 ? `${rooms.length} cabanas na mesma reserva` : "uma cabana"}
              </span>
              <button onClick={addRoom}
                style={{
                  marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "6px 11px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 11, fontWeight: 800, background: T.gradSoft,
                  border: `1px solid ${T.g1Border}`, color: T.g1,
                }}>
                <Plus size={12} /> Adicionar acomodação
              </button>
            </div>
            {rooms.map((r, i) => (
              <div key={r.id} style={{ ...S.row, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 7, background: T.gradSoft,
                    border: `1px solid ${T.g1Border}`, color: T.g1, fontSize: 10, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>{i + 1}</span>
                  <input style={{ ...S.input, flex: 1, padding: "6px 10px", fontSize: 12 }}
                    placeholder={`Rótulo (opcional) — ex.: Casal, Família`}
                    value={r.label} onChange={(e) => patchRoom(r.id, { label: e.target.value })} />
                  <button onClick={() => duplicateRoom(r.id)} title="Duplicar acomodação"
                    style={{ ...S.ghostBtn, padding: "6px 10px", fontSize: 11 }}>
                    <Copy size={12} /> Duplicar
                  </button>
                  {rooms.length > 1 && (
                    <button onClick={() => removeRoom(r.id)} title="Remover"
                      style={{
                        padding: 6, borderRadius: 8, background: "none", border: "none",
                        color: T.muted, cursor: "pointer", display: "flex", flexShrink: 0,
                      }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                  {numField("Adultos", r.adults, (v) => patchRoom(r.id, { adults: v }))}
                  {numField("Crianças", r.children, (v) => patchRoom(r.id, { children: v }))}
                  {numField("Bebês", r.babies, (v) => patchRoom(r.id, { babies: v }))}
                  {numField("Pets", r.pets, (v) => patchRoom(r.id, { pets: v }))}
                </div>
              </div>
            ))}
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
              <span>{rooms.length} acomodaç{rooms.length > 1 ? "ões" : "ão"}</span>
              {rooms.some((r) => r.checkIn || r.checkOut) && (
                <span style={{ ...pillS(T.gradSoft, T.g1, T.g1Border), fontSize: 9 }}>
                  datas por acomodação
                </span>
              )}
              <button onClick={() => setStep(1)}
                style={{
                  marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4,
                  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 11, fontWeight: 700, color: T.muted, textDecoration: "underline", textUnderlineOffset: 2,
                }}>
                <ArrowLeft size={11} /> editar pedido
              </button>
            </div>

            {!bundle || !roomQuotes ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 10, color: T.muted }}>
                <Loader2 size={18} className="animate-spin" color={T.g1} /> Carregando tarifário…
              </div>
            ) : (<>
              {roomQuotes[0].result.uncoveredDates.length > 0 && (
                <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 11, padding: "9px 13px", fontSize: 12, color: T.red }}>
                  Sem regra de tarifário para {roomQuotes[0].result.uncoveredDates.length} data(s) — cadastre no Tarifário → Calendário.
                </div>
              )}
              {roomQuotes[0].result.nights > 0 && roomQuotes[0].result.nights < roomQuotes[0].result.minNightsRequired && (
                <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 11, padding: "9px 13px", fontSize: 12, color: T.amber }}>
                  Período exige mínimo de {roomQuotes[0].result.minNightsRequired} diárias (cotação tem {roomQuotes[0].result.nights}).
                </div>
              )}
              {(() => {
                const all = Object.values(contextByPeriod).flatMap((c) => c.events);
                return all.filter((ev, i) => all.findIndex((o) => o.title === ev.title && o.date === ev.date) === i);
              })().map((ev, i) => (
                <div key={i} style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 11, padding: "9px 13px", fontSize: 12, color: T.blue }}>
                  Evento no período: <b>{ev.title}</b> ({fmtBR(ev.date)}) — o aviso entra na mensagem.
                </div>
              ))}

              {/* Ajustes comerciais — valem para o orçamento inteiro */}
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

              {/* Opções por acomodação — com período editável aqui mesmo
                  (chegadas escalonadas), recalculando ao vivo. */}
              {roomQuotes.map((rq, i) => {
                const p = periodOf(rq.room);
                const custom = !!(rq.room.checkIn || rq.room.checkOut);
                const nights = rq.result.nights;
                return (
                  <div key={rq.room.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: T.text }}>
                        {roomQuotes.length > 1 ? roomLabel(rq.room, i) : "Cabanas oferecidas"}
                      </span>
                      <span style={{ fontSize: 11, color: T.muted }}>{paxLabel(rq.room)}</span>
                      {rq.room.selectedCategory && (
                        <span style={{ ...pillS(T.gradSoft, T.g1, T.g1Border), fontSize: 9 }}>escolhida</span>
                      )}
                      {/* Período desta acomodação */}
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                        <input type="date" value={p.checkIn}
                          title="Check-in desta acomodação"
                          onChange={(e) => patchRoom(rq.room.id, { checkIn: e.target.value })}
                          style={{
                            ...S.input, width: 132, padding: "5px 8px", fontSize: 11,
                            borderColor: custom ? T.g1Border : T.border2,
                            color: custom ? T.g1 : T.text,
                          }} />
                        <span style={{ fontSize: 11, color: T.muted2 }}>→</span>
                        <input type="date" value={p.checkOut}
                          title="Check-out desta acomodação"
                          onChange={(e) => patchRoom(rq.room.id, { checkOut: e.target.value })}
                          style={{
                            ...S.input, width: 132, padding: "5px 8px", fontSize: 11,
                            borderColor: custom ? T.g1Border : T.border2,
                            color: custom ? T.g1 : T.text,
                          }} />
                        <span style={{ fontSize: 10.5, color: T.muted, minWidth: 48 }}>
                          {nights} noite{nights !== 1 ? "s" : ""}
                        </span>
                        {custom && (
                          <button onClick={() => patchRoom(rq.room.id, { checkIn: "", checkOut: "" })}
                            title="Voltar ao período do orçamento"
                            style={{
                              padding: 4, borderRadius: 7, background: "none", border: "none",
                              color: T.muted, cursor: "pointer", display: "flex",
                            }}>
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    </div>
                    {rq.result.uncoveredDates.length > 0 && (
                      <p style={{ fontSize: 11.5, color: T.red, margin: 0 }}>
                        Sem regra de tarifário em {rq.result.uncoveredDates.length} data(s) deste período.
                      </p>
                    )}
                    {rq.result.categories.length === 0 ? (
                      <p style={{ fontSize: 12, color: T.red, margin: 0 }}>
                        Nenhuma categoria comporta {paxLabel(rq.room)} neste período.
                      </p>
                    ) : (
                      rq.result.categories.map((c) => optionRow(rq.room, c))
                    )}
                  </div>
                );
              })}

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: T.muted, cursor: "pointer" }}>
                  <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)}
                    style={{ accentColor: T.g1 }} />
                  Detalhar cálculos na mensagem
                </label>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 900, color: T.text }}>
                  {totals.approximate ? "a partir de " : ""}R$ {formatBRL(totals.value)}
                  {roomQuotes.length > 1 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.muted }}> · {roomQuotes.length} acomodações</span>
                  )}
                </span>
              </div>
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
            <button onClick={saveAndClose} disabled={saving || blocked}
              style={{ ...S.ghostBtn, marginLeft: "auto", opacity: saving ? 0.6 : 1 }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {editingId ? "Salvar alterações" : "Salvar no funil"}
            </button>
            <button onClick={copyQuote} disabled={saving || blocked}
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
