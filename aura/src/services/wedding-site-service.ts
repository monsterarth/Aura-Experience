// src/services/wedding-site-service.ts
//
// SUPERFÍCIE ANÔNIMA DO SITE DOS NOIVOS. Tudo aqui é alcançável por qualquer
// pessoa com um código de 6 dígitos — os convidados do casamento e quem
// receber o convite encaminhado. Isolado de propósito (mesma razão do
// rate-quote-public-service): caber numa revisão só.
//
// REGRA ÚNICA E INEGOCIÁVEL (herdada da proposta pública): o que sai é
// montado campo a campo. NUNCA devolver linha crua de weddings/rate_quotes.
// Ficam DE FORA: contrato e parcelas do casamento, telefone/e-mail do casal,
// notas internas, nomes de cabanas livres (freeCabins) e QUALQUER dado de
// outros convidados — o painel dos noivos vê contagens por categoria, nunca
// nomes.
//
// Autorização = o código. Papel decidido por qual coluna casou:
//   guestCode → convidado (simulador) · coupleCode → noivos (painel).
// Código inválido, casamento não confirmado, site desligado e módulo
// desativado dão a MESMA resposta (null) — um palpite não pode distinguir.
import { supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { CrmService } from "./crm-service";
import { RateService } from "./rate-service";
import { nightsBetween, MsgLang } from "@/lib/rate-engine";
import { computeWeddingQuote, WeddingGuestInput } from "@/lib/wedding-rate-engine";
import { parseMultiLang } from "@/lib/multilang";
import {
  MultiLangObj, RateQuoteCategory, RateQuoteRoom, Wedding, WeddingSiteConfig,
} from "@/types/aura";
import { todayPropertyIso } from "@/lib/dates";

/** Status de rate_quotes que seguram cabana no simulador (hold pendente). */
const HOLD_STATUSES = ["open", "sent", "negotiating", "won"];
/** Formulário respondido em menos que isto é robô (mesmo limiar da proposta). */
const MIN_ELAPSED_MS = 1500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type WeddingSiteRole = "guest" | "couple";

export type PublicWeddingSite = {
  role: WeddingSiteRole;
  bride: string;
  brideShort: string | null;
  groom: string;
  groomShort: string | null;
  weddingDate: string;
  window: { checkin: string; checkout: string; nights: number };
  maxExtendNights: number;
  config: {
    coverPhotoUrl: string | null;
    welcomeMessage: string | null;
    colors: { primary: string | null; background: string | null; surface: string | null } | null;
  };
  /** Política de privacidade multilíngue — o cliente escolhe o idioma na tela. */
  policy: MultiLangObj | null;
  property: {
    id: string;
    name: string;
    logoUrl: string | null;
    theme: unknown;
    whatsapp: string | null;
  };
};

export type WeddingSiteOption = {
  categoryId: string;
  name: string;
  nights: number;
  total: number;
  avgNightly: number;
  windowTotal: number;
  extensionTotal: number;
  petFee: number;
  /** Unidades livres na consulta (já descontando pré-reservas pendentes). */
  free: number;
  unitsTotal: number;
  siteUrl?: string;
};

export type WeddingSiteQuote = {
  options: WeddingSiteOption[];
  nights: number;
  windowNights: number;
  extensionNights: number;
};

export type CoupleOverviewRow = {
  categoryId: string;
  name: string;
  unitsTotal: number;
  free: number;
  /** Pré-reservas aguardando a recepção confirmar. */
  pending: number;
  /** Reservas fechadas (ganhas ou já convertidas em estadia). */
  confirmed: number;
};

type ResolvedSite = {
  wedding: Wedding;
  role: WeddingSiteRole;
  property: {
    id: string; name: string; logoUrl: string | null;
    theme: unknown; settings: Record<string, unknown>;
  };
};

/** Campos de rate_quotes que os recortes deste service leem. */
type RateQuoteRecordLite = {
  selectedCategory?: string | null;
  rooms?: { selectedCategory?: string | null }[] | null;
  status: string;
  stayId?: string | null;
};

function snapshotPax(v: unknown, min = 0): number {
  return Math.max(min, Math.floor(Number(v) || 0));
}

function sanitizeConfig(raw: unknown): PublicWeddingSite["config"] {
  const cfg = (raw ?? {}) as WeddingSiteConfig;
  const url = typeof cfg.coverPhotoUrl === "string" && /^https:\/\/\S{5,590}$/.test(cfg.coverPhotoUrl)
    ? cfg.coverPhotoUrl : null;
  const msg = typeof cfg.welcomeMessage === "string" && cfg.welcomeMessage.trim()
    ? cfg.welcomeMessage.trim().slice(0, 600) : null;
  const hex = (v: unknown) => (typeof v === "string" && HEX_COLOR.test(v) ? v.toLowerCase() : null);
  const colors = cfg.colors
    ? { primary: hex(cfg.colors.primary), background: hex(cfg.colors.background), surface: hex(cfg.colors.surface) }
    : null;
  return { coverPhotoUrl: url, welcomeMessage: msg, colors };
}

export const WeddingSiteService = {

  /**
   * Resolve um código de 6 dígitos para o casamento + papel. `null` para
   * qualquer falha — código inexistente, site desligado, casamento não
   * confirmado ou módulo desativado: a mesma resposta para todas.
   */
  async resolveCode(code: string): Promise<ResolvedSite | null> {
    if (!supabaseAdmin || !/^\d{6}$/.test(code || "")) return null;

    const { data } = await supabaseAdmin
      .from("weddings")
      .select("id, propertyId, bride, brideShort, groom, groomShort, weddingDate, status, checkin, checkout, guestCode, coupleCode, rateTableId, maxExtendNights, siteEnabled, siteConfig")
      .or(`guestCode.eq.${code},coupleCode.eq.${code}`)
      .maybeSingle();
    if (!data) return null;

    const wedding = data as Wedding;
    // Convite impresso ⇒ contrato fechado. O cron wedding-status promove a
    // 'completed' no dia seguinte ao evento — o site morre sozinho (desejado).
    if (!wedding.siteEnabled || wedding.status !== "confirmed") return null;

    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("id, name, logoUrl, theme, settings")
      .eq("id", wedding.propertyId)
      .maybeSingle();
    if (!prop) return null;

    const settings = (prop.settings ?? {}) as Record<string, unknown>;
    // Check suave do módulo, default ON (regra 1 da MODULARIZATION.md).
    if (settings.hasWeddingSite === false) return null;

    return {
      wedding,
      role: wedding.coupleCode === code ? "couple" : "guest",
      property: {
        id: prop.id, name: prop.name, logoUrl: prop.logoUrl ?? null,
        theme: prop.theme ?? null, settings,
      },
    };
  },

  /** O site como o público vê — allowlist campo a campo. */
  async getPublicSite(code: string): Promise<PublicWeddingSite | null> {
    const resolved = await this.resolveCode(code);
    if (!resolved) return null;
    const { wedding, role, property } = resolved;

    const policyRaw = property.settings.privacyPolicyText;
    const policy = policyRaw ? parseMultiLang(policyRaw) : null;
    const hasPolicy = policy && (policy.pt?.trim() || policy.en?.trim() || policy.es?.trim());

    return {
      role,
      bride: wedding.bride,
      brideShort: wedding.brideShort ?? null,
      groom: wedding.groom,
      groomShort: wedding.groomShort ?? null,
      weddingDate: wedding.weddingDate,
      window: {
        checkin: wedding.checkin,
        checkout: wedding.checkout,
        nights: nightsBetween(wedding.checkin, wedding.checkout),
      },
      maxExtendNights: Math.max(0, Number(wedding.maxExtendNights) || 0),
      config: sanitizeConfig(wedding.siteConfig),
      policy: hasPolicy ? policy : null,
      property: {
        id: property.id,
        name: property.name,
        logoUrl: property.logoUrl,
        theme: property.theme,
        whatsapp:
          (property.settings.whatsappNumber as string) ||
          (property.settings.contactPhone as string) || null,
      },
    };
  },

  /**
   * Disponibilidade por categoria no intervalo, JÁ descontando as
   * pré-reservas pendentes do casamento (soft-block: dois convidados não
   * podem "comprar" a última cabana ao mesmo tempo). Quote com stayId é
   * excluído do desconto — a estadia criada já ocupa na disponibilidade real.
   */
  async getAvailability(
    wedding: Pick<Wedding, "id" | "propertyId">,
    checkIn: string,
    checkOut: string
  ): Promise<Record<string, { total: number; free: number }>> {
    const ctx = await RateService.getQuoteContext(wedding.propertyId, checkIn, checkOut);

    const { data: holds } = await supabaseAdmin!
      .from("rate_quotes")
      .select("selectedCategory, rooms, status, stayId")
      .eq("weddingId", wedding.id)
      .in("status", HOLD_STATUSES)
      .is("stayId", null);

    const heldByCategory: Record<string, number> = {};
    for (const h of (holds || []) as RateQuoteRecordLite[]) {
      const cat = h.rooms?.[0]?.selectedCategory ?? h.selectedCategory;
      if (cat) heldByCategory[cat] = (heldByCategory[cat] || 0) + 1;
    }

    const out: Record<string, { total: number; free: number }> = {};
    for (const [categoryId, av] of Object.entries(ctx.availability)) {
      out[categoryId] = {
        total: av.total,
        free: Math.max(0, av.free - (heldByCategory[categoryId] || 0)),
      };
    }
    return out;
  },

  /**
   * Cotação do convidado. Regras fechadas em plano:
   * - janela cheia obrigatória (o convidado não encurta o evento);
   * - extensão até maxExtendNights por lado;
   * - pagantes 1..6 (grupo maior fala com a recepção — nunca overCapacity
   *   numa superfície pública).
   * Erros voltam como CÓDIGO de máquina — o cliente traduz (PT/EN/ES).
   */
  async quoteForGuest(
    code: string,
    input: WeddingGuestInput,
    /** Dados do tarifário já carregados (a pré-reserva reaproveita para o
     *  preço travado e o snapshot saírem do MESMO recorte). */
    preloaded?: { resolved: ResolvedSite; data: Awaited<ReturnType<typeof RateService.getRateData>> }
  ): Promise<{ ok: true; quote: WeddingSiteQuote } | { ok: false; error: string }> {
    const resolved = preloaded?.resolved ?? await this.resolveCode(code);
    if (!resolved) return { ok: false, error: "not_found" };
    const { wedding } = resolved;

    if (!ISO_DATE.test(input.checkIn || "") || !ISO_DATE.test(input.checkOut || "") || input.checkIn >= input.checkOut) {
      return { ok: false, error: "invalid_dates" };
    }
    if (input.checkIn > wedding.checkin || input.checkOut < wedding.checkout) {
      return { ok: false, error: "window_required" };
    }
    const maxExtend = Math.max(0, Number(wedding.maxExtendNights) || 0);
    if (nightsBetween(input.checkIn, wedding.checkin) > maxExtend ||
        nightsBetween(wedding.checkout, input.checkOut) > maxExtend) {
      return { ok: false, error: "extend_limit" };
    }

    const adults = snapshotPax(input.adults);
    const children = snapshotPax(input.children);
    const babies = Math.min(6, snapshotPax(input.babies));
    const pets = Math.min(5, snapshotPax(input.pets));
    if (adults < 1) return { ok: false, error: "invalid_pax" };
    if (adults + children > 6) return { ok: false, error: "too_many_guests" };

    if (!wedding.rateTableId) return { ok: false, error: "rate_unavailable" };
    const data = preloaded?.data ?? await RateService.getRateData(wedding.propertyId);
    if (!data.tables.some((t) => t.id === wedding.rateTableId)) {
      return { ok: false, error: "rate_unavailable" };
    }

    const result = computeWeddingQuote(
      { checkIn: input.checkIn, checkOut: input.checkOut, adults, children, babies, pets },
      { checkin: wedding.checkin, checkout: wedding.checkout, rateTableId: wedding.rateTableId },
      data
    );
    if (result.uncoveredDates.length > 0) return { ok: false, error: "uncovered" };
    // Extensão que joga a estadia abaixo do mínimo de diárias do período (ex.:
    // 1 noite de Réveillon com minNights 4): na página pública não há vendedor
    // para ver o aviso, então a cotação é bloqueada em vez de prometer preço.
    if (result.nights < result.minNightsRequired) return { ok: false, error: "min_nights" };
    // Noite sem preço soma 0 no motor (no funil o vendedor vê daysWithoutPrice
    // e decide) — numa página PÚBLICA isso seria preço subcobrado prometido ao
    // convidado. Opção com buraco de preço não sai.
    const priced = result.options.filter((o) => o.daysWithoutPrice === 0);
    if (priced.length === 0) return { ok: false, error: "no_options" };

    const availability = await this.getAvailability(wedding, input.checkIn, input.checkOut);
    const siteUrlOf = (categoryId: string) =>
      data.categories.find((c) => c.id === categoryId)?.siteUrl || undefined;

    return {
      ok: true,
      quote: {
        nights: result.nights,
        windowNights: result.windowNights,
        extensionNights: result.extensionNights,
        options: priced.map((o) => ({
          categoryId: o.categoryId,
          name: o.category,
          nights: o.nights,
          total: o.finalTotal,
          avgNightly: o.avgNightly,
          windowTotal: o.windowTotal,
          extensionTotal: o.extensionTotal,
          petFee: o.petFee,
          free: availability[o.categoryId]?.free ?? 0,
          unitsTotal: availability[o.categoryId]?.total ?? 0,
          ...(siteUrlOf(o.categoryId) ? { siteUrl: siteUrlOf(o.categoryId) } : {}),
        })),
      },
    };
  },

  /**
   * A pré-reserva: recalcula TUDO no servidor (nada de preço vindo do
   * cliente), revalida a vaga e grava um rate_quote no funil comercial com o
   * weddingId — hold sem validade (expiresAt null: a recepção decide) e com
   * priceOverrides travando o preço do casamento contra recálculo acidental.
   */
  async createPreReservation(input: {
    code: string;
    checkIn: string; checkOut: string;
    adults: number; children: number; babies: number; pets: number;
    categoryId: string;
    clientName: string;
    clientPhone: string;
    clientEmail?: string | null;
    lang?: string | null;
    policyAccepted?: boolean;
    elapsedMs?: number;
    website?: string;           // honeypot
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<{ ok: boolean; error?: string; summary?: { category: string; total: number; checkIn: string; checkOut: string } }> {
    const resolved = await this.resolveCode(input.code);
    if (!resolved) return { ok: false, error: "not_found" };
    const { wedding, property } = resolved;

    // Robô: engole em silêncio (o convidado honesto nunca cai aqui).
    if (input.website || (input.elapsedMs != null && input.elapsedMs < MIN_ELAPSED_MS)) {
      return { ok: true };
    }

    const clientName = (input.clientName || "").trim().replace(/\s+/g, " ").slice(0, 120);
    const clientPhone = (input.clientPhone || "").replace(/\D/g, "");
    const clientEmail = (input.clientEmail || "").trim().slice(0, 160) || null;
    if (clientName.length < 3) return { ok: false, error: "missing_name" };
    if (clientPhone.length < 8 || clientPhone.length > 15) return { ok: false, error: "missing_phone" };
    if (clientEmail && !/^\S+@\S+\.\S+$/.test(clientEmail)) return { ok: false, error: "invalid_email" };

    // LGPD: quando a propriedade tem política de privacidade, aceitar é
    // condição da pré-reserva (a prova vai no payload da timeline).
    const policy = parseMultiLang(property.settings.privacyPolicyText);
    const hasPolicy = !!(policy.pt?.trim() || policy.en?.trim() || policy.es?.trim());
    if (hasPolicy && !input.policyAccepted) return { ok: false, error: "policy_required" };

    // Recalcula no servidor — do cliente vem só a COMPOSIÇÃO pedida. Um único
    // getRateData alimenta a cotação E o snapshot: preço travado e breakdown
    // saem do mesmo recorte (sem janela de divergência entre duas leituras).
    const data = await RateService.getRateData(wedding.propertyId);
    const quoted = await this.quoteForGuest(input.code, input, { resolved, data });
    if (!quoted.ok) return quoted;
    const option = quoted.quote.options.find((o) => o.categoryId === input.categoryId);
    if (!option) return { ok: false, error: "invalid_option" };
    if (option.free <= 0) return { ok: false, error: "sold_out" };

    // Anti-duplicata: o mesmo WhatsApp não abre duas pré-reservas pendentes.
    const { data: dup } = await supabaseAdmin!
      .from("rate_quotes")
      .select("id")
      .eq("weddingId", wedding.id)
      .eq("clientPhone", clientPhone)
      .in("status", HOLD_STATUSES)
      .is("stayId", null)
      .limit(1);
    if (dup && dup.length > 0) return { ok: false, error: "duplicate" };

    const snapshotCat = this.buildSnapshotCategory(wedding, input, data, option.categoryId);

    const room: RateQuoteRoom = {
      id: crypto.randomUUID(),
      label: null,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      adults: snapshotPax(input.adults, 1),
      children: snapshotPax(input.children),
      babies: Math.min(6, snapshotPax(input.babies)),
      pets: Math.min(5, snapshotPax(input.pets)),
      options: [snapshotCat],
      selectedCategory: option.categoryId,
      // Trava comercial: o preço do casamento sobrevive a um re-save da
      // recepção pelo wizard (comportamento documentado do saveQuote).
      priceOverrides: { [option.categoryId]: option.total },
    };

    const channels = await CrmService.getChannels(wedding.propertyId);
    const source = channels.some((c) => c.id === "evento") ? "evento" : null;
    const language: MsgLang = input.lang === "en" || input.lang === "es" ? input.lang : "pt";
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const { error } = await supabaseAdmin!.from("rate_quotes").insert({
      id,
      propertyId: wedding.propertyId,
      clientName,
      clientPhone,
      clientEmail,
      clientLanguage: language,
      weddingId: wedding.id,
      source,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      adults: room.adults,
      children: room.children,
      babies: room.babies,
      pets: room.pets,
      fluctuationPct: 0,
      // A coluna só existe com a migration da fase 4 aplicada (mesmo guarda
      // do saveQuote).
      ...(data.fluctuations !== null ? { fluctuationAuto: false } : {}),
      discountIds: [],
      adhocValue: 0,
      adhocType: "pct",
      rooms: [room],
      snapshot: [snapshotCat],
      selectedCategory: option.categoryId,
      finalValue: option.total,
      status: "open",
      // Hold SEM validade: o cron crm-status só arquiva expiresAt NÃO-nulo
      // vencido (ou checkIn passado — a limpeza pós-evento vem de graça).
      followUpAt: null,
      expiresAt: null,
      sentAt: null,
      notes: null,
      createdBy: "wedding-site",
      createdByName: "Site do casamento — convidado",
      createdAt: now,
      updatedAt: now,
    });
    if (error) {
      console.error("[wedding-site] Falha ao gravar pré-reserva:", error.message);
      return { ok: false, error: "server_error" };
    }

    const couple = `${wedding.bride} & ${wedding.groom}`;
    await CrmService.logInteraction(wedding.propertyId, "quote", id, "created", {
      actorId: "client", actorName: clientName,
      note: `Pré-reserva pelo site do casamento (${couple}) — ${option.name} · R$ ${option.total.toFixed(2)}.`,
      payload: {
        via: "wedding-site", weddingId: wedding.id, categoryId: option.categoryId,
        total: option.total, checkIn: input.checkIn, checkOut: input.checkOut,
        ip: input.ip ?? null, userAgent: input.userAgent ?? null,
        policyAccepted: hasPolicy ? true : null,
      },
    });

    // Fila de hoje do CRM — é o que faz a recepção agir (padrão do aceite da
    // proposta pública; sem push, por desenho).
    const today = todayPropertyIso();
    await CrmService.createAlarm(wedding.propertyId, {
      entityType: "quote", entityId: id, entityLabel: clientName,
      kind: "follow_up",
      title: `Pré-reserva de casamento — confirmar ${clientName}`,
      note: `${couple} · ${option.name} · ${input.checkIn} → ${input.checkOut} · R$ ${option.total.toFixed(2)}`,
      dueAt: today,
    }, { id: "client", name: clientName }).catch(() => {});

    await AuditService.log({
      propertyId: wedding.propertyId, userId: "client", userName: clientName,
      action: "CREATE", entity: "RATE_QUOTE", entityId: id,
      details: `Pré-reserva pelo site do casamento ${couple}: ${option.name} · ${input.checkIn} → ${input.checkOut} · R$ ${option.total.toFixed(2)}.`,
    });

    return {
      ok: true,
      summary: { category: option.name, total: option.total, checkIn: input.checkIn, checkOut: input.checkOut },
    };
  },

  /**
   * Snapshot de RateQuoteCategory para o funil — reconstruído do MOTOR (não
   * da resposta pública) para carregar o breakdown completo.
   */
  buildSnapshotCategory(
    wedding: Wedding,
    input: WeddingGuestInput,
    data: Awaited<ReturnType<typeof RateService.getRateData>>,
    categoryId: string
  ): RateQuoteCategory {
    const result = computeWeddingQuote(
      {
        checkIn: input.checkIn, checkOut: input.checkOut,
        adults: snapshotPax(input.adults, 1), children: snapshotPax(input.children),
        babies: Math.min(6, snapshotPax(input.babies)), pets: Math.min(5, snapshotPax(input.pets)),
      },
      { checkin: wedding.checkin, checkout: wedding.checkout, rateTableId: wedding.rateTableId! },
      data
    );
    const full = result.options.find((o) => o.categoryId === categoryId);
    if (!full) {
      // Não deveria acontecer (a opção veio do mesmo motor + mesmo `data`),
      // mas um throw aqui viraria 500 numa rota pública. Snapshot mínimo.
      return {
        categoryId, category: categoryId, nights: nightsBetween(input.checkIn, input.checkOut),
        rawTotal: 0, finalTotal: 0, avgNightly: 0,
        breakdown: [], periodNights: {}, daysWithoutPrice: 0,
      };
    }
    const { windowTotal: _w, extensionTotal: _e, petFee: _p, ...cat } = full;
    return cat;
  },

  /** Painel dos noivos: ocupação por categoria — contagens, nunca nomes. */
  async getCoupleOverview(code: string): Promise<{ categories: CoupleOverviewRow[] } | null> {
    const resolved = await this.resolveCode(code);
    if (!resolved || resolved.role !== "couple") return null;
    const { wedding } = resolved;

    const [availability, quotesRes, cats] = await Promise.all([
      this.getAvailability(wedding, wedding.checkin, wedding.checkout),
      supabaseAdmin!
        .from("rate_quotes")
        .select("selectedCategory, rooms, status, stayId")
        .eq("weddingId", wedding.id)
        .in("status", HOLD_STATUSES),
      supabaseAdmin!
        .from("cabin_categories")
        .select('id, name, "shortName", "order"')
        .eq("propertyId", wedding.propertyId)
        .order("order"),
    ]);

    const pending: Record<string, number> = {};
    const confirmed: Record<string, number> = {};
    for (const q of (quotesRes.data || []) as RateQuoteRecordLite[]) {
      const cat = q.rooms?.[0]?.selectedCategory ?? q.selectedCategory;
      if (!cat) continue;
      if (q.stayId || q.status === "won") confirmed[cat] = (confirmed[cat] || 0) + 1;
      else pending[cat] = (pending[cat] || 0) + 1;
    }

    const categories: CoupleOverviewRow[] = ((cats.data || []) as { id: string; name: string; shortName?: string | null }[])
      .filter((c) => availability[c.id])
      .map((c) => ({
        categoryId: c.id,
        name: c.shortName?.trim() || c.name,
        unitsTotal: availability[c.id].total,
        free: availability[c.id].free,
        pending: pending[c.id] || 0,
        confirmed: confirmed[c.id] || 0,
      }));

    return { categories };
  },

  /**
   * Personalização pelos noivos — allowlist estrita: foto de capa (https),
   * mensagem (600 chars) e 3 cores (hex). Qualquer outra chave é ignorada.
   */
  async saveCoupleConfig(
    code: string,
    patch: { coverPhotoUrl?: unknown; welcomeMessage?: unknown; colors?: unknown }
  ): Promise<{ ok: boolean; error?: string; config?: PublicWeddingSite["config"] }> {
    const resolved = await this.resolveCode(code);
    if (!resolved || resolved.role !== "couple") return { ok: false, error: "not_found" };
    const { wedding } = resolved;

    const current = (wedding.siteConfig ?? {}) as WeddingSiteConfig;
    const next: WeddingSiteConfig = { ...current };

    if ("coverPhotoUrl" in patch) {
      next.coverPhotoUrl = typeof patch.coverPhotoUrl === "string" && /^https:\/\/\S{5,590}$/.test(patch.coverPhotoUrl)
        ? patch.coverPhotoUrl : null;
    }
    if ("welcomeMessage" in patch) {
      next.welcomeMessage = typeof patch.welcomeMessage === "string" && patch.welcomeMessage.trim()
        ? patch.welcomeMessage.trim().slice(0, 600) : null;
    }
    if ("colors" in patch) {
      const c = (patch.colors ?? {}) as Record<string, unknown>;
      const hex = (v: unknown) => (typeof v === "string" && HEX_COLOR.test(v) ? v.toLowerCase() : null);
      const colors = {
        primary: hex(c.primary), background: hex(c.background), surface: hex(c.surface),
      };
      next.colors = colors.primary || colors.background || colors.surface ? colors : null;
    }

    const { error } = await supabaseAdmin!
      .from("weddings")
      .update({ siteConfig: next, updatedAt: new Date().toISOString() })
      .eq("id", wedding.id)
      .eq("propertyId", wedding.propertyId);
    if (error) {
      console.error("[wedding-site] Falha ao salvar personalização:", error.message);
      return { ok: false, error: "server_error" };
    }

    await AuditService.log({
      propertyId: wedding.propertyId, userId: "couple", userName: `${wedding.bride} & ${wedding.groom}`,
      action: "UPDATE", entity: "WEDDING", entityId: wedding.id,
      details: "Personalização do site atualizada pelos noivos.",
    });

    return { ok: true, config: sanitizeConfig(next) };
  },
};
