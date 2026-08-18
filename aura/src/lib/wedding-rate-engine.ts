// Motor do simulador de convidados de casamento — puro (sem Supabase/React),
// composto SOBRE o computeQuote do tarifário, nunca ao lado dele.
//
// Regra de preço fechada em plano:
// - JANELA DO EVENTO (weddings.checkin → checkout): tabela vinculada ao
//   casamento (weddings.rateTableId), única para todas as noites, preço SECO —
//   sem flutuação, sem promoção, sem desconto. Taxa pet aplica normal.
// - NOITES ESTENDIDAS (antes/depois da janela): tarifário NORMAL da data
//   (rate_periods + flutuação automática + promos), como qualquer hóspede.
//
// Como o computeQuote só cota intervalo CONTÍGUO, a estadia é fatiada em até
// 3 segmentos (pré-extensão / janela / pós-extensão) e os resultados são
// somados por categoria — uma categoria só sobrevive se tiver preço para o
// pax em TODOS os segmentos não vazios.
import {
  CabinCategory,
  RateBreakdownItem,
  RateFluctuationRule,
  RatePeriod,
  RateQuoteCategory,
  RateQuoteInput,
  RateSettings,
  RateTable,
} from '@/types/aura';
import { computeQuote, nightsBetween, addDays } from './rate-engine';

export interface WeddingRateWindow {
  /** Janela padrão do evento (weddings.checkin/checkout). */
  checkin: string;
  checkout: string;
  /** Tabela única que precifica a janela (weddings.rateTableId). */
  rateTableId: string;
}

export interface WeddingGuestInput {
  checkIn: string;   // YYYY-MM-DD — sempre <= window.checkin (janela cheia)
  checkOut: string;  // YYYY-MM-DD — sempre >= window.checkout
  adults: number;
  children: number;
  babies: number;
  pets: number;
}

/** Mesmo shape que o getRateData devolve (fluctuations null = fase 4 pendente). */
export interface WeddingRateData {
  tables: RateTable[];
  periods: RatePeriod[];
  settings: RateSettings;
  categories: CabinCategory[];
  fluctuations?: RateFluctuationRule[] | null;
}

/** Opção de categoria com o racha janela × extensão exposto para a UI pública. */
export interface WeddingQuoteOption extends RateQuoteCategory {
  /** Hospedagem das noites da janela (tabela do casamento), SEM taxa pet. */
  windowTotal: number;
  /** Hospedagem das noites estendidas (tarifário normal), SEM taxa pet. */
  extensionTotal: number;
  /** Taxa pet da estadia inteira (por fora, como no tarifário). */
  petFee: number;
}

export interface WeddingQuoteResult {
  options: WeddingQuoteOption[];
  nights: number;
  windowNights: number;
  extensionNights: number;
  /** Noites de EXTENSÃO sem regra de calendário — bloqueiam a cotação inteira. */
  uncoveredDates: string[];
}

const EMPTY_COMMERCIAL = {
  fluctuationPct: 0,
  discountIds: [] as string[],
  adhocValue: 0,
  adhocType: 'pct' as const,
};

export function computeWeddingQuote(
  input: WeddingGuestInput,
  window: WeddingRateWindow,
  data: WeddingRateData
): WeddingQuoteResult {
  const nights = nightsBetween(input.checkIn, input.checkOut);
  const windowNights = nightsBetween(window.checkin, window.checkout);
  const empty: WeddingQuoteResult = {
    options: [], nights, windowNights,
    extensionNights: Math.max(0, nights - windowNights), uncoveredDates: [],
  };
  if (nights <= 0 || windowNights <= 0) return empty;

  const weddingTable = data.tables.find((t) => t.id === window.rateTableId);
  if (!weddingTable) return empty; // o service valida antes e dá o erro amigável

  const paxInput = {
    adults: input.adults, children: input.children,
    babies: input.babies, pets: input.pets,
  };

  // ── Janela do evento: tabela do casamento, preço seco ──────────────────────
  const windowPeriod: RatePeriod = {
    id: 'wedding-window',
    propertyId: weddingTable.propertyId,
    name: 'Casamento',
    startDate: window.checkin,
    endDate: addDays(window.checkout, -1), // endDate é a ÚLTIMA NOITE, inclusive
    minNights: 1,
    weekdayTableId: weddingTable.id,
    weekendTableId: weddingTable.id,
  };
  const windowResult = computeQuote(
    { ...paxInput, ...EMPTY_COMMERCIAL, checkIn: window.checkin, checkOut: window.checkout },
    {
      tables: [weddingTable],
      periods: [windowPeriod],
      settings: { ...data.settings, promos: [], discounts: [] },
      categories: data.categories,
    }
  );

  // ── Extensões: tarifário normal completo (flutuação automática + promos) ───
  const segments: { checkIn: string; checkOut: string }[] = [];
  if (input.checkIn < window.checkin) segments.push({ checkIn: input.checkIn, checkOut: window.checkin });
  if (input.checkOut > window.checkout) segments.push({ checkIn: window.checkout, checkOut: input.checkOut });

  const extResults = segments.map((seg) =>
    computeQuote(
      {
        ...paxInput, ...EMPTY_COMMERCIAL,
        checkIn: seg.checkIn, checkOut: seg.checkOut,
        fluctuationAuto: data.fluctuations != null,
      } as RateQuoteInput,
      {
        tables: data.tables,
        periods: data.periods,
        settings: data.settings,
        categories: data.categories,
        fluctuations: data.fluctuations ?? undefined,
      }
    )
  );

  const uncovered = extResults.flatMap((r) => r.uncoveredDates);
  if (uncovered.length > 0) return { ...empty, uncoveredDates: uncovered };

  // ── Merge por categoria: precisa ter preço em TODOS os segmentos ──────────
  const petFeeRate = data.settings.petFee || 0;
  const petFeeTotal = (input.pets || 0) * petFeeRate * nights;
  const extNights = nights - windowNights;

  const options: WeddingQuoteOption[] = [];
  for (const win of windowResult.categories) {
    const exts = extResults.map((r) =>
      r.categories.find((c) => c.categoryId === win.categoryId)
    );
    if (exts.some((c) => !c)) continue; // sem preço numa extensão → categoria some

    const petFeeWin = (input.pets || 0) * petFeeRate * windowNights;
    const windowTotal = win.finalTotal - petFeeWin;
    const extensionTotal = exts.reduce((sum, c) => {
      const segNights = c!.nights;
      return sum + (c!.finalTotal - (input.pets || 0) * petFeeRate * segNights);
    }, 0);

    const finalTotal = windowTotal + extensionTotal + petFeeTotal;
    const rawTotal = win.rawTotal - petFeeWin
      + exts.reduce((s, c) => s + (c!.rawTotal - (input.pets || 0) * petFeeRate * c!.nights), 0)
      + petFeeTotal;

    // Breakdown legível no funil (o snapshot da pré-reserva é este):
    const breakdown: RateBreakdownItem[] = [
      { label: `Tarifa do casamento (${windowNights} noite${windowNights > 1 ? 's' : ''})`, value: windowTotal, kind: 'base' },
    ];
    if (extNights > 0) {
      breakdown.push({
        label: `Noites extras (${extNights}) — tarifário vigente`,
        value: extensionTotal, kind: 'base',
      });
    }
    if (petFeeTotal > 0) {
      breakdown.push({ label: `Taxa pet (${input.pets}x)`, value: petFeeTotal, kind: 'fee' });
    }

    const periodNights: Record<string, number> = { Casamento: windowNights };
    for (const c of exts) {
      for (const [name, n] of Object.entries(c!.periodNights)) {
        periodNights[name] = (periodNights[name] || 0) + n;
      }
    }

    options.push({
      categoryId: win.categoryId,
      category: win.category,
      nights,
      rawTotal,
      finalTotal,
      avgNightly: finalTotal / nights,
      breakdown,
      periodNights,
      daysWithoutPrice: win.daysWithoutPrice + exts.reduce((s, c) => s + c!.daysWithoutPrice, 0),
      windowTotal,
      extensionTotal,
      petFee: petFeeTotal,
    });
  }

  options.sort((a, b) => a.finalTotal - b.finalTotal);
  return { options, nights, windowNights, extensionNights: extNights, uncoveredDates: [] };
}
