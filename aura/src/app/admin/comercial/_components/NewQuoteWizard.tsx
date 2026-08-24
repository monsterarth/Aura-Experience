// Wizard "Nova cotação" — a cotação nasce NO funil, sem pular pro Tarifário:
// 1) dados do lead (nome + origem + um contato) e a COMPOSIÇÃO do pedido —
//    quantas acomodações e o pax de cada uma (2 cabanas de casal, 1 casal +
//    1 família…). Tudo isso é UMA negociação, UM card no funil.
// 2) "é essa pessoa?" — cruza com a base (telefone/nome/CPF) + anti-duplicidade.
//    Achar orçamento aberto do mesmo cliente NÃO descarta o que foi digitado:
//    entra um COMPARATIVO (nos moldes do diálogo de arquivo repetido) com o que
//    está salvo × o que foi preenchido, e três saídas — atualizar aquele lead
//    com o pedido novo, manter o pedido salvo, ou criar um card à parte.
// 3) a calculadora SIT embutida, POR acomodação (computeQuote puro no cliente,
//    mesmo motor do Tarifário; o save recalcula no servidor) → salvar /
//    copiar → "enviado?"
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Copy, Loader2, Pencil,
  Phone, Plus, Save, Trash2, X,
} from "lucide-react";
import { T } from "@/lib/admin-tokens";
import { useCloseGuard } from "@/lib/use-discard-guard";
import { parseMoneyBR, moneyToInput } from "@/lib/parse-money";
import { copyText } from "@/lib/clipboard";
import { normalizeInstagram } from "@/lib/instagram";
import {
  computeQuote, processTemplate, buildCategoryBlock, buildEventNotices,
  DEFAULT_MSG_TEMPLATE, DEFAULT_MSG_SINGLE_TEMPLATE, MIN_OVER_CAPACITY_REASON,
  addDays, dateToIso, formatBRL,
} from "@/lib/rate-engine";
import type { RateBundle } from "@/services/rate-service";
import { FnrhService, FnrhDomain } from "@/services/fnrh-service";
import {
  CrmChannel, Guest, RateAvailability, RateQuoteCategory, RateQuoteInput,
  RateQuoteRecord, RateQuoteResult, RateQuoteRoom,
} from "@/types/aura";
import { S, fmtBR, pillS, QUOTE_STAGES } from "./shared";
import { Dialog, IconButton } from "@/components/aura";

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
  /** Preço oferecido por CABANA (`categoryId → texto`); ausente = tabela. */
  prices: Record<string, string>;
  /** Exceção de ocupação liberada nesta acomodação (+ o motivo, obrigatório). */
  allowOverCapacity: boolean;
  overCapacityReason: string;
};

let draftSeq = 0;
const newDraftRoom = (over?: Partial<DraftRoom>): DraftRoom => ({
  id: `r${++draftSeq}`, label: "",
  checkIn: "", checkOut: "",
  adults: "2", children: "0", babies: "0", pets: "0",
  selectedCategory: null, prices: {},
  allowOverCapacity: false, overCapacityReason: "",
  ...over,
});

const roomLabel = (r: DraftRoom, i: number) => r.label.trim() || `Acomodação ${i + 1}`;
const paxOf = (r: DraftRoom) => ({
  adults: Math.max(1, parseInt(r.adults) || 1),
  children: Math.max(0, parseInt(r.children) || 0),
  babies: Math.max(0, parseInt(r.babies) || 0),
  pets: Math.max(0, parseInt(r.pets) || 0),
});
type Pax = { adults: number; children: number; babies: number; pets: number };
const paxText = (p: Pax) => {
  const parts = [`${p.adults + p.children} pagante${p.adults + p.children !== 1 ? "s" : ""}`];
  if (p.babies > 0) parts.push(`${p.babies} isento${p.babies > 1 ? "s" : ""}`);
  if (p.pets > 0) parts.push(`${p.pets} pet${p.pets > 1 ? "s" : ""}`);
  return parts.join(" · ");
};
const paxLabel = (r: DraftRoom) => paxText(paxOf(r));

const sumPax = (list: Pax[]): Pax => list.reduce((a, p) => ({
  adults: a.adults + p.adults, children: a.children + p.children,
  babies: a.babies + p.babies, pets: a.pets + p.pets,
}), { adults: 0, children: 0, babies: 0, pets: 0 });

/** Noites entre duas datas ISO (ambas UTC-meia-noite: a subtração é exata). */
const nightsBetween = (a: string, b: string) =>
  Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));

/** Composição de um orçamento salvo — `rooms` quando existe, colunas raiz nos
 *  antigos (pré-fase 3, que só tinham uma acomodação). */
const quoteComposition = (q: RateQuoteRecord): { count: number; pax: Pax } =>
  q.rooms && q.rooms.length > 0
    ? { count: q.rooms.length, pax: sumPax(q.rooms) }
    : { count: 1, pax: { adults: q.adults, children: q.children, babies: q.babies, pets: q.pets } };

/** Semente do wizard: reabrir para EDITAR ou clonar o cliente numa cotação nova. */
export type QuoteSeed = {
  /** Presente = edita o MESMO orçamento; ausente = cria um lead novo. */
  quoteId?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  /** @usuário do Instagram — meio de contato de quem chega por DM. */
  clientInstagram?: string | null;
  clientDocument?: string | null;
  /** FNRH ID do tipo de documento (CPF/PASSAPORTE/RG/DNI/CNH/OUTRO) — default CPF. */
  clientDocumentType?: string | null;
  /** Idioma falado pelo hóspede — rege a proposta pública e o WhatsApp copiado. */
  clientLanguage?: "pt" | "en" | "es" | null;
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
  /** Orçamento salvo em modo Automática — reabre com o modo ligado. */
  fluctuationAuto?: boolean | null;
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
      prices: Object.fromEntries(
        Object.entries(r.priceOverrides ?? {}).map(([k, v]) => [k, moneyToInput(Number(v))])
      ),
      // Sem isto a exceção se perde ao reabrir: a cabana fora de capacidade
      // sumiria do recálculo e o vendedor não veria o porquê.
      allowOverCapacity: r.allowOverCapacity === true,
      overCapacityReason: r.overCapacityReason ?? "",
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
  onClose, onSaved, onOpenExisting, seed, proposalBase,
}: {
  propertyId: string;
  channels: CrmChannel[];
  attendantName: string;
  /** Host público da proposta — vira {QUOTE_LINK} na mensagem. */
  proposalBase: string;
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
  // Digitou algo e clicou fora / Esc não pode sumir com o pedido sem avisar.
  const { requestClose, confirmDiscard, guardProps, markDirty } = useCloseGuard(onClose, { escape: false });

  // ── Passo 1: lead + composição ─────────────────────────────────────────────
  const [name, setName] = useState(seed?.clientName ?? "");
  const [source, setSource] = useState(seed?.source ?? "");
  const [phone, setPhone] = useState(seed?.clientPhone ?? "");
  const [email, setEmail] = useState(seed?.clientEmail ?? "");
  const [instagram, setInstagram] = useState(seed?.clientInstagram ?? "");
  const [document, setDocument] = useState(seed?.clientDocument ?? "");
  const [documentType, setDocumentType] = useState(seed?.clientDocumentType ?? "CPF");
  const [language, setLanguage] = useState<"pt" | "en" | "es">(seed?.clientLanguage ?? "pt");
  const [docTypes, setDocTypes] = useState<FnrhDomain[]>([]);
  useEffect(() => { FnrhService.getTiposDocumento().then(setDocTypes); }, []);
  const [checkIn, setCheckIn] = useState(seed?.checkIn ?? todayIso());
  const [checkOut, setCheckOut] = useState(seed?.checkOut ?? addDays(todayIso(), 2));
  const [rooms, setRooms] = useState<DraftRoom[]>(() => seedRooms(seed));
  const [linkedGuest, setLinkedGuest] = useState<{ id: string; name: string } | null>(
    seed?.guestId ? { id: seed.guestId, name: seed.clientName || seed.guestId } : null
  );

  // Choke point único: cobre digitação (redundante com o guardProps) E os
  // botões que mudam acomodação sem passar por input nativo (escolher
  // cabana, voltar ao período do orçamento).
  const patchRoom = (id: string, patch: Partial<DraftRoom>) => {
    markDirty();
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const addRoom = () => { markDirty(); setRooms((prev) => [...prev, newDraftRoom()]); };
  const duplicateRoom = (id: string) => { markDirty(); setRooms((prev) => {
    const src = prev.find((r) => r.id === id);
    if (!src) return prev;
    return [...prev, newDraftRoom({
      ...src, id: `r${++draftSeq}`, selectedCategory: null, prices: { ...src.prices },
    })];
  }); };
  const removeRoom = (id: string) => {
    markDirty();
    setRooms((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const step1Error = !name.trim() ? "Informe o nome do cliente."
    : !source ? "Informe a origem do lead."
    : !phone.trim() && !email.trim() && !normalizeInstagram(instagram)
      ? "Informe telefone, e-mail ou Instagram."
    : !checkIn || !checkOut || checkIn >= checkOut ? "Período inválido."
    : null;

  // ── Passo 2: match ─────────────────────────────────────────────────────────
  const [checking, setChecking] = useState(false);
  const [matches, setMatches] = useState<MatchContext | null>(null);
  /**
   * Orçamento que já existia e foi ADOTADO no passo 2: em vez de descartar o
   * que a recepção acabou de digitar para abrir a ficha antiga, o wizard passa
   * a atualizar aquele lead com o pedido da tela. Nada é digitado duas vezes e
   * o funil não ganha card repetido.
   */
  const [adopted, setAdopted] = useState<RateQuoteRecord | null>(null);
  /** Qual dos orçamentos repetidos está no comparativo (default: o 1º). */
  const [compareId, setCompareId] = useState<string | null>(null);

  const goNext = async () => {
    if (step1Error) { toast.error(step1Error); return; }
    // Editando / cliente já resolvido / duplicado já tratado: nada a confirmar.
    if (hasSeed || adopted || linkedGuest) { setStep(3); return; }
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

  /**
   * "Continuar neste": o pedido digitado agora passa a valer PARA o orçamento
   * que já existe. `savedId` recebe o id dele — o save vai com `id` e atualiza
   * o mesmo lead. O que já estava preenchido fica; só o que estava em branco é
   * completado pela ficha antiga.
   */
  const adoptQuote = (q: RateQuoteRecord, keepSaved = false) => {
    setAdopted(q);
    setSavedId(q.id);
    savedKeyRef.current = null;   // o que está na tela ainda não foi gravado
    if (q.guestId) setLinkedGuest({ id: q.guestId, name: q.clientName || name });
    if (!phone.trim() && q.clientPhone) setPhone(q.clientPhone);
    if (!email.trim() && q.clientEmail) setEmail(q.clientEmail);
    if (!instagram.trim() && q.clientInstagram) setInstagram(q.clientInstagram);
    if (!document.trim() && q.clientDocument) setDocument(q.clientDocument);
    if (q.clientDocumentType) setDocumentType(q.clientDocumentType);
    if (q.clientLanguage) setLanguage(q.clientLanguage);
    if (!source && q.source) setSource(q.source);
    if (keepSaved) applyQuoteToDraft(q);
    markDirty();
    setStep(3);
  };

  /** Traz período, acomodações e ajustes comerciais do orçamento salvo para a
   *  tela — o lado "manter o que já estava" do comparativo. */
  const applyQuoteToDraft = (q: RateQuoteRecord) => {
    setCheckIn(q.checkIn);
    setCheckOut(q.checkOut);
    setRooms(seedRooms({
      quoteId: q.id, checkIn: q.checkIn, checkOut: q.checkOut, rooms: q.rooms,
      adults: q.adults, children: q.children, babies: q.babies, pets: q.pets,
    }));
    setFluctuationPct(q.fluctuationPct ?? 0);
    setFluctuationAuto(q.fluctuationAuto === true);
    setDiscountIds(q.discountIds ?? []);
    setAdhocValue(q.adhocValue ? String(q.adhocValue) : "");
    setAdhocType(q.adhocType === "brl" ? "brl" : "pct");
  };

  /** É a MESMA viagem e o que foi digitado era repetição: volta ao pedido salvo. */
  const restoreAdopted = () => {
    if (!adopted) return;
    markDirty();
    applyQuoteToDraft(adopted);
  };

  /** Era outra negociação afinal: volta a nascer lead novo, sem perder a tela. */
  const undoAdopt = () => {
    setAdopted(null);
    setSavedId(null);
    savedKeyRef.current = null;
  };

  const confirmGuest = (g: Guest) => {
    setLinkedGuest({ id: g.id, name: g.fullName });
    setName(g.fullName);
    if (!document.trim() && g.document?.number) setDocument(g.document.number);
    if (g.document?.type) setDocumentType(g.document.type);
    if (g.preferredLanguage) setLanguage(g.preferredLanguage);
    if (!email.trim() && g.email) setEmail(g.email);
    if (!phone.trim() && g.phone) setPhone(g.phone);
    setStep(3);
  };

  // ── Passo 3: calculadora (uma por acomodação) ──────────────────────────────
  const [bundle, setBundle] = useState<RateBundle | null>(initialBundle);
  const [fluctuationPct, setFluctuationPct] = useState(seed?.fluctuationPct ?? 0);
  // Automática = o % de cada noite vem das regras por período do Tarifário
  // (média exibida). Default em cotação NOVA (inclusive duplicada/semeada);
  // só a EDIÇÃO de um orçamento existente respeita o modo salvo.
  const [fluctuationAuto, setFluctuationAuto] = useState(
    seed?.quoteId ? seed.fluctuationAuto === true : true
  );
  const [discountIds, setDiscountIds] = useState<string[]>(seed?.discountIds ?? []);
  const [adhocValue, setAdhocValue] = useState(seed?.adhocValue ? String(seed.adhocValue) : "");
  const [adhocType, setAdhocType] = useState<"pct" | "brl">(seed?.adhocType === "brl" ? "brl" : "pct");
  const [detailed, setDetailed] = useState(false);
  /** Opções fora da mensagem, por acomodação: roomId → Set(categoryId). */
  const [deselected, setDeselected] = useState<Record<string, Set<string>>>({});
  /** Painel de justificativa da exceção aberto (roomId) + rascunho do motivo. */
  const [overDraft, setOverDraft] = useState<{ roomId: string; text: string } | null>(null);
  /** Disponibilidade + eventos por período ("in|out") — acomodações podem diferir. */
  const [contextByPeriod, setContextByPeriod] = useState<Record<string, {
    availability: Record<string, RateAvailability>;
    events: { title: string; date: string }[];
  }>>({});
  const [saving, setSaving] = useState(false);
  // Editando: o "salvo" já é o orçamento existente desde o início.
  const [savedId, setSavedId] = useState<string | null>(editingId);
  const [askSent, setAskSent] = useState(false);
  /** Mensagem na tela para cópia manual — só quando o navegador recusou. */
  const [manualMsg, setManualMsg] = useState<string | null>(null);
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

  // Automática só vale com a migration aplicada (bundle.fluctuations != null);
  // sem ela, cai no manual silenciosamente — mesma regra do servidor.
  const autoAvailable = bundle?.fluctuations != null;
  const effectiveAuto = fluctuationAuto && autoAvailable;

  const commercial = useMemo(() => ({
    fluctuationPct: effectiveAuto ? 0 : fluctuationPct,
    fluctuationAuto: effectiveAuto,
    discountIds,
    adhocValue: parseFloat(adhocValue) || 0, adhocType,
  }), [effectiveAuto, fluctuationPct, discountIds, adhocValue, adhocType]);

  /** Período efetivo da acomodação: o próprio, ou o do orçamento. */
  const periodOf = (room: DraftRoom) => {
    const ci = room.checkIn || checkIn;
    const co = room.checkOut || checkOut;
    return { checkIn: ci, checkOut: co > ci ? co : checkOut };
  };

  /** Período REAL do orçamento: a envoltória das acomodações (menor entrada →
   *  maior saída), a MESMA regra que o servidor grava nas colunas raiz. É o
   *  que a proposta pública mostra — e o que precisa sair na mensagem: com o
   *  período do PEDIDO aqui, mexer na data da cotação recalculava os valores
   *  mas o WhatsApp copiado continuava saindo com as datas antigas. */
  const span = useMemo(() => {
    const periods = rooms.map(periodOf);
    return {
      checkIn: periods.reduce((m, p) => (p.checkIn < m ? p.checkIn : m), periods[0]?.checkIn ?? checkIn),
      checkOut: periods.reduce((m, p) => (p.checkOut > m ? p.checkOut : m), periods[0]?.checkOut ?? checkOut),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, checkIn, checkOut]);

  /**
   * Data editada aqui no passo 3. Com UMA acomodação o período dela É o do
   * orçamento: mover a data move a cotação inteira, em vez de criar um
   * "período por acomodação" que o resto da tela — e a mensagem — ignorava.
   * Com várias, a data é mesmo só daquela acomodação (chegada escalonada), e
   * as duas pontas são materializadas para não sobrar metade herdada.
   * Inverter as pontas não zera o período: a saída acompanha mantendo as
   * noites, que é o que se espera de quem está REMARCANDO a estadia.
   */
  const patchPeriod = (room: DraftRoom, field: "checkIn" | "checkOut", value: string) => {
    if (!value) return;   // limpar o campo no teclado não pode apagar o período
    const cur = periodOf(room);
    const next = field === "checkIn"
      ? {
          checkIn: value,
          checkOut: value < cur.checkOut
            ? cur.checkOut
            : addDays(value, nightsBetween(cur.checkIn, cur.checkOut) || 1),
        }
      : {
          checkIn: cur.checkIn,
          checkOut: value > cur.checkIn ? value : addDays(cur.checkIn, 1),
        };
    if (rooms.length > 1) { patchRoom(room.id, next); return; }
    markDirty();
    setCheckIn(next.checkIn);
    setCheckOut(next.checkOut);
    // Sozinha, a acomodação volta a HERDAR: período próprio só faz sentido
    // quando existe outra acomodação da qual diferir.
    setRooms((prev) => prev.map((r) => ({ ...r, checkIn: "", checkOut: "" })));
  };

  /** Uma cotação por acomodação — mesmo motor; pax E período podem variar. */
  const roomQuotes = useMemo(() => {
    if (!bundle) return null;
    const data = {
      tables: bundle.tables, periods: bundle.periods,
      settings: bundle.settings, categories: bundle.categories,
      fluctuations: bundle.fluctuations ?? undefined,
    };
    return rooms.map((room) => {
      const input: RateQuoteInput = {
        ...periodOf(room), ...paxOf(room), ...commercial,
        allowOverCapacity: room.allowOverCapacity,
      };
      return { room, input, result: computeQuote(input, data) as RateQuoteResult };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, checkIn, checkOut, commercial, bundle]);

  // Reabrindo um orçamento salvo: pré-marca só as cabanas que estavam REALMENTE
  // oferecidas (as chaves de `options`, já filtradas pelo fix de "oferece o
  // parque inteiro"), não tudo o que recalcula agora. Roda uma vez só — depois
  // disso o toggle do vendedor manda. Acomodação nova (sem par no seed) começa
  // com tudo marcado, como sempre.
  const seedDeselectedDone = useRef(false);
  useEffect(() => {
    if (seedDeselectedDone.current || !seed?.rooms?.length || !roomQuotes) return;
    seedDeselectedDone.current = true;
    const next: Record<string, Set<string>> = {};
    for (const rq of roomQuotes) {
      const saved = seed.rooms.find((r) => r.id === rq.room.id);
      if (!saved) continue;
      const offeredIds = new Set(saved.options.map((o) => o.categoryId || o.category));
      const off = new Set(rq.result.categories.filter((c) => !offeredIds.has(c.categoryId)).map((c) => c.categoryId));
      if (off.size > 0) next[rq.room.id] = off;
    }
    if (Object.keys(next).length > 0) setDeselected(next);
  }, [seed, roomQuotes]);

  /** Pax somado — os placeholders da mensagem falam do grupo inteiro. */
  const totalInput: RateQuoteInput = useMemo(() => {
    const sum = rooms.reduce((acc, r) => {
      const p = paxOf(r);
      return {
        adults: acc.adults + p.adults, children: acc.children + p.children,
        babies: acc.babies + p.babies, pets: acc.pets + p.pets,
      };
    }, { adults: 0, children: 0, babies: 0, pets: 0 });
    return { ...span, ...sum, ...commercial };
  }, [rooms, span, commercial]);

  /** Cabanas MARCADAS desta acomodação — é o que vai ser oferecido de verdade. */
  const includedOf = (rq: NonNullable<typeof roomQuotes>[number]) => {
    const off = deselected[rq.room.id] ?? new Set<string>();
    return rq.result.categories.filter((c) => !off.has(c.categoryId));
  };

  // Sem categoria computável, OU categorias computadas mas nenhuma marcada —
  // os dois travam Salvar/Copiar (nada pra oferecer de qualquer jeito).
  const blocked = roomQuotes?.some(
    (rq) => rq.result.categories.length === 0 || includedOf(rq).length === 0
  ) ?? true;

  /** Preço oferecido DESTA cabana (vazio/zero = vale o tarifário). */
  const priceOf = (room: DraftRoom, c: RateQuoteCategory): number => {
    const v = parseMoneyBR(room.prices[c.categoryId] ?? "");
    return Number.isFinite(v) && v > 0 ? v : c.finalTotal;
  };

  /** Só os overrides válidos, prontos para o payload. */
  const overridesOf = (room: DraftRoom, options: RateQuoteCategory[]) => {
    const out: Record<string, number> = {};
    for (const c of options) {
      const v = parseMoneyBR(room.prices[c.categoryId] ?? "");
      if (Number.isFinite(v) && v > 0) out[c.categoryId] = v;
    }
    return out;
  };

  /**
   * Total do orçamento = soma das acomodações. Por acomodação: cabana
   * escolhida → mínimo das opções ("a partir de"), sempre pelo preço
   * OFERECIDO. Mesma precedência do resolveRoomValue no servidor.
   */
  const totals = useMemo(() => {
    if (!roomQuotes) return { value: 0, approximate: false };
    let value = 0, approximate = false;
    for (const rq of roomQuotes) {
      // Só as MARCADAS — o total tem que bater com o que vai ser salvo/oferecido.
      const options = includedOf(rq);
      const chosen = rq.room.selectedCategory
        ? options.find((c) => c.categoryId === rq.room.selectedCategory)
        : undefined;
      if (chosen) { value += priceOf(rq.room, chosen); continue; }
      const mins = options.map((c) => priceOf(rq.room, c)).filter((v) => v > 0);
      if (mins.length === 0) continue;
      value += Math.min(...mins);
      if (mins.length > 1) approximate = true;
    }
    return { value, approximate };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomQuotes]);

  // Mudou o cálculo/cliente → o save anterior não representa mais o orçamento.
  const quoteKey = JSON.stringify([
    checkIn, checkOut, commercial, rooms, name, document, documentType, language, phone, email,
    linkedGuest?.id ?? null, source,
  ]);
  const isSavedCurrent = savedId !== null && savedKeyRef.current === quoteKey;

  const save = async (status: "open" | "sent"): Promise<string | null> => {
    if (blocked) {
      const empty = roomQuotes?.find((rq) => rq.result.categories.length > 0 && includedOf(rq).length === 0);
      toast.error(empty
        ? `Selecione ao menos uma cabana em "${roomLabel(empty.room, roomQuotes!.indexOf(empty))}".`
        : "Nenhuma categoria com preço para esses parâmetros.");
      return null;
    }
    // O servidor recusa exceção sem motivo — barrar aqui evita perder o clique.
    if (roomQuotes?.some((rq) =>
      rq.room.allowOverCapacity && rq.room.overCapacityReason.trim().length < MIN_OVER_CAPACITY_REASON
    )) {
      toast.error("Justifique a exceção de capacidade antes de salvar.");
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
            clientDocumentType: documentType, clientLanguage: language,
            clientPhone: phone.trim(), clientEmail: email.trim(),
            clientInstagram: normalizeInstagram(instagram),
            guestId: linkedGuest?.id ?? null,
            weddingId: null, source: source || null,
            checkIn, checkOut,
            // Só a COMPOSIÇÃO vai — as opções e os preços são calculados no
            // servidor (o cliente nunca manda valor).
            rooms: roomQuotes!.map((rq) => {
              const r = rq.room;
              return {
                id: r.id, label: r.label.trim() || null,
                ...periodOf(r), ...paxOf(r),
                selectedCategory: r.selectedCategory,
                // Só o preço OFERECIDO por cabana vai daqui; o valor de tabela é
                // sempre recalculado no servidor.
                priceOverrides: overridesOf(r, rq.result.categories),
                // Só as cabanas MARCADAS aqui — o servidor filtra `options` por
                // essa lista, senão a proposta pública oferecia o parque inteiro.
                includedCategoryIds: includedOf(rq).map((c) => c.categoryId),
                allowOverCapacity: r.allowOverCapacity,
                overCapacityReason: r.allowOverCapacity ? r.overCapacityReason.trim() : null,
              };
            }),
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
    toast.success(adopted
      ? "Orçamento existente atualizado — sem card repetido no funil."
      : editingId
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

    // Salva ANTES de montar a mensagem: o {QUOTE_LINK} precisa do id, e o
    // orçamento copiado tem que existir no funil de qualquer forma.
    let quoteId = savedId;
    if (!isSavedCurrent) {
      quoteId = await save("open");
      if (!quoteId) return;
    }

    const settings = bundle.settings;
    const linkOf = (categoryId: string) =>
      bundle.categories.find((c) => c.id === categoryId)?.siteUrl || undefined;
    // Idioma do orçamento escolhe a variante do template — vazio (não
    // traduzido ainda) cai no PT, igual ao resto do i18n inline do projeto.
    const pickLang = (base: string | null | undefined, en: string | null | undefined, es: string | null | undefined) =>
      (language === "en" ? en : language === "es" ? es : null) || base;
    const single = pickLang(settings.msgSingleTemplate, settings.msgSingleTemplate_en, settings.msgSingleTemplate_es)
      || DEFAULT_MSG_SINGLE_TEMPLATE;

    // Com uma acomodação a mensagem sai idêntica à de sempre; com várias,
    // um bloco por acomodação para o cliente entender que escolhe uma de cada.
    // forEach com índice: o target do tsconfig não itera `.entries()`.
    const parts: string[] = [];
    roomQuotes.forEach((rq, i) => {
      const off = deselected[rq.room.id] ?? new Set<string>();
      const picked = rq.result.categories.filter((c) => !off.has(c.categoryId));
      if (picked.length === 0) return;
      const blocks = picked
        // O que vai na mensagem é o preço OFERECIDO (com o ajuste manual).
        .map((c) => buildCategoryBlock(
          { ...c, finalTotal: priceOf(rq.room, c) }, linkOf(c.categoryId), single, detailed, language
        ))
        .join("\n");
      // Com períodos diferentes entre acomodações, o cabeçalho do bloco leva a
      // data DAQUELA — senão o cliente lê um período só, o do topo da mensagem.
      const p = periodOf(rq.room);
      const ownPeriod = p.checkIn !== span.checkIn || p.checkOut !== span.checkOut
        ? ` · ${fmtBR(p.checkIn)} → ${fmtBR(p.checkOut)}` : "";
      parts.push(roomQuotes.length === 1
        ? blocks
        : `*${roomLabel(rq.room, i)}* — ${paxLabel(rq.room)}${ownPeriod}\n${blocks}`);
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
    const avisos = buildEventNotices(uniqueEvents, pickLang(settings.eventTemplate, settings.eventTemplate_en, settings.eventTemplate_es));
    const msgCtx = {
      attendantName, input: totalInput, isWedding: false,
      quoteLink: quoteId ? `${proposalBase}/cotacao/${quoteId}` : null,
    };
    const msg = processTemplate(
      pickLang(settings.msgTemplate, settings.msgTemplate_en, settings.msgTemplate_es) || DEFAULT_MSG_TEMPLATE,
      msgCtx, resumo, avisos
    );

    if (!(await copyText(msg))) {
      // Falha típica: o vendedor troca de janela enquanto o orçamento salva e o
      // navegador recusa a escrita ("documento sem foco"). Mandar "copie
      // manualmente" sem nada para copiar deixava o vendedor sem saída — a
      // mensagem vai para a tela, e o botão de lá é um gesto novo com a janela
      // em foco (é o que costuma destravar).
      setManualMsg(msg);
      toast.error("Não foi possível copiar. A mensagem está na tela.");
      return;
    }
    toast.success("Cotação copiada — com o link da proposta.");
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

  const toggleDiscount = (id: string) => {
    markDirty();
    setDiscountIds((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  };

  const toggleCategory = (roomId: string, categoryId: string) =>
    setDeselected((prev) => {
      const next = new Set(prev[roomId] ?? []);
      if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
      return { ...prev, [roomId]: next };
    });

  /** Marca todas as cabanas computadas desta acomodação como oferecidas. */
  const selectAllCategories = (roomId: string) =>
    setDeselected((prev) => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });

  /** Desmarca tudo — ponto de partida pra escolher só 1 ou 2 cabanas específicas. */
  const selectNoCategories = (roomId: string, categoryIds: string[]) =>
    setDeselected((prev) => ({ ...prev, [roomId]: new Set(categoryIds) }));

  // ── Exceção de ocupação ────────────────────────────────────────────────────

  const openOverPanel = (room: DraftRoom) =>
    setOverDraft({ roomId: room.id, text: room.overCapacityReason });

  const confirmOver = () => {
    if (!overDraft) return;
    const text = overDraft.text.trim();
    if (text.length < MIN_OVER_CAPACITY_REASON) {
      toast.error(`Descreva o motivo da exceção (mín. ${MIN_OVER_CAPACITY_REASON} caracteres).`);
      return;
    }
    patchRoom(overDraft.roomId, { allowOverCapacity: true, overCapacityReason: text });
    setOverDraft(null);
  };

  /** Desligar limpa a escolha: a cabana escolhida pode ser justamente a de exceção. */
  const cancelOver = (room: DraftRoom) => {
    patchRoom(room.id, {
      allowOverCapacity: false, overCapacityReason: "", selectedCategory: null,
    });
    setOverDraft(null);
  };

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

  /** Orçamento que este wizard vai ATUALIZAR: o reaberto para editar ou o
   *  adotado no passo 2. Ausente = nasce lead novo. */
  const targetId = editingId ?? adopted?.id ?? null;

  const dupQuotes = matches?.quotes ?? [];
  const candidates = [...(matches?.phoneMatches ?? []), ...(matches?.nameMatches ?? [])];

  /**
   * Comparativo do passo 2 — a ideia do diálogo de arquivo repetido do Windows:
   * lado a lado o que JÁ está no funil e o que acabou de ser preenchido, com as
   * diferenças em destaque, e três saídas explícitas (substituir / manter /
   * ficar com os dois). Nenhuma delas descarta o pedido em silêncio.
   */
  const compare = dupQuotes.find((q) => q.id === compareId) ?? dupQuotes[0] ?? null;

  const compareRow = (label: string, left: string, right: string) => {
    const diff = left !== right;
    const cell = (v: string, side: "left" | "right"): React.CSSProperties => ({
      padding: "7px 10px", fontSize: 12, minWidth: 0, overflowWrap: "anywhere",
      borderRadius: 8,
      background: diff && side === "right" ? T.amberBg : "transparent",
      border: `1px solid ${diff && side === "right" ? T.amberBorder : "transparent"}`,
      color: diff ? (side === "right" ? T.amber : T.muted) : T.text,
      fontWeight: diff && side === "right" ? 800 : 600,
      textDecoration: diff && side === "left" ? "line-through" : "none",
    });
    return (
      <div key={label} style={{ display: "contents" }}>
        <span style={{ ...fieldLabel, margin: 0, alignSelf: "center" }}>{label}</span>
        <span style={cell(left, "left")}>{left}</span>
        <span style={cell(right, "right")}>{right}</span>
      </div>
    );
  };

  const compareBlock = (q: RateQuoteRecord) => {
    const stage = QUOTE_STAGES.find((s) => s.id === q.status);
    const saved = quoteComposition(q);
    const draft = { count: rooms.length, pax: sumPax(rooms.map(paxOf)) };
    const savedValue = q.negotiatedValue ?? q.finalValue ?? 0;
    const contactOf = (p: string, e: string, ig: string) =>
      [p, e, ig ? `@${ig}` : ""].filter(Boolean).join(" · ") || "—";
    const created = String(q.createdAt || "").slice(0, 10);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Cabeçalho das duas colunas */}
        <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 1fr", gap: 6, alignItems: "center" }}>
          <span />
          <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px", fontSize: 11, fontWeight: 800, color: T.muted }}>
            {stage && (
              <span style={{ width: 7, height: 7, borderRadius: 999, background: stage.dot, flexShrink: 0 }} />
            )}
            Já no funil{stage ? ` · ${stage.label}` : ""}
            {created && <span style={{ fontWeight: 600, color: T.muted2 }}> · {fmtBR(created)}</span>}
          </span>
          <span style={{ padding: "0 10px", fontSize: 11, fontWeight: 800, color: T.g1 }}>
            O que você preencheu agora
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 1fr", gap: 6, alignItems: "center" }}>
          {compareRow("Cliente", q.clientName || "sem nome", name.trim() || "sem nome")}
          {compareRow("Período",
            `${fmtBR(q.checkIn)} → ${fmtBR(q.checkOut)}`,
            `${fmtBR(checkIn)} → ${fmtBR(checkOut)}`)}
          {compareRow("Noites",
            String(nightsBetween(q.checkIn, q.checkOut)),
            String(nightsBetween(checkIn, checkOut)))}
          {compareRow("Acomodações",
            `${saved.count} · ${paxText(saved.pax)}`,
            `${draft.count} · ${paxText(draft.pax)}`)}
          {compareRow("Contato",
            contactOf(q.clientPhone || "", q.clientEmail || "", q.clientInstagram || ""),
            contactOf(phone.trim(), email.trim(), normalizeInstagram(instagram) || ""))}
          {/* Valor não é comparável no passo 2: o novo só é calculado adiante. */}
          <span style={{ ...fieldLabel, margin: 0, alignSelf: "center" }}>Valor</span>
          <span style={{ padding: "7px 10px", fontSize: 12, fontWeight: 700, color: T.text }}>
            {savedValue > 0 ? `R$ ${formatBRL(savedValue)}` : "a definir"}
            {q.negotiatedValue ? (
              <span style={{ fontSize: 10.5, fontWeight: 600, color: T.muted }}> · negociado</span>
            ) : null}
          </span>
          <span style={{ padding: "7px 10px", fontSize: 11.5, color: T.muted2 }}>
            calculado no passo seguinte
          </span>
        </div>

        {/* As três saídas — nenhuma perde o que está na tela sem avisar. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          <button onClick={() => adoptQuote(q)}
            title="O orçamento que já existe passa a valer com o pedido desta tela"
            style={{ ...S.gradBtn, padding: "8px 13px", fontSize: 12 }}>
            <Save size={13} /> Atualizar com o novo pedido
          </button>
          <button onClick={() => adoptQuote(q, true)}
            title="Continua neste orçamento com o pedido que já estava salvo"
            style={{ ...S.ghostBtn, padding: "8px 13px", fontSize: 12 }}>
            Manter o que já estava
          </button>
          <button onClick={() => setStep(3)}
            title="Duas negociações distintas do mesmo cliente — cada uma com seu card"
            style={{ ...S.ghostBtn, padding: "8px 13px", fontSize: 12 }}>
            São pedidos diferentes — criar outro
          </button>
          <button onClick={() => { confirmDiscard().then(ok => { if (ok) onOpenExisting(q.id); }); }}
            title="Fecha o wizard e abre a ficha (descarta o que foi preenchido)"
            style={{
              ...S.ghostBtn, padding: "8px 11px", fontSize: 11,
              marginLeft: "auto", color: T.muted2,
            }}>
            Só abrir a ficha
          </button>
        </div>
      </div>
    );
  };

  /** Uma opção de cabana dentro de uma acomodação. */
  const optionRow = (room: DraftRoom, c: RateQuoteCategory) => {
    const off = (deselected[room.id] ?? new Set()).has(c.categoryId);
    // Cabana em exceção: não tem preço para este pax, foi cotada pela maior
    // tabela que tem. Fica em âmbar — mas a escolhida mantém o gradiente.
    const over = c.overCapacity;
    const p = periodOf(room);
    const avail = contextByPeriod[`${p.checkIn}|${p.checkOut}`]?.availability[c.categoryId];
    const chosen = room.selectedCategory === c.categoryId;
    // O preço é editável AQUI, cabana por cabana. Riscado = o valor que o
    // tarifário calculou (flutuação incluída) quando ofereço mais barato;
    // sem oferta própria, o riscado volta a ser o valor cheio.
    const draft = room.prices[c.categoryId] ?? "";
    const offered = priceOf(room, c);
    const custom = Math.abs(offered - c.finalTotal) > 0.5;
    const strike = custom
      ? (offered < c.finalTotal ? c.finalTotal : null)
      : (Math.abs(c.finalTotal - c.rawTotal) > 5 ? c.rawTotal : null);
    const setPrice = (v: string) =>
      patchRoom(room.id, { prices: { ...room.prices, [c.categoryId]: v } });
    return (
      <div key={c.categoryId}
        style={{
          ...S.row, display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px", opacity: off ? 0.45 : 1,
          border: `1px solid ${chosen ? T.g1Border : off ? T.border : over ? T.amberBorder : T.border2}`,
          background: chosen ? T.gradSoft : over ? T.amberBg : T.glass,
        }}>
        <input type="checkbox" checked={!off} onChange={() => toggleCategory(room.id, c.categoryId)}
          title="Incluir na mensagem" style={{ accentColor: T.g1, cursor: "pointer" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{c.category}</div>
          <div style={{ fontSize: 10.5, color: T.muted }}>
            média R$ {formatBRL(custom && c.nights > 0 ? offered / c.nights : c.avgNightly)}/noite
            {custom ? " · preço oferecido" : ""}
            {over ? ` · preço de ${over.pricedPax} pessoa${over.pricedPax > 1 ? "s" : ""}` : ""}
          </div>
        </div>
        {over && (
          <span
            title={`Sem preço para ${over.requestedPax} pessoas — cotada pela tabela de ${over.pricedPax}.`}
            style={{ ...pillS(T.amberBg, T.amber, T.amberBorder), fontSize: 9, gap: 3 }}>
            <AlertTriangle size={9} /> exceção · tabela {over.pricedPax}p
          </span>
        )}
        {avail && (
          <span title={avail.freeCabins.join(", ")}
            style={pillS(
              avail.free > 0 ? T.emeraldBg : T.redBg,
              avail.free > 0 ? T.emerald : T.red,
              avail.free > 0 ? T.emeraldBorder : T.redBorder
            )}>
            {avail.free > 0 ? `${avail.free}/${avail.total} livre${avail.free > 1 ? "s" : ""}` : "Ocupada"}
          </span>
        )}
        {strike && (
          <span style={{ fontSize: 11, color: T.muted2, textDecoration: "line-through" }}>
            R$ {formatBRL(strike)}
          </span>
        )}
        <span title="Preço oferecido desta cabana — vazio volta ao tarifário"
          style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: custom ? T.amber : T.muted }}>R$</span>
          <input style={{
              ...S.input, width: 96, padding: "5px 8px", fontSize: 12.5, fontWeight: 900,
              textAlign: "right",
              borderColor: custom ? T.amberBorder : T.border2,
              color: custom ? T.amber : chosen ? T.g1 : T.text,
            }}
            inputMode="decimal" placeholder={formatBRL(c.finalTotal)}
            value={draft} onChange={(e) => setPrice(e.target.value)} />
          {custom && (
            <button onClick={() => setPrice("")} title="Voltar ao valor do tarifário"
              style={{ padding: 3, borderRadius: 7, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex" }}>
              <X size={12} />
            </button>
          )}
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
    <Dialog open onClose={requestClose} presentation="auto" size="xl" rawBody hideClose panelProps={guardProps} ariaLabel="Nova cotação">
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: T.text }}>
              {targetId ? "Editar cotação" : hasSeed ? "Nova cotação para o cliente" : "Nova cotação"}
            </div>
            {targetId && (
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
          <IconButton icon={X} label="Fechar" variant="secondary" onClick={requestClose} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 14, overscrollBehavior: "contain" }}>

          {/* Orçamento adotado no passo 2 — fica à vista até salvar, inclusive
              se o vendedor voltar para o pedido: é o que explica por que não
              vai nascer card novo no funil. */}
          {adopted && (
            <div style={{
              background: T.amberBg, border: `1px solid ${T.amberBorder}`,
              borderRadius: 12, padding: "12px 14px", display: "flex",
              flexDirection: "column", gap: 7,
            }}>
              <p style={{ fontSize: 12.5, fontWeight: 800, color: T.amber, margin: 0 }}>
                Atualizando o orçamento que já existia
              </p>
              <p style={{ fontSize: 11.5, color: T.text, margin: 0 }}>
                Pedido salvo: {fmtBR(adopted.checkIn)} → {fmtBR(adopted.checkOut)}
                {adopted.finalValue ? ` · R$ ${formatBRL(adopted.finalValue)}` : ""}
                {(adopted.checkIn !== span.checkIn || adopted.checkOut !== span.checkOut) && (
                  <b style={{ color: T.amber }}>
                    {" "}→ vai passar para {fmtBR(span.checkIn)} → {fmtBR(span.checkOut)}
                  </b>
                )}
              </p>
              {/* O valor negociado NÃO é recalculado no save — se o pedido mudou,
                  ele continua mandando no funil até a recepção revisar na ficha. */}
              {(adopted.negotiatedValue ?? 0) > 0 && (
                <p style={{ fontSize: 10.5, color: T.muted, margin: 0 }}>
                  Este orçamento tem valor negociado de{" "}
                  <b style={{ color: T.text }}>R$ {formatBRL(adopted.negotiatedValue!)}</b> — ele
                  continua valendo no funil; revise na ficha se o pedido mudou.
                </p>
              )}
              {/* Estágio, follow-up, validade e histórico do lead são preservados
                  pelo servidor (o update do saveQuote não mexe em status). */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={restoreAdopted}
                  title="Descarta o pedido digitado e volta ao que estava salvo neste orçamento"
                  style={{ ...S.ghostBtn, padding: "5px 10px", fontSize: 11 }}>
                  Usar o pedido original
                </button>
                <button onClick={undoAdopt}
                  title="Mantém tudo o que está na tela, mas salva como um lead novo"
                  style={{ ...S.ghostBtn, padding: "5px 10px", fontSize: 11 }}>
                  É outra negociação — criar novo
                </button>
              </div>
            </div>
          )}

          {step === 1 && (<>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel}>Nome do cliente *</label>
                <input style={S.input} value={name} autoFocus autoComplete="off"
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={fieldLabel}>Telefone (WhatsApp)</label>
                <input style={S.input} inputMode="tel" placeholder="Só dígitos" value={phone}
                  autoComplete="off"
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div>
                <label style={fieldLabel}>E-mail</label>
                <input style={S.input} type="email" value={email} autoComplete="off"
                  onChange={(e) => setEmail(e.target.value)} />
              </div>
              {/* Instagram: quem chega por DM não tem telefone nem e-mail — o
                  @ é o contato. Aceita colar a URL do perfil. */}
              <div>
                <label style={fieldLabel}>Instagram</label>
                <input style={S.input} value={instagram} autoComplete="off"
                  placeholder="@usuario"
                  onChange={(e) => setInstagram(e.target.value)}
                  onBlur={() => setInstagram((v) => normalizeInstagram(v) ?? v.trim())} />
              </div>
              <div>
                <label style={fieldLabel}>Documento (opcional)</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <select style={{ ...S.input, flex: "0 0 104px", background: T.card }}
                    value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                    {docTypes.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  <input style={{ ...S.input, flex: 1, minWidth: 0 }} value={document} autoComplete="off"
                    onChange={(e) => setDocument(e.target.value)} />
                </div>
              </div>
            </div>
            <p style={{ fontSize: 10.5, color: T.muted2, margin: "-6px 0 0" }}>
              Pelo menos UM meio de contato (telefone, e-mail ou Instagram) é obrigatório.
            </p>
            <div>
              <label style={fieldLabel}>Idioma do hóspede</label>
              <div style={{ display: "inline-flex", gap: 4, background: T.glass, borderRadius: 11, padding: 3 }}>
                {(["pt", "en", "es"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setLanguage(l)}
                    style={{
                      padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                      fontFamily: "inherit", fontSize: 10.5, fontWeight: 900, letterSpacing: ".06em",
                      textTransform: "uppercase",
                      background: language === l ? T.gradSoft : "transparent",
                      color: language === l ? T.g1 : T.muted,
                    }}>
                    {l}
                  </button>
                ))}
              </div>
              <span style={{ marginLeft: 10, fontSize: 10.5, color: T.muted2 }}>
                Idioma da proposta pública e da mensagem de WhatsApp — padrão PT.
              </span>
            </div>
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
            {compare && (
              <div style={{
                background: T.amberBg, border: `1px solid ${T.amberBorder}`,
                borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 800, color: T.amber, margin: 0 }}>
                    Este cliente já tem orçamento aberto
                  </p>
                  <p style={{ fontSize: 10.5, color: T.muted, margin: "3px 0 0" }}>
                    Compare os dois e decida — nada do que você preencheu se perde em
                    nenhuma das opções.
                  </p>
                </div>

                {/* Mais de um repetido: escolhe qual entra no comparativo. */}
                {dupQuotes.length > 1 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {dupQuotes.slice(0, 4).map((q) => {
                      const on = q.id === compare.id;
                      return (
                        <button key={q.id} onClick={() => setCompareId(q.id)}
                          style={{
                            padding: "4px 9px", borderRadius: 999, cursor: "pointer",
                            fontFamily: "inherit", fontSize: 10.5, fontWeight: 800,
                            background: on ? T.gradSoft : T.glass,
                            border: `1px solid ${on ? T.g1Border : T.border2}`,
                            color: on ? T.g1 : T.muted,
                          }}>
                          {fmtBR(q.checkIn)} → {fmtBR(q.checkOut)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {compareBlock(compare)}
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

            {/* Com o comparativo em tela as três saídas já estão lá; este botão
                só faz sentido para as SUGESTÕES de ficha (ou quando não há
                nenhum orçamento repetido para comparar). */}
            {(candidates.length > 0 || !compare) && (
              <button onClick={() => setStep(3)}
                style={{ ...S.ghostBtn, justifyContent: "center", padding: "10px 16px" }}>
                {candidates.length > 0 ? "Não é nenhuma dessas — seguir sem vínculo" : "Seguir mesmo assim"}
              </button>
            )}
          </>)}

          {step === 3 && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: T.muted }}>
              <b style={{ color: T.text }}>{name}</b>
              {linkedGuest && <span style={pillS(T.emeraldBg, T.emerald, T.emeraldBorder)}>hóspede vinculado</span>}
              <span>{fmtBR(span.checkIn)} → {fmtBR(span.checkOut)}</span>
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
                <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 11, padding: "9px 13px", fontSize: 12, color: T.red }}>
                  Sem regra de tarifário para {roomQuotes[0].result.uncoveredDates.length} data(s) — cadastre no Tarifário → Calendário.
                </div>
              )}
              {roomQuotes[0].result.nights > 0 && roomQuotes[0].result.nights < roomQuotes[0].result.minNightsRequired && (
                <div style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 11, padding: "9px 13px", fontSize: 12, color: T.amber }}>
                  Período exige mínimo de {roomQuotes[0].result.minNightsRequired} diárias (cotação tem {roomQuotes[0].result.nights}).
                </div>
              )}
              {(() => {
                const all = Object.values(contextByPeriod).flatMap((c) => c.events);
                return all.filter((ev, i) => all.findIndex((o) => o.title === ev.title && o.date === ev.date) === i);
              })().map((ev, i) => (
                <div key={i} style={{ background: T.blueBg, border: `1px solid ${T.blueBorder}`, borderRadius: 11, padding: "9px 13px", fontSize: 12, color: T.blue }}>
                  Evento no período: <b>{ev.title}</b> ({fmtBR(ev.date)}) — o aviso entra na mensagem.
                </div>
              ))}

              {/* Ajustes comerciais — valem para o orçamento inteiro */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={fieldLabel}>Flutuação de ocupação</label>
                  <select style={{ ...S.input, background: T.card }}
                    value={effectiveAuto ? "auto" : String(fluctuationPct)}
                    onChange={(e) => {
                      if (e.target.value === "auto") { setFluctuationAuto(true); return; }
                      setFluctuationAuto(false);
                      setFluctuationPct(Number(e.target.value));
                    }}>
                    {autoAvailable && <option value="auto">Automática (regras por período)</option>}
                    <option value="0">Padrão (0%)</option>
                    {[...bundle.settings.fluctuations].sort((a, b) => a.pct - b.pct).map((f) => (
                      <option key={f.id} value={String(f.pct)}>{f.name} ({f.pct > 0 ? "+" : ""}{f.pct}%)</option>
                    ))}
                    {/* pct órfão (preset removido / média de um auto antigo re-salvo
                        como manual): sem esta opção o select renderiza vazio. */}
                    {!effectiveAuto && fluctuationPct !== 0 &&
                      !bundle.settings.fluctuations.some((f) => f.pct === fluctuationPct) && (
                      <option value={String(fluctuationPct)}>
                        Personalizada ({fluctuationPct > 0 ? "+" : ""}{fluctuationPct}%)
                      </option>
                    )}
                  </select>
                  {effectiveAuto && (
                    <p style={{ fontSize: 10.5, color: T.muted, margin: "4px 0 0" }}>
                      {(() => {
                        const avg = roomQuotes[0]?.result.fluctuationAvgPct ?? 0;
                        const stored = seed?.fluctuationAuto ? (seed?.fluctuationPct ?? null) : null;
                        const drifted = stored !== null && Math.abs(stored - avg) > 0.01;
                        return (
                          <>
                            média no período: <b style={{ color: avg !== 0 ? T.amber : T.muted }}>
                              {avg > 0 ? "+" : ""}{avg}%
                            </b>
                            {drifted && (
                              <span style={{ color: T.amber }}>
                                {" "}· era {stored! > 0 ? "+" : ""}{stored}% quando salvo
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </p>
                  )}
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
                      {/* Marcar/desmarcar tudo de uma vez — só vale a pena com
                          mais de uma opção pra escolher. */}
                      {rq.result.categories.length > 1 && (
                        <span style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => selectAllCategories(rq.room.id)}
                            title="Oferecer todas as cabanas desta acomodação"
                            style={{
                              padding: "3px 8px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                              fontSize: 10, fontWeight: 800, border: `1px solid ${T.border2}`,
                              background: "transparent", color: T.muted,
                            }}>
                            Todas
                          </button>
                          <button onClick={() => selectNoCategories(rq.room.id, rq.result.categories.map((c) => c.categoryId))}
                            title="Desmarcar tudo — depois marque só as cabanas que quer oferecer"
                            style={{
                              padding: "3px 8px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                              fontSize: 10, fontWeight: 800, border: `1px solid ${T.border2}`,
                              background: "transparent", color: T.muted,
                            }}>
                            Nenhuma
                          </button>
                        </span>
                      )}
                      {/* Exceção de ocupação: liberada por acomodação, sempre
                          com motivo. Ligada, vira um selo com os controles. */}
                      {rq.room.allowOverCapacity ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <span title={rq.room.overCapacityReason}
                            style={{ ...pillS(T.amberBg, T.amber, T.amberBorder), fontSize: 9, gap: 3 }}>
                            <AlertTriangle size={9} /> exceção de capacidade
                          </span>
                          <button onClick={() => openOverPanel(rq.room)} title="Editar a justificativa"
                            style={{ padding: 3, borderRadius: 7, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex" }}>
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => cancelOver(rq.room)} title="Remover a exceção"
                            style={{ padding: 3, borderRadius: 7, background: "none", border: "none", color: T.muted, cursor: "pointer", display: "flex" }}>
                            <X size={11} />
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => openOverPanel(rq.room)}
                          title="Oferecer também cabanas sem preço para este número de pessoas"
                          style={{
                            padding: "3px 8px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                            fontSize: 10, fontWeight: 800, border: `1px solid ${T.border2}`,
                            background: "transparent", color: T.muted,
                            display: "inline-flex", alignItems: "center", gap: 4,
                          }}>
                          <AlertTriangle size={10} /> Fora da capacidade
                        </button>
                      )}
                      {/* Período desta acomodação */}
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                        <input type="date" value={p.checkIn}
                          title={roomQuotes.length > 1 ? "Check-in desta acomodação" : "Check-in da cotação"}
                          onChange={(e) => patchPeriod(rq.room, "checkIn", e.target.value)}
                          style={{
                            ...S.input, width: 132, padding: "5px 8px", fontSize: 11,
                            borderColor: custom ? T.g1Border : T.border2,
                            color: custom ? T.g1 : T.text,
                          }} />
                        <span style={{ fontSize: 11, color: T.muted2 }}>→</span>
                        <input type="date" value={p.checkOut}
                          title={roomQuotes.length > 1 ? "Check-out desta acomodação" : "Check-out da cotação"}
                          onChange={(e) => patchPeriod(rq.room, "checkOut", e.target.value)}
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

                    {/* Justificativa da exceção — inline, não modal: o vendedor
                        continua vendo as opções enquanto escreve. */}
                    {overDraft?.roomId === rq.room.id && (
                      <div style={{
                        background: T.amberBg, border: `1px solid ${T.amberBorder}`,
                        borderRadius: 11, padding: "11px 13px",
                        display: "flex", flexDirection: "column", gap: 7,
                      }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: T.amber, display: "flex", alignItems: "center", gap: 5 }}>
                          <AlertTriangle size={12} /> Exceção de capacidade
                        </div>
                        <p style={{ fontSize: 11, color: T.muted, margin: 0, lineHeight: 1.5 }}>
                          As cabanas sem preço para {paxLabel(rq.room)} passam a aparecer, cotadas
                          pela maior tabela de pessoas que elas têm. A justificativa fica no
                          orçamento, na timeline do lead e na auditoria.
                        </p>
                        <textarea rows={2} autoFocus
                          value={overDraft.text}
                          onChange={(e) => setOverDraft({ roomId: rq.room.id, text: e.target.value })}
                          placeholder="Ex.: criança de 4 anos dormindo com os pais — colchão extra combinado com a governança."
                          style={{ ...S.input, resize: "vertical", fontSize: 12, lineHeight: 1.45 }} />
                        <div style={{ display: "flex", gap: 7 }}>
                          <button onClick={() => setOverDraft(null)} style={{ ...S.ghostBtn, fontSize: 11, padding: "6px 12px" }}>
                            Cancelar
                          </button>
                          <button onClick={confirmOver}
                            style={{
                              padding: "6px 12px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
                              fontSize: 11, fontWeight: 800,
                              background: T.amberBg, border: `1px solid ${T.amberBorder}`, color: T.amber,
                            }}>
                            Liberar exceção
                          </button>
                        </div>
                      </div>
                    )}

                    {rq.result.categories.length === 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                        <p style={{ fontSize: 12, color: T.red, margin: 0 }}>
                          {rq.room.allowOverCapacity
                            ? "Nenhuma categoria tem preço em nenhuma ocupação neste período."
                            : `Nenhuma categoria comporta ${paxLabel(rq.room)} neste período.`}
                        </p>
                        {/* Ponto de descoberta do recurso. Some quando o problema
                            é falta de tarifa (aí exceção não resolve nada). */}
                        {!rq.room.allowOverCapacity && rq.result.uncoveredDates.length === 0 &&
                          overDraft?.roomId !== rq.room.id && (
                          <button onClick={() => openOverPanel(rq.room)}
                            style={{
                              padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                              fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 5,
                              background: T.amberBg, border: `1px solid ${T.amberBorder}`, color: T.amber,
                            }}>
                            <AlertTriangle size={11} /> Cotar fora da capacidade (exceção)
                          </button>
                        )}
                      </div>
                    ) : (<>
                      {includedOf(rq).length === 0 && (
                        <p style={{ fontSize: 11.5, color: T.red, margin: 0 }}>
                          Nenhuma cabana marcada — o cliente não teria o que escolher. Marque ao
                          menos uma abaixo antes de salvar.
                        </p>
                      )}
                      {rq.result.categories.map((c) => optionRow(rq.room, c))}
                    </>)}
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
        <div className="ak-dialog__footer" style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {step === 1 && (<>
            <button onClick={requestClose} style={S.ghostBtn}>Cancelar</button>
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
              {targetId ? "Salvar alterações" : "Salvar no funil"}
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

      {/* Cópia manual — o orçamento já está salvo; falta só a mensagem sair. */}
      <Dialog open={manualMsg !== null} onClose={() => setManualMsg(null)} presentation="auto" size="md" title="Copie a mensagem">
        {manualMsg !== null && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 11.5, color: T.muted, margin: 0, lineHeight: 1.5 }}>
              O navegador recusou a cópia automática — quase sempre é a janela ter
              perdido o foco enquanto o orçamento salvava. Ele JÁ está no funil:
              falta só levar o texto para o WhatsApp.
            </p>
            <textarea readOnly autoFocus rows={10} value={manualMsg}
              onFocus={(e) => e.currentTarget.select()}
              style={{ ...S.input, resize: "vertical", fontSize: 12, lineHeight: 1.45 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => setManualMsg(null)} style={S.ghostBtn}>Fechar</button>
              <button style={{ ...S.gradBtn, marginLeft: "auto" }}
                onClick={async () => {
                  if (!(await copyText(manualMsg))) {
                    toast.error("Selecione o texto acima e use Ctrl+C.");
                    return;
                  }
                  toast.success("Cotação copiada — com o link da proposta.");
                  setManualMsg(null);
                  setAskSent(true);
                }}>
                <Copy size={14} /> Copiar de novo
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </Dialog>
  );
}
