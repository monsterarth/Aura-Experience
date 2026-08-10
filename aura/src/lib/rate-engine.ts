// Motor de cálculo do Tarifário — port fiel da cascata do SIT:
// Tabela base → Flutuação de ocupação → Promoções automáticas → Descontos
// manuais → Negociação extra → Taxa pet.
// Funções puras (sem Supabase, sem React): a página admin calcula na hora e o
// servidor pode reusar o mesmo motor para futuras cotações públicas.

import {
  CabinCategory,
  RateBreakdownItem,
  RatePeriod,
  RatePromo,
  RateQuoteCategory,
  RateQuoteInput,
  RateQuoteRecord,
  RateQuoteResult,
  RateQuoteRoom,
  RateSettings,
  RateTable,
} from '@/types/aura';

export const MAX_PAX = 6;

// ── Datas (YYYY-MM-DD, sem fuso) ─────────────────────────────────────────────

export function isoToDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return dateToIso(d);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((isoToDate(checkOut).getTime() - isoToDate(checkIn).getTime()) / 86400000);
}

/** Todas as noites do intervalo: [checkIn, checkOut). */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}

/** SEX/SÁB contam como fim de semana (a noite de sáb→dom vira diária de sábado). */
export function isWeekendNight(iso: string): boolean {
  const wd = isoToDate(iso).getDay();
  return wd === 5 || wd === 6;
}

export function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * Divide o total da hospedagem em diárias: média truncada em centavos e a
 * última noite absorve a sobra — a soma bate exatamente com o total.
 */
export function splitNightly(total: number, nights: number): number[] {
  if (nights <= 0 || total <= 0) return [];
  const avg = Math.floor((total / nights) * 100) / 100;
  const values = Array.from({ length: nights }, () => avg);
  values[nights - 1] = Math.round((total - avg * (nights - 1)) * 100) / 100;
  return values;
}

export function formatDateBR(iso: string): string {
  return iso.split('-').reverse().join('/');
}

// ── Cascata de cálculo ───────────────────────────────────────────────────────

interface RateData {
  tables: RateTable[];
  periods: RatePeriod[];
  settings: RateSettings;
  /** Categorias da propriedade — resolvem id → nome comercial. */
  categories: CabinCategory[];
}

/** Nome a exibir/mandar no WhatsApp: comercial quando houver, senão operacional. */
export function displayNameOf(category: CabinCategory): string {
  return category.shortName?.trim() || category.name;
}

function promoAppliesToNight(promo: RatePromo, iso: string, nights: number): boolean {
  if (nights < (promo.minNights || 1)) return false;
  if (iso < promo.startDate || iso > promo.endDate) return false;
  if (promo.dayType === 'fds') return isWeekendNight(iso);
  if (promo.dayType === 'week') return !isWeekendNight(iso);
  return true;
}

function findRule(periods: RatePeriod[], iso: string): RatePeriod | undefined {
  return periods.find((p) => iso >= p.startDate && iso <= p.endDate);
}

/**
 * Calcula o orçamento para todas as categorias presentes nas tabelas.
 * Mesmas regras do SIT:
 * - pagantes = adultos + crianças, limitado a 1..6 — é o índice na tabela;
 * - noite sem preço para o pax soma 0 (categoria some se o total ficar 0 —
 *   é assim que "4 pessoas não cabem na Praia 1" é filtrado);
 * - qualquer noite sem regra de calendário bloqueia o orçamento inteiro
 *   (uncoveredDates preenchido, categories vazio).
 */
export function computeQuote(input: RateQuoteInput, data: RateData): RateQuoteResult {
  const { tables, periods, settings, categories } = data;
  const nights = nightsBetween(input.checkIn, input.checkOut);
  const empty: RateQuoteResult = { categories: [], uncoveredDates: [], minNightsRequired: 1, nights };
  if (nights <= 0) return empty;

  const allNights = nightsOf(input.checkIn, input.checkOut);
  const sorted = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));

  const uncovered = allNights.filter((iso) => !findRule(sorted, iso));
  const touched = allNights
    .map((iso) => findRule(sorted, iso))
    .filter((p): p is RatePeriod => Boolean(p));
  const minNightsRequired = touched.reduce((max, p) => Math.max(max, p.minNights || 1), 1);

  if (uncovered.length > 0) {
    return { ...empty, uncoveredDates: uncovered, minNightsRequired };
  }

  const pax = Math.min(MAX_PAX, Math.max(1, (input.adults || 0) + (input.children || 0)));
  const tableById = new Map(tables.map((t) => [t.id, t]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  // Só categorias que ainda existem: chave órfã (categoria excluída) some do
  // orçamento em vez de virar uma linha sem nome.
  const categoryIds = Array.from(
    new Set(tables.flatMap((t) => Object.keys(t.prices || {})))
  ).filter((id) => categoryById.has(id));

  const activeDiscounts = (settings.discounts || []).filter((d) =>
    input.discountIds.includes(d.id)
  );
  const petFee = (input.pets || 0) * (settings.petFee || 0) * nights;

  const results: RateQuoteCategory[] = [];

  for (const categoryId of categoryIds) {
    let rawTotal = 0;
    let accumulated = 0;
    let daysWithoutPrice = 0;
    const periodNights: Record<string, number> = {};
    const promoSavings: Record<string, number> = {};

    for (const iso of allNights) {
      const rule = findRule(sorted, iso)!;
      const tableId = isWeekendNight(iso) ? rule.weekendTableId : rule.weekdayTableId;
      const table = tableId ? tableById.get(tableId) : undefined;
      const dailyRaw = Number(table?.prices?.[categoryId]?.[String(pax)]) || 0;

      rawTotal += dailyRaw;
      if (dailyRaw <= 0) daysWithoutPrice++;
      periodNights[rule.name] = (periodNights[rule.name] || 0) + 1;

      let daily = dailyRaw * (1 + (input.fluctuationPct || 0) / 100);

      for (const promo of settings.promos || []) {
        if (promoAppliesToNight(promo, iso, nights)) {
          const saved = daily * (promo.pct / 100);
          daily -= saved;
          promoSavings[promo.name] = (promoSavings[promo.name] || 0) + saved;
        }
      }
      accumulated += daily;
    }

    if (rawTotal <= 0) continue; // categoria sem preço para esse pax (não cabe)

    const breakdown: RateBreakdownItem[] = [
      { label: `Valor tabela (${nights} noite${nights > 1 ? 's' : ''})`, value: rawTotal, kind: 'base' },
    ];
    if (input.fluctuationPct) {
      breakdown.push({
        label: `Ajuste ocupação (${input.fluctuationPct > 0 ? '+' : ''}${input.fluctuationPct}%)`,
        value: rawTotal * (input.fluctuationPct / 100),
        kind: 'fluct',
      });
    }
    for (const [name, saved] of Object.entries(promoSavings)) {
      breakdown.push({ label: name, value: -saved, kind: 'promo' });
    }

    let total = accumulated;
    for (const d of activeDiscounts) {
      const saved = total * (d.pct / 100);
      total -= saved;
      breakdown.push({ label: `Desc. ${d.name} (${d.pct}%)`, value: -saved, kind: 'discount' });
    }

    if (input.adhocValue > 0) {
      const saved = input.adhocType === 'pct' ? total * (input.adhocValue / 100) : input.adhocValue;
      total -= saved;
      breakdown.push({
        label: input.adhocType === 'pct' ? `Negociação extra (${input.adhocValue}%)` : 'Negociação extra (R$)',
        value: -saved,
        kind: 'adhoc',
      });
    }
    if (total < 0) total = 0;

    if (petFee > 0) {
      breakdown.push({ label: `Taxa pet (${input.pets}x)`, value: petFee, kind: 'fee' });
    }

    const finalTotal = total + petFee;
    results.push({
      categoryId,
      category: displayNameOf(categoryById.get(categoryId)!),
      nights,
      rawTotal: rawTotal + petFee,
      finalTotal,
      avgNightly: finalTotal / nights,
      breakdown,
      periodNights,
      daysWithoutPrice,
    });
  }

  results.sort((a, b) => a.finalTotal - b.finalTotal);
  return { categories: results, uncoveredDates: [], minNightsRequired, nights };
}

/**
 * Total de UMA acomodação. Precedência: valor negociado desta acomodação →
 * a cabana escolhida → opção única → mínimo das opções ("a partir de").
 */
export function resolveRoomValue(
  room: Pick<RateQuoteRoom, 'options' | 'selectedCategory' | 'negotiatedValue'>
): { value: number; approximate: boolean; chosen?: RateQuoteCategory } {
  const options = room.options || [];

  if (typeof room.negotiatedValue === 'number' && room.negotiatedValue > 0) {
    const chosen = room.selectedCategory
      ? options.find((c) => c.categoryId === room.selectedCategory || c.category === room.selectedCategory)
      : options.length === 1 ? options[0] : undefined;
    return { value: room.negotiatedValue, approximate: false, chosen };
  }

  if (room.selectedCategory) {
    const chosen = options.find(
      (c) => c.categoryId === room.selectedCategory || c.category === room.selectedCategory
    );
    if (chosen) return { value: chosen.finalTotal, approximate: false, chosen };
  }
  if (options.length === 1) {
    return { value: options[0].finalTotal, approximate: false, chosen: options[0] };
  }
  const totals = options.map((c) => c.finalTotal).filter((v) => v > 0);
  return { value: totals.length ? Math.min(...totals) : 0, approximate: totals.length > 1 };
}

/**
 * Valor de um orçamento salvo — REGRA ÚNICA para funil, KPIs e vínculo com
 * estadia (antes havia duas implementações divergentes). Precedência:
 * valor negociado (fechado na conversa) → SOMA das acomodações (`rooms`) →
 * opção escolhida (por id, com fallback por nome p/ dados antigos) → opção
 * única → finalValue → mínimo do snapshot ("a partir de", approximate=true).
 *
 * `rooms` e `snapshot` respondem perguntas diferentes: rooms são as
 * acomodações PEDIDAS (somam); snapshot são as cabanas OFERECIDAS para uma
 * acomodação (o cliente escolhe uma). Orçamentos anteriores à fase 3 não têm
 * rooms e caem direto no caminho antigo.
 */
export function resolveQuoteValue(
  quote: Pick<RateQuoteRecord, 'snapshot' | 'selectedCategory' | 'finalValue' | 'negotiatedValue'> &
    { rooms?: RateQuoteRoom[] | null }
): { value: number; approximate: boolean; chosen?: RateQuoteCategory } {
  const snapshot = quote.snapshot || [];
  const rooms = quote.rooms && quote.rooms.length > 0 ? quote.rooms : null;

  if (typeof quote.negotiatedValue === 'number' && quote.negotiatedValue > 0) {
    const chosen = quote.selectedCategory
      ? snapshot.find(
          (c) => c.categoryId === quote.selectedCategory || c.category === quote.selectedCategory
        )
      : snapshot.length === 1 ? snapshot[0] : undefined;
    return { value: quote.negotiatedValue, approximate: false, chosen };
  }

  if (rooms) {
    let value = 0;
    let approximate = false;
    for (const room of rooms) {
      const r = resolveRoomValue(room);
      value += r.value;
      if (r.approximate) approximate = true;
    }
    // `chosen` só faz sentido com uma acomodação (quem usa isso é o vínculo
    // com a estadia, que é 1 cabana).
    const single = rooms.length === 1 ? resolveRoomValue(rooms[0]).chosen : undefined;
    return { value, approximate, chosen: single };
  }

  if (quote.selectedCategory) {
    const chosen = snapshot.find(
      (c) => c.categoryId === quote.selectedCategory || c.category === quote.selectedCategory
    );
    if (chosen) return { value: chosen.finalTotal, approximate: false, chosen };
  }
  if (snapshot.length === 1) {
    return { value: snapshot[0].finalTotal, approximate: false, chosen: snapshot[0] };
  }
  if (typeof quote.finalValue === 'number' && quote.finalValue > 0) {
    return { value: quote.finalValue, approximate: false };
  }
  const totals = snapshot.map((c) => c.finalTotal).filter((v) => v > 0);
  return {
    value: totals.length ? Math.min(...totals) : 0,
    approximate: totals.length > 1,
  };
}

// ── Templates de WhatsApp ────────────────────────────────────────────────────

export const DEFAULT_MSG_TEMPLATE = `{CASAMENTO_HEADER}Olá! Tudo bem? Aqui é *{ATENDENTE}* 🌺
É um prazer receber seu contato!

Preparei o orçamento para seus dias de descanso conosco:
🗓 *{DATA_IN}* a *{DATA_OUT}*

👥 *Composição dos hóspedes:*
Total: *{QTD_PESSOAS} pessoas*
(Sendo: *{PAGANTES} pagantes* e *{FREE} isentos*)

👇 *Opções disponíveis para vocês:*

{RESUMO_CABANAS}
{AVISO_EVENTO}
✅ Escolha a sua cabana e confirme por aqui: {QUOTE_LINK}

Fico no aguardo para seguirmos com a sua reserva!
Qualquer dúvida, estou à disposição.`;

export const DEFAULT_MSG_SINGLE_TEMPLATE = `🏡 *{CABANA_NOME}*
💰 Valor: *R$ {CABANA_VALOR}*
🔗 {CABANA_LINK}`;

/** Sugestão de "O que está incluso" — uma linha por item (vira lista). */
export const DEFAULT_INCLUSIONS_TEXT = `Café da manhã da fazenda servido no salão
Estacionamento gratuito na propriedade
Wi-Fi em toda a área comum
Acesso à piscina e às áreas de lazer
Enxoval completo e roupa de cama`;

export const DEFAULT_EVENT_TEMPLATE =
  '🍹 Durante sua estadia teremos um evento especial: *{NOME_EVENTO}* em {DATA_EVENTO}. Aproveite!';

export interface QuoteMessageContext {
  attendantName: string;
  input: RateQuoteInput;
  isWedding: boolean;
  /** Link público da proposta (/cotacao/<id>) — placeholder {QUOTE_LINK}. */
  quoteLink?: string | null;
}

export function processTemplate(tpl: string, ctx: QuoteMessageContext, resumo = '', avisos = ''): string {
  const { input } = ctx;
  const pagantes = (input.adults || 0) + (input.children || 0);
  const totalHumanos = pagantes + (input.babies || 0);
  return (tpl || '')
    // Aceita {QUOTE_LINK} e {quotelink} (o segundo é como se pediu na mão).
    // Sem link, a linha inteira que o contém sai fora — melhor perder a frase
    // que mandar "veja em:" seguido de nada.
    .replace(/^.*\{quote_?link\}.*$\n?/gim, (line) =>
      ctx.quoteLink ? line.replace(/\{quote_?link\}/gi, ctx.quoteLink) : '')
    .replace(/{ATENDENTE}/g, ctx.attendantName)
    .replace(/{DATA_IN}/g, formatDateBR(input.checkIn))
    .replace(/{DATA_OUT}/g, formatDateBR(input.checkOut))
    .replace(/{ADULTOS}/g, String(input.adults || 0))
    .replace(/{CRIANCAS}/g, String(input.children || 0))
    .replace(/{FREE}/g, String(input.babies || 0))
    .replace(/{PETS}/g, String(input.pets || 0))
    .replace(/{PAGANTES}/g, String(pagantes))
    .replace(/{QTD_PESSOAS}/g, String(totalHumanos))
    .replace(/{RESUMO_CABANAS}/g, resumo)
    .replace(/{AVISO_EVENTO}/g, avisos)
    .replace(/{CASAMENTO_HEADER}/g, ctx.isWedding ? '💍 *Convidados de Casamento*\n' : '');
}

/** Bloco de uma categoria no resumo da mensagem (com ou sem detalhamento). */
export function buildCategoryBlock(
  quote: RateQuoteCategory,
  link: string | undefined,
  singleTemplate: string,
  detailed: boolean
): string {
  let block = '';
  if (detailed) {
    block += `🏡 *${quote.category}*\n`;
    for (const item of quote.breakdown) {
      let v = item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      if (item.value > 0 && item.kind !== 'base') v = `+${v}`;
      block += `   ▫ ${item.label}: R$ ${v}\n`;
    }
    block += `   ➡ *Total: R$ ${formatBRL(quote.finalTotal)}*\n`;
    if (link) block += `🔗 ${link}\n`;
    return block;
  }
  block = (singleTemplate || DEFAULT_MSG_SINGLE_TEMPLATE)
    .replace(/{CABANA_NOME}/g, quote.category)
    .replace(/{CABANA_VALOR}/g, formatBRL(quote.finalTotal))
    .replace(/{CABANA_LINK}/g, link || '');
  // Sem link cadastrado, remove a linha do link para não sobrar "🔗 " solto.
  return block
    .split('\n')
    .filter((l) => !(!link && l.includes('🔗')))
    .join('\n') + '\n';
}

export function buildEventNotices(
  events: { title: string; date: string }[],
  eventTemplate: string | null | undefined
): string {
  if (!events.length) return '';
  return events
    .map((ev) =>
      (eventTemplate || DEFAULT_EVENT_TEMPLATE)
        .replace(/{NOME_EVENTO}/g, ev.title)
        .replace(/{DATA_EVENTO}/g, formatDateBR(ev.date))
    )
    .join('\n');
}

// ── Resolução de conflitos de regras de calendário (port do SIT) ─────────────

export interface PeriodConflictResult {
  /** Regras existentes (aparadas/partidas) que permanecem. */
  keep: RatePeriod[];
  /** Novas regras a inserir (a própria, ou os pedaços no modo fill). */
  insert: Omit<RatePeriod, 'id'>[];
  /** ids de regras existentes que devem ser removidas. */
  removeIds: string[];
}

/**
 * Modo SOBREPOR: apara/parte/remove as regras antigas que tocam o intervalo da
 * nova e insere a nova inteira.
 */
export function resolveOverwrite(
  existing: RatePeriod[],
  next: Omit<RatePeriod, 'id'> & { id?: string }
): PeriodConflictResult {
  const keep: RatePeriod[] = [];
  const insert: Omit<RatePeriod, 'id'>[] = [];
  const removeIds: string[] = [];

  for (const o of existing) {
    if (next.id && o.id === next.id) { removeIds.push(o.id); continue; } // edição: substitui
    const outside = o.endDate < next.startDate || o.startDate > next.endDate;
    if (outside) { keep.push(o); continue; }

    const engulfed = o.startDate >= next.startDate && o.endDate <= next.endDate;
    if (engulfed) { removeIds.push(o.id); continue; }

    const splitInTwo = o.startDate < next.startDate && o.endDate > next.endDate;
    if (splitInTwo) {
      removeIds.push(o.id);
      insert.push({ ...stripId(o), endDate: addDays(next.startDate, -1) });
      insert.push({ ...stripId(o), startDate: addDays(next.endDate, 1) });
      continue;
    }

    if (o.startDate < next.startDate) {
      removeIds.push(o.id);
      insert.push({ ...stripId(o), endDate: addDays(next.startDate, -1) });
    } else {
      removeIds.push(o.id);
      insert.push({ ...stripId(o), startDate: addDays(next.endDate, 1) });
    }
  }

  insert.push(stripId(next));
  return { keep, insert, removeIds };
}

/**
 * Modo PREENCHER VAZIOS: mantém tudo que existe e cria a nova regra só nos
 * buracos livres do intervalo. Retorna insert=[] se não houver buraco.
 */
export function resolveFill(
  existing: RatePeriod[],
  next: Omit<RatePeriod, 'id'> & { id?: string }
): PeriodConflictResult {
  const removeIds: string[] = next.id ? [next.id] : [];
  const others = existing.filter((p) => !(next.id && p.id === next.id));
  const conflicts = others
    .filter((p) => p.startDate <= next.endDate && p.endDate >= next.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const insert: Omit<RatePeriod, 'id'>[] = [];
  let cursor = next.startDate;

  for (const c of conflicts) {
    if (c.startDate > cursor) {
      const gapEnd = addDays(c.startDate, -1);
      if (gapEnd >= cursor) insert.push({ ...stripId(next), startDate: cursor, endDate: gapEnd });
    }
    const afterConflict = addDays(c.endDate, 1);
    if (afterConflict > cursor) cursor = afterConflict;
  }
  if (cursor <= next.endDate) {
    insert.push({ ...stripId(next), startDate: cursor, endDate: next.endDate });
  }

  return { keep: others, insert, removeIds };
}

export function findOverlaps(existing: RatePeriod[], next: { id?: string; startDate: string; endDate: string }): RatePeriod[] {
  return existing.filter(
    (p) => (!next.id || p.id !== next.id) && p.startDate <= next.endDate && p.endDate >= next.startDate
  );
}

function stripId<T extends { id?: string }>(obj: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = obj;
  return rest;
}
