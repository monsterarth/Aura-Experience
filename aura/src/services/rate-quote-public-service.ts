// src/services/rate-quote-public-service.ts
//
// SUPERFÍCIE ANÔNIMA DA PROPOSTA COMERCIAL. Tudo aqui é alcançável por
// qualquer pessoa com o link /cotacao/<id> — o cliente, e quem ele
// encaminhar. Isolado de propósito, para caber numa revisão só.
//
// REGRA ÚNICA E INEGOCIÁVEL: o que sai é montado campo a campo. NUNCA
// devolver a linha de `rate_quotes` crua. Ficam DE FORA: clientDocument
// (CPF), negotiatedValue, notes, source, createdBy, lostReason e o
// `breakdown` de cada opção (que expõe a régua de desconto interna).
// `rawTotal` só sai quando for MAIOR que o final — é o "de/por" comercial.
//
// A tabela tem RLS `TO authenticated`, então estas consultas rodam com
// service-role: a allowlist é a única defesa.
import { supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { CrmService } from "./crm-service";
import { resolveRoomValue } from "@/lib/rate-engine";
import { parseMultiLang } from "@/lib/multilang";
import { RateQuoteCategory, RateQuoteRecord, RateQuoteRoom } from "@/types/aura";

/** Status em que a proposta ainda pode ser vista/aceita pelo cliente. */
const OPEN_STATUSES = ["open", "sent", "negotiating"];
/** Formulário respondido em menos que isto é robô. */
const MIN_ELAPSED_MS = 1500;

export type PublicQuoteOption = {
  categoryId: string;
  name: string;
  nights: number;
  total: number;
  avgNightly: number;
  /** Só quando houve desconto (o "de" do de/por). */
  wasTotal?: number;
  siteUrl?: string;
};

export type PublicQuoteRoom = {
  id: string;
  label: string;
  /** Período desta acomodação (pode diferir: chegadas escalonadas). */
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  babies: number;
  pets: number;
  options: PublicQuoteOption[];
  selectedCategory: string | null;
  /** Valor fechado com o cliente para esta acomodação (vence a tabela). */
  negotiatedValue: number | null;
};

export type PublicQuoteView = {
  id: string;
  clientFirstName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  /**
   * Acomodações com períodos DIFERENTES entre si. Regra de exibição: quando
   * false, o período aparece só no cabeçalho; quando true, some do cabeçalho
   * e aparece em TODAS as acomodações (inclusive a que coincide com o span).
   */
  mixedPeriods: boolean;
  rooms: PublicQuoteRoom[];
  /** Total com as escolhas atuais; approximate = ainda falta escolher. */
  total: number;
  approximate: boolean;
  acceptedAt: string | null;
  expiresAt: string | null;
  /** Regras da pousada (settings.generalPolicyText) — aceite obrigatório. */
  policyText: string | null;
  property: {
    id: string;
    name: string;
    logoUrl: string | null;
    theme: unknown;
    whatsapp: string | null;
  };
};

/** Normaliza o registro (orçamentos antigos não têm `rooms`). */
function roomsOf(q: RateQuoteRecord): RateQuoteRoom[] {
  if (q.rooms && q.rooms.length > 0) return q.rooms;
  if (!q.snapshot?.length) return [];
  return [{
    id: "legacy", label: null,
    adults: q.adults, children: q.children, babies: q.babies, pets: q.pets,
    options: q.snapshot, selectedCategory: q.selectedCategory ?? null,
  }];
}

/**
 * Regras da pousada como texto. As políticas são MULTILÍNGUES no banco
 * (`{pt,en,es}` — ver lib/multilang), não string: tratar como string quebrava
 * a página inteira em propriedades que já tinham a política preenchida.
 * A proposta é em PT; cai para outro idioma só se o PT estiver vazio.
 */
function policyTextOf(settings: unknown): string | null {
  const raw = (settings as { generalPolicyText?: unknown } | null)?.generalPolicyText;
  if (!raw) return null;
  const ml = parseMultiLang(raw);
  return (ml.pt || ml.en || ml.es || "").trim() || null;
}

function publicOption(c: RateQuoteCategory, siteUrl?: string): PublicQuoteOption {
  return {
    categoryId: c.categoryId || c.category,
    name: c.category,
    nights: c.nights,
    total: c.finalTotal,
    avgNightly: c.avgNightly,
    ...(c.rawTotal > c.finalTotal + 5 ? { wasTotal: c.rawTotal } : {}),
    ...(siteUrl ? { siteUrl } : {}),
  };
}

export const RateQuotePublicService = {
  /**
   * A proposta como o cliente vê. `null` quando o id não resolve, quando o
   * orçamento não está mais aberto (ganho/perdido) ou quando a validade
   * passou — a mesma resposta para os três: um palpite não pode distinguir
   * "não existe" de "existe mas fechou".
   */
  async getPublicQuote(id: string): Promise<PublicQuoteView | null> {
    if (!supabaseAdmin || !id) return null;

    const { data } = await supabaseAdmin
      .from("rate_quotes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;

    const q = data as RateQuoteRecord;
    if (!OPEN_STATUSES.includes(q.status)) return null;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    if (q.expiresAt && q.expiresAt < today) return null;

    const rooms = roomsOf(q);
    if (rooms.length === 0) return null;

    // Link do site por categoria (o cliente quer ver a cabana).
    const { data: cats } = await supabaseAdmin
      .from("cabin_categories")
      .select("id, siteUrl")
      .eq("propertyId", q.propertyId);
    const siteUrlOf = (categoryId: string) =>
      (cats ?? []).find((c) => c.id === categoryId)?.siteUrl || undefined;

    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("id, name, logoUrl, theme, settings")
      .eq("id", q.propertyId)
      .maybeSingle();

    let total = 0;
    let approximate = false;
    for (const room of rooms) {
      const r = resolveRoomValue(room);
      total += r.value;
      if (r.approximate) approximate = true;
    }

    // Períodos mistos = comparação entre as acomodações (não contra o span):
    // com chegada escalonada, a que casa com o span também precisa mostrar a
    // própria data, senão o cliente lê a dela como se fosse a do grupo.
    const periodKey = (r: RateQuoteRoom) => `${r.checkIn || q.checkIn}|${r.checkOut || q.checkOut}`;
    const mixedPeriods = new Set(rooms.map(periodKey)).size > 1;

    const settings = (property?.settings ?? {}) as {
      whatsappNumber?: string; contactPhone?: string;
    };

    return {
      id: q.id,
      // Só o primeiro nome — o link pode ser encaminhado.
      clientFirstName: (q.clientName || "").trim().split(/\s+/)[0] || "",
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      nights: rooms[0]?.options[0]?.nights ?? 0,
      mixedPeriods,
      rooms: rooms.map((room, i) => ({
        id: room.id,
        label: room.label?.trim() || (rooms.length > 1 ? `Acomodação ${i + 1}` : "Sua cabana"),
        checkIn: room.checkIn || q.checkIn,
        checkOut: room.checkOut || q.checkOut,
        nights: room.options[0]?.nights ?? 0,
        adults: room.adults, children: room.children,
        babies: room.babies, pets: room.pets,
        options: room.options.map((c) => publicOption(c, siteUrlOf(c.categoryId))),
        selectedCategory: room.selectedCategory ?? null,
        negotiatedValue: room.negotiatedValue ?? null,
      })),
      total,
      approximate,
      acceptedAt: q.acceptedAt ?? null,
      expiresAt: q.expiresAt ?? null,
      policyText: policyTextOf(property?.settings),
      property: {
        id: property?.id ?? q.propertyId,
        name: property?.name ?? "",
        logoUrl: property?.logoUrl ?? null,
        theme: property?.theme ?? null,
        whatsapp: settings.whatsappNumber || settings.contactPhone || null,
      },
    };
  },

  /**
   * O cliente escolheu e aceitou. Grava as escolhas (validadas contra as
   * opções já calculadas — preço NUNCA vem do cliente), carimba `acceptedAt`,
   * empurra o lead para "negociando", registra na timeline com IP/UA e cria
   * o alarme de hoje para a recepção confirmar.
   *
   * Devolve sempre `{ ok: true }` quando a proposta existe — mesmo em
   * bloqueio de robô — para não virar oráculo.
   */
  async acceptQuote(input: {
    id: string;
    selections: { roomId: string; categoryId: string }[];
    /** Aceite explícito das regras da pousada (quando há texto). */
    policyAccepted?: boolean;
    elapsedMs?: number;
    website?: string;           // honeypot
    ip?: string;
    userAgent?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!supabaseAdmin || !input.id) return { ok: false, error: "Proposta não encontrada." };

    const { data } = await supabaseAdmin
      .from("rate_quotes").select("*").eq("id", input.id).maybeSingle();
    if (!data) return { ok: false, error: "Proposta não encontrada." };

    const q = data as RateQuoteRecord;
    if (!OPEN_STATUSES.includes(q.status)) return { ok: false, error: "Esta proposta não está mais disponível." };
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    if (q.expiresAt && q.expiresAt < today) return { ok: false, error: "Esta proposta venceu — fale com a pousada." };

    // Robô: engole em silêncio (o cliente honesto nunca cai aqui).
    if (input.website || (input.elapsedMs != null && input.elapsedMs < MIN_ELAPSED_MS)) {
      return { ok: true };
    }

    // Regras da pousada: quando existem, aceitá-las é condição do aceite.
    const { data: propRow } = await supabaseAdmin
      .from("properties").select("settings").eq("id", q.propertyId).maybeSingle();
    const policyText = policyTextOf(propRow?.settings);
    if (policyText && !input.policyAccepted) {
      return { ok: false, error: "É preciso aceitar as regras da pousada." };
    }

    const rooms = roomsOf(q);
    if (rooms.length === 0) return { ok: false, error: "Proposta sem opções." };

    // Cada acomodação precisa de uma escolha VÁLIDA (existente nas opções).
    const next: RateQuoteRoom[] = [];
    for (const room of rooms) {
      const pick = input.selections.find((s) => s.roomId === room.id);
      if (!pick) return { ok: false, error: "Escolha uma cabana para cada acomodação." };
      const option = room.options.find(
        (c) => c.categoryId === pick.categoryId || c.category === pick.categoryId
      );
      if (!option) return { ok: false, error: "Opção inválida." };
      next.push({ ...room, selectedCategory: option.categoryId || option.category });
    }

    const total = next.reduce((s, r) => s + resolveRoomValue(r).value, 0);
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("rate_quotes")
      .update({
        rooms: next,
        selectedCategory: next[0].selectedCategory,
        finalValue: total,
        acceptedAt: now,
        // Aceite não é venda fechada: ainda falta a recepção confirmar.
        status: q.status === "negotiating" ? q.status : "negotiating",
        updatedAt: now,
      })
      .eq("id", q.id);
    if (error) return { ok: false, error: "Não foi possível registrar o aceite." };

    const clientName = q.clientName || "Cliente";
    await CrmService.logInteraction(q.propertyId, "quote", q.id, "client_accepted", {
      actorId: "client", actorName: clientName,
      note: `Aceite pela proposta pública — R$ ${total.toFixed(2)}.`,
      payload: {
        total,
        rooms: next.map((r) => ({ roomId: r.id, categoryId: r.selectedCategory })),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        // Prova do aceite das regras: o tamanho do texto vigente identifica a
        // versão sem inchar o histórico com o texto inteiro.
        policyAccepted: policyText ? true : null,
        policyLength: policyText ? policyText.length : null,
      },
    });

    // Cai na Fila de hoje do CRM — é o que faz alguém agir.
    await CrmService.createAlarm(q.propertyId, {
      entityType: "quote", entityId: q.id, entityLabel: clientName,
      kind: "follow_up",
      title: `Proposta aceita — confirmar reserva de ${clientName}`,
      note: `Cliente escolheu na página da proposta · R$ ${total.toFixed(2)}`,
      dueAt: today,
    }, { id: "client", name: clientName }).catch(() => {});

    await AuditService.log({
      propertyId: q.propertyId, userId: "client", userName: clientName,
      action: "UPDATE", entity: "RATE_QUOTE", entityId: q.id,
      details: `Proposta aceita pelo cliente na página pública (R$ ${total.toFixed(2)}).`,
    });

    return { ok: true };
  },
};
