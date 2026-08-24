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
// `overCapacity` SAI de propósito: é o que sustenta o aviso de ocupação
// estendida — o cliente tem que saber que a cabana é preparada para menos
// gente ANTES de aceitar. A justificativa interna (`overCapacityReason`) fica
// de fora, como todo o resto do raciocínio comercial.
//
// A tabela tem RLS `TO authenticated`, então estas consultas rodam com
// service-role: a allowlist é a única defesa.
import { supabaseAdmin } from "@/lib/supabase";
import { AuditService } from "./audit-service";
import { CrmService } from "./crm-service";
import {
  offeredTotal, resolveRoomValue, roomDisplayName, MsgLang, DEFAULT_PAYMENT_OPTIONS,
  paymentLabel, paymentTotal,
} from "@/lib/rate-engine";
import { parseMultiLang } from "@/lib/multilang";
import { maxPetsOf, PET_HARD_CAP } from "@/lib/pets";
import { normalizeDocument } from "@/lib/guest-doc";
import { validateCPF } from "@/lib/utils-checkin";
import { NOTIFICATION_ALERT_ROLES } from "@/lib/notifications";
import { fanOutByRole } from "@/lib/push-notify";
import {
  PetDetails, QuoteIntake, QuoteIntakeCompanion, RatePaymentOption,
  RateQuoteCategory, RateQuoteRecord, RateQuoteRoom,
} from "@/types/aura";

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
  /** Cabana vendida em ocupação estendida — rende o aviso na opção. */
  overCapacity?: { requestedPax: number; pricedPax: number };
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
  /** Idioma falado pelo hóspede (escolhido pelo vendedor no wizard) — a
   *  página abre nele; o hóspede pode trocar por conta própria na tela. */
  language: MsgLang;
  rooms: PublicQuoteRoom[];
  /** Total com as escolhas atuais; approximate = ainda falta escolher. */
  total: number;
  approximate: boolean;
  acceptedAt: string | null;
  expiresAt: string | null;
  /** "O que está incluso" (rate_settings.inclusionsText) — uma linha por item. */
  inclusions: string[];
  /** Regras da pousada (settings.generalPolicyText) — aceite obrigatório. */
  policyText: string | null;
  /** Política de privacidade (settings.privacyPolicyText) — consentimento do cadastro. */
  privacyPolicyText: string | null;
  /**
   * O cadastro do titular JÁ chegou. Só o booleano sai daqui: o link é
   * encaminhável e o que o cliente digitou (CPF, endereço) nunca volta à tela.
   */
  intakeDone: boolean;
  /** Condições de pagamento oferecidas no cadastro, já no idioma do hóspede. */
  paymentOptions: { id: string; label: string; discountPct: number }[];
  /**
   * Casamento que cruza o período. Nomes do casal e a foto de capa já são
   * públicos no site dos noivos — o resto da negociação do casamento não sai
   * daqui. `guest` = este orçamento é de CONVIDADO (vinculado ou com origem
   * Evento/Casamento); só ele muda a frase de "haverá um casamento" para
   * "vocês são convidados".
   */
  wedding: { couple: string; photoUrl: string | null; guest: boolean } | null;
  /** Pets cotados (0 = a proposta não previu pet — informar um muda o preço). */
  petsQuoted: number;
  /** Política de pets da propriedade — rege os avisos do bloco de pet. */
  petRules: { accepts: boolean; maxPets: number; minWeight: number | null; maxWeight: number | null };
  /**
   * Aviso de ocupação estendida — true quando ALGUMA opção de alguma
   * acomodação foi cotada em exceção. O TEXTO (traduzido) mora no dicionário
   * do próprio ProposalClient — aqui só decide SE ele aparece.
   */
  overCapacityNotice: boolean;
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
 * Prefere o idioma do hóspede; cai para PT → EN → ES conforme o que estiver
 * preenchido (também serve para `acceptQuote` só checar "existe alguma
 * política", sem lang específico).
 */
function policyTextOf(settings: unknown, lang: MsgLang = "pt"): string | null {
  const raw = (settings as { generalPolicyText?: unknown } | null)?.generalPolicyText;
  if (!raw) return null;
  const ml = parseMultiLang(raw);
  return (ml[lang] || ml.pt || ml.en || ml.es || "").trim() || null;
}

/**
 * Condições de pagamento da propriedade. Consulta isolada e à prova da coluna
 * ainda não existir (migration crm_intake_proposta pendente) — nesse caso vale
 * o padrão do código.
 */
async function loadPaymentOptions(propertyId: string): Promise<RatePaymentOption[]> {
  const { data, error } = await supabaseAdmin!
    .from("rate_settings")
    .select("paymentOptions")
    .eq("propertyId", propertyId)
    .maybeSingle();
  if (error) return DEFAULT_PAYMENT_OPTIONS;
  const list = (data as { paymentOptions?: RatePaymentOption[] | null } | null)?.paymentOptions;
  return list?.length ? list : DEFAULT_PAYMENT_OPTIONS;
}

/**
 * O casamento por trás da proposta: o vinculado (`weddingId`) ou, na falta
 * dele, um que cruze as datas. Pré-reserva conta junto do confirmado — a data
 * já está segurada. Coluna nova ausente devolve null em vez de derrubar a
 * proposta inteira.
 */
async function loadWedding(
  q: RateQuoteRecord
): Promise<PublicQuoteView["wedding"]> {
  const guest = !!q.weddingId || q.source === "evento";
  let query = supabaseAdmin!
    .from("weddings")
    .select("id, bride, groom, siteConfig")
    .eq("propertyId", q.propertyId);

  query = q.weddingId
    ? query.eq("id", q.weddingId)
    : query.in("status", ["confirmed", "tentative"])
        .lt("checkin", q.checkOut)
        .gt("checkout", q.checkIn);

  const { data, error } = await query.limit(1);
  if (error || !data?.length) return null;

  const w = data[0] as {
    bride: string; groom: string; siteConfig?: { coverPhotoUrl?: string | null } | null;
  };
  const couple = `${w.bride ?? ""} & ${w.groom ?? ""}`.trim();
  if (couple === "&") return null;
  return { couple, photoUrl: w.siteConfig?.coverPhotoUrl ?? null, guest };
}

/** Política de privacidade — mesma regra multilíngue das regras da pousada. */
function privacyTextOf(settings: unknown, lang: MsgLang = "pt"): string | null {
  const raw = (settings as { privacyPolicyText?: unknown } | null)?.privacyPolicyText;
  if (!raw) return null;
  const ml = parseMultiLang(raw);
  return (ml[lang] || ml.pt || ml.en || ml.es || "").trim() || null;
}

/**
 * A cabana como o cliente vê. `total` é o preço OFERECIDO (com o ajuste que o
 * vendedor fez para esta cabana); `wasTotal` é o "de" do de/por — o valor que
 * o tarifário calculou, com a flutuação já embutida, quando estamos
 * oferecendo mais barato. Sem oferta própria, o "de" volta a ser o valor
 * cheio antes dos descontos.
 */
function publicOption(
  room: Pick<RateQuoteRoom, "priceOverrides">,
  c: RateQuoteCategory,
  siteUrl?: string
): PublicQuoteOption {
  const total = offeredTotal(room, c);
  const was = total < c.finalTotal - 0.5 ? c.finalTotal
    : total >= c.finalTotal - 0.5 && c.rawTotal > total + 5 ? c.rawTotal
    : null;
  return {
    categoryId: c.categoryId || c.category,
    name: c.category,
    nights: c.nights,
    total,
    avgNightly: c.nights > 0 ? total / c.nights : c.avgNightly,
    ...(was ? { wasTotal: was } : {}),
    ...(siteUrl ? { siteUrl } : {}),
    ...(c.overCapacity ? { overCapacity: c.overCapacity } : {}),
  };
}

/**
 * O que o formulário do cadastro manda. Tudo `unknown`-ish de propósito: vem
 * de uma página anônima, então nada é tipo confiável até passar por
 * `buildIntake`. O valor do pagamento NÃO vem daqui — só o id da condição.
 */
export type PublicIntakeInput = {
  holder: {
    fullName?: string;
    documentType?: string;
    document?: string;
    birthDate?: string;
    email?: string;
    /** Só dígitos, já com o DDI (o formulário tem campo de país separado). */
    phone?: string;
    address?: {
      country?: string;
      zipCode?: string;
      street?: string;
      number?: string;
      complement?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
    };
  };
  companions?: { roomId?: string; kind?: string; fullName?: string; birthDate?: string }[];
  vehiclePlate?: string;
  paymentOptionId?: string;
  pets?: { name?: string; species?: string; breed?: string; weight?: number }[];
  notes?: string;
  privacyAccepted?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Tipos de documento aceitos — espelha os domínios da FnrhService. */
const DOC_TYPES = ["CPF", "PASSAPORTE", "RG", "DNI", "CNH", "OUTRO"];
const PET_SPECIES: PetDetails["species"][] = ["Cachorro", "Gato", "Outro"];

const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * Valida e monta o `QuoteIntake` que vai para o banco. Devolve `{ error }` com
 * a mensagem que o cliente lê — as mesmas regras do formulário, repetidas aqui
 * porque o formulário não é a defesa.
 */
function buildIntake(
  raw: PublicIntakeInput,
  q: RateQuoteRecord,
  language: MsgLang,
  paymentOptions: RatePaymentOption[],
  ctx: { ip: string | null; userAgent: string | null; privacyLength: number | null }
): { intake: QuoteIntake } | { error: string } {
  const M = INTAKE_ERRORS[language];
  if (!raw?.privacyAccepted) return { error: M.privacy };

  const h = raw.holder ?? {};
  const fullName = clip(h.fullName, 120);
  if (fullName.split(/\s+/).filter(Boolean).length < 2) return { error: M.fullName };

  const documentType = DOC_TYPES.includes(clip(h.documentType, 20).toUpperCase())
    ? clip(h.documentType, 20).toUpperCase() : "CPF";
  const document = normalizeDocument(h.document);
  if (documentType === "CPF") {
    if (!validateCPF(document)) return { error: M.cpf };
  } else if (document.length < 4) {
    return { error: M.document };
  }

  const email = clip(h.email, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: M.email };

  // O telefone chega com o DDI colado pelo formulário (campo de país próprio).
  const phone = String(h.phone ?? "").replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 15) return { error: M.phone };

  const birthDate = clip(h.birthDate, 10);
  if (birthDate && (!ISO_DATE_RE.test(birthDate) || birthDate > new Date().toISOString().slice(0, 10))) {
    return { error: M.birthDate };
  }

  const a = h.address ?? {};
  const country = (clip(a.country, 2) || "BR").toUpperCase();
  const isBR = country === "BR";
  const zipCode = isBR ? String(a.zipCode ?? "").replace(/\D/g, "") : clip(a.zipCode, 16);
  const street = clip(a.street, 160);
  const city = clip(a.city, 80);
  const state = clip(a.state, 40);
  if (isBR) {
    if (zipCode.length !== 8) return { error: M.zip };
    if (!street || !clip(a.number, 16) || !city || state.length < 2) return { error: M.address };
  } else if (!street || !city) {
    return { error: M.address };
  }

  const roomIds = new Set(roomsOf(q).map((r) => r.id));
  const companions: QuoteIntakeCompanion[] = (raw.companions ?? [])
    .slice(0, 30)
    .map((c) => ({
      roomId: roomIds.has(String(c?.roomId)) ? String(c!.roomId) : roomsOf(q)[0]?.id ?? "",
      kind: c?.kind === "child" || c?.kind === "baby" ? c.kind : "adult" as const,
      fullName: clip(c?.fullName, 120) || undefined,
      birthDate: ISO_DATE_RE.test(clip(c?.birthDate, 10)) ? clip(c?.birthDate, 10) : undefined,
    }));

  // Pets: o cliente pode informar mesmo sem pet na cotação — é justamente o
  // aviso que a recepção precisa (a diária muda de preço).
  const pets: PetDetails[] = (raw.pets ?? [])
    .slice(0, PET_HARD_CAP)
    .map((p) => ({
      name: clip(p?.name, 60),
      species: PET_SPECIES.includes(p?.species as PetDetails["species"])
        ? (p!.species as PetDetails["species"]) : "Cachorro",
      breed: clip(p?.breed, 60) || undefined,
      weight: Math.max(0, Math.min(120, Number(p?.weight) || 0)),
    }))
    .filter((p) => p.name || p.weight > 0);

  // Condição de pagamento: o cliente manda só o ID. Rótulo, desconto e valor
  // são resolvidos aqui — um payload adulterado não compra 90% de desconto.
  let payment: QuoteIntake["payment"];
  if (raw.paymentOptionId) {
    const opt = paymentOptions.find((o) => o.id === raw.paymentOptionId);
    if (opt) {
      const total = roomsOf(q).reduce((sum, r) => sum + resolveRoomValue(r).value, 0);
      payment = {
        optionId: opt.id,
        label: paymentLabel(opt, language),
        discountPct: Number(opt.discountPct) || 0,
        valueAtSubmit: paymentTotal(total, Number(opt.discountPct) || 0),
      };
    }
  }

  return {
    intake: {
      holder: {
        fullName, documentType, document, email, phone,
        ...(birthDate ? { birthDate } : {}),
        address: {
          country, zipCode, street,
          number: clip(a.number, 16),
          ...(clip(a.complement, 80) ? { complement: clip(a.complement, 80) } : {}),
          neighborhood: clip(a.neighborhood, 80),
          city, state,
        },
      },
      companions,
      ...(clip(raw.vehiclePlate, 12) ? { vehiclePlate: clip(raw.vehiclePlate, 12).toUpperCase() } : {}),
      ...(payment ? { payment } : {}),
      ...(pets.length ? { pets, petsNotQuoted: !(Number(q.pets) > 0) } : {}),
      ...(clip(raw.notes, 1000) ? { notes: clip(raw.notes, 1000) } : {}),
      consent: {
        privacyAccepted: true,
        privacyLength: ctx.privacyLength,
        at: new Date().toISOString(),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      submittedAt: new Date().toISOString(),
    },
  };
}

/** Mensagens de validação do cadastro — o cliente lê no idioma dele. */
const INTAKE_ERRORS: Record<MsgLang, Record<
  "privacy" | "fullName" | "cpf" | "document" | "email" | "phone" | "birthDate" | "zip" | "address",
  string
>> = {
  pt: {
    privacy: "É preciso autorizar o uso dos dados para a reserva.",
    fullName: "Informe o nome completo do titular.",
    cpf: "CPF inválido — confira os números.",
    document: "Informe o número do documento.",
    email: "Informe um e-mail válido.",
    phone: "Informe o telefone com o código do país (Brasil = 55).",
    birthDate: "Data de nascimento inválida.",
    zip: "CEP inválido — são 8 dígitos.",
    address: "Complete o endereço (rua, número, cidade e estado).",
  },
  en: {
    privacy: "Please allow us to use your details for the booking.",
    fullName: "Enter the main guest's full name.",
    cpf: "Invalid CPF — please check the numbers.",
    document: "Enter your document number.",
    email: "Enter a valid email address.",
    phone: "Enter your phone with the country code.",
    birthDate: "Invalid date of birth.",
    zip: "Invalid postal code.",
    address: "Complete your address (street, number, city and state).",
  },
  es: {
    privacy: "Es necesario autorizar el uso de los datos para la reserva.",
    fullName: "Informe el nombre completo del titular.",
    cpf: "CPF inválido — revise los números.",
    document: "Informe el número del documento.",
    email: "Informe un correo electrónico válido.",
    phone: "Informe el teléfono con el código del país.",
    birthDate: "Fecha de nacimiento inválida.",
    zip: "Código postal inválido.",
    address: "Complete la dirección (calle, número, ciudad y estado).",
  },
};

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

    // Idioma falado pelo hóspede, escolhido pelo vendedor no wizard.
    const language: MsgLang = q.clientLanguage === "en" || q.clientLanguage === "es"
      ? q.clientLanguage : "pt";

    // Link do site por categoria (o cliente quer ver a cabana).
    const { data: cats } = await supabaseAdmin
      .from("cabin_categories")
      .select("id, siteUrl")
      .eq("propertyId", q.propertyId);
    const siteUrlOf = (categoryId: string) =>
      (cats ?? []).find((c) => c.id === categoryId)?.siteUrl || undefined;

    // "O que está incluso" — texto comercial do tarifário, uma linha por item,
    // no idioma do hóspede (vazio em EN/ES cai no PT). Colunas novas:
    // propriedade sem a migration aplicada devolve erro e a seção some, em
    // vez de derrubar a proposta.
    const { data: rateSettings } = await supabaseAdmin
      .from("rate_settings")
      .select("inclusionsText, inclusionsText_en, inclusionsText_es")
      .eq("propertyId", q.propertyId)
      .maybeSingle();
    const inclusionsRow = rateSettings as
      { inclusionsText?: string; inclusionsText_en?: string; inclusionsText_es?: string } | null;
    const inclusionsRaw = (language === "en" ? inclusionsRow?.inclusionsText_en
      : language === "es" ? inclusionsRow?.inclusionsText_es
      : null) || inclusionsRow?.inclusionsText || "";
    const inclusions = String(inclusionsRaw)
      .split("\n")
      .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
      .filter(Boolean);

    // Condições de pagamento do cadastro — consulta SEPARADA de propósito: a
    // coluna é nova e, sem a migration, o Supabase erra a query inteira. Junto
    // das inclusões, isso derrubaria também "o que está incluso".
    // Vazio (ou coluna ausente) cai no padrão do código, que é a mensagem da
    // recepção.
    const paymentSource = await loadPaymentOptions(q.propertyId);
    const paymentOptions = [...paymentSource]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((o) => ({ id: o.id, label: paymentLabel(o, language), discountPct: Number(o.discountPct) || 0 }))
      .filter((o) => o.label);

    const [{ data: property }, wedding] = await Promise.all([
      supabaseAdmin
        .from("properties")
        .select("id, name, logoUrl, theme, settings")
        .eq("id", q.propertyId)
        .maybeSingle(),
      loadWedding(q),
    ]);

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
      acceptsPets?: boolean; maxPets?: number;
      petMinWeight?: number; petMaxWeight?: number;
    };

    return {
      id: q.id,
      // Só o primeiro nome — o link pode ser encaminhado.
      clientFirstName: (q.clientName || "").trim().split(/\s+/)[0] || "",
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      nights: rooms[0]?.options[0]?.nights ?? 0,
      mixedPeriods,
      language,
      rooms: rooms.map((room, i) => ({
        id: room.id,
        // Com várias, a acomodação de opção única leva o NOME da cabana (ver
        // roomDisplayName); com uma só, o texto neutro de sempre.
        label: rooms.length > 1
          ? roomDisplayName(room, i)
          : room.label?.trim() || "Sua cabana",
        checkIn: room.checkIn || q.checkIn,
        checkOut: room.checkOut || q.checkOut,
        nights: room.options[0]?.nights ?? 0,
        adults: room.adults, children: room.children,
        babies: room.babies, pets: room.pets,
        options: room.options.map((c) => publicOption(room, c, siteUrlOf(c.categoryId))),
        selectedCategory: room.selectedCategory ?? null,
      })),
      total,
      approximate,
      acceptedAt: q.acceptedAt ?? null,
      expiresAt: q.expiresAt ?? null,
      inclusions,
      policyText: policyTextOf(property?.settings, language),
      privacyPolicyText: privacyTextOf(property?.settings, language),
      intakeDone: !!q.intakeAt,
      paymentOptions,
      wedding,
      petsQuoted: Math.max(0, Number(q.pets) || 0),
      petRules: {
        accepts: settings.acceptsPets !== false,
        maxPets: maxPetsOf(settings),
        minWeight: Number.isFinite(Number(settings.petMinWeight)) ? Number(settings.petMinWeight) : null,
        maxWeight: Number.isFinite(Number(settings.petMaxWeight)) ? Number(settings.petMaxWeight) : null,
      },
      overCapacityNotice: rooms.some((r) => r.options.some((c) => c.overCapacity)),
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

  /**
   * CADASTRO DO TITULAR — o passo 2 da proposta, no lugar da mensagem que a
   * recepção mandava no WhatsApp pedindo os dados "para garantir a reserva".
   *
   * O que entra é SANEADO campo a campo (o cliente é anônimo): preço e rótulo
   * da condição de pagamento são resolvidos AQUI, nunca aceitos do payload.
   * O JSON fica no orçamento; a ficha de hóspede e a estadia são
   * pré-preenchidas depois, na conversão, por quem tem sessão.
   *
   * `intakeAt` é a trava: um segundo envio é recusado. Correção é da recepção,
   * pelo drawer do lead — assim o link encaminhado não vira porta de edição.
   */
  async submitIntake(input: {
    id: string;
    intake: PublicIntakeInput;
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

    // Trava: cadastro já enviado. Diferente do aceite (idempotente), reenviar
    // aqui SOBRESCREVERIA dados conferidos — quem corrige é a recepção.
    if (q.intakeAt) {
      return { ok: false, error: "Seus dados já foram recebidos. Se precisar corrigir algo, fale com a pousada." };
    }

    // Robô: engole em silêncio (o cliente honesto nunca cai aqui).
    if (input.website || (input.elapsedMs != null && input.elapsedMs < MIN_ELAPSED_MS)) {
      return { ok: true };
    }

    const language: MsgLang = q.clientLanguage === "en" || q.clientLanguage === "es"
      ? q.clientLanguage : "pt";

    const [{ data: propRow }, paymentOptions] = await Promise.all([
      supabaseAdmin.from("properties").select("settings").eq("id", q.propertyId).maybeSingle(),
      loadPaymentOptions(q.propertyId),
    ]);
    const privacyText = privacyTextOf(propRow?.settings, language);

    const built = buildIntake(input.intake, q, language, paymentOptions, {
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      privacyLength: privacyText ? privacyText.length : null,
    });
    if ("error" in built) return { ok: false, error: built.error };
    const intake = built.intake;

    // O lead SÓ ganha o que estava faltando: onde o vendedor já tinha
    // digitado algo diferente, quem decide é a recepção (o drawer mostra a
    // divergência lado a lado).
    const fill: Record<string, unknown> = {};
    if (!(q.clientName || "").trim()) fill.clientName = intake.holder.fullName;
    if (!(q.clientDocument || "").trim() && intake.holder.document) {
      fill.clientDocument = intake.holder.document;
      fill.clientDocumentType = intake.holder.documentType;
    }
    if (!(q.clientEmail || "").trim() && intake.holder.email) fill.clientEmail = intake.holder.email;
    if (!(q.clientPhone || "").trim() && intake.holder.phone) fill.clientPhone = intake.holder.phone;

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("rate_quotes")
      .update({ ...fill, intake, intakeAt: now, updatedAt: now })
      .eq("id", q.id);
    if (error) return { ok: false, error: "Não foi possível registrar os seus dados." };

    const clientName = intake.holder.fullName || q.clientName || "Cliente";

    // Timeline: o QUE chegou, não o conteúdo — CPF e endereço não viram
    // histórico consultável por todo mundo que abre o lead.
    await CrmService.logInteraction(q.propertyId, "quote", q.id, "client_intake", {
      actorId: "client", actorName: clientName,
      note: "Cadastro do titular preenchido na proposta pública.",
      payload: {
        companions: intake.companions.length,
        pets: intake.pets?.length ?? 0,
        petsNotQuoted: !!intake.petsNotQuoted,
        vehiclePlate: !!intake.vehiclePlate,
        payment: intake.payment?.label ?? null,
        ip: intake.consent.ip,
        userAgent: intake.consent.userAgent,
        privacyAccepted: intake.consent.privacyAccepted,
        privacyLength: intake.consent.privacyLength,
      },
    });

    // A recepção já tem o alarme do aceite na Fila de hoje: ele passa a dizer
    // que os dados chegaram, em vez de virar um segundo item para a mesma
    // reserva. Sem alarme (aceite antigo, link avulso), cria um.
    await CrmService.upsertIntakeAlarm(q.propertyId, q.id, clientName, today).catch(() => {});

    await fanOutByRole(q.propertyId, NOTIFICATION_ALERT_ROLES, {
      title: "Cadastro recebido",
      body: `${clientName} enviou os dados para garantir a reserva.`,
      url: "/admin/comercial",
      tag: `quote-intake-${q.id}`,
      role: "reception",
    }).catch(() => {});

    await AuditService.log({
      propertyId: q.propertyId, userId: "client", userName: clientName,
      action: "UPDATE", entity: "RATE_QUOTE", entityId: q.id,
      details: "Cadastro do titular preenchido pelo cliente na página pública.",
    });

    return { ok: true };
  },
};
