-- ============================================================================
-- FINANCEIRO — Fase 1: diárias no fólio + créditos (2026-08-04)
--
-- O fólio deixa de ser só "consumo extra" e vira o EXTRATO da estadia:
--   · débitos  — diárias (lançadas 1x por noite, automaticamente) + consumo
--   · créditos — pagamentos (ex.: hospedagem paga antecipada)
--   · saldo    — débitos − créditos; sem consumo, fecha zero a zero no checkout
--
-- A diária "roda" todo dia via cron (/api/cron/daily-lodging): cada noite
-- vencida vira um item categoria 'lodging' com "refDate" = a data da noite.
-- O índice único em (stayId, refDate) torna o lançamento idempotente — se o
-- cron falhar um dia, o próximo faz o catch-up sem duplicar.
--
-- A estadia ganha o elo financeiro com o orçamento do Tarifário:
--   "rateQuoteId"  → rate_quotes.id (sem FK — histórico não quebra)
--   "nightlyRate"  → valor da diária (total do orçamento ÷ noites)
--   "lodgingTotal" → total da hospedagem (arredondamento acerta na última noite)
--
-- Aplicar no SQL Editor do Supabase. Idempotente, sem DROP.
-- ============================================================================

-- ── folio_items: débito × crédito + noite de referência ─────────────────────

ALTER TABLE public.folio_items
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'debit';  -- debit|credit

ALTER TABLE public.folio_items
  ADD COLUMN IF NOT EXISTS "refDate" DATE;  -- noite a que a diária se refere

-- Idempotência do cron: uma diária por noite por estadia.
CREATE UNIQUE INDEX IF NOT EXISTS idx_folio_lodging_night
  ON public.folio_items("stayId", "refDate")
  WHERE category = 'lodging' AND "refDate" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_folio_items_stay
  ON public.folio_items("stayId", "createdAt" DESC);

-- ── stays: elo financeiro ───────────────────────────────────────────────────

ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS "nightlyRate" NUMERIC(12,2);   -- diária média
ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS "lodgingTotal" NUMERIC(12,2);  -- total da hospedagem
ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS "rateQuoteId" TEXT;            -- rate_quotes.id, sem FK

CREATE INDEX IF NOT EXISTS idx_stays_rate_quote
  ON public.stays("rateQuoteId") WHERE "rateQuoteId" IS NOT NULL;

-- ── Conferência ─────────────────────────────────────────────────────────────
-- Colunas novas devem aparecer; nenhum dado existente é alterado.

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'folio_items' AND column_name IN ('type', 'refDate'))
    OR (table_name = 'stays' AND column_name IN ('nightlyRate', 'lodgingTotal', 'rateQuoteId')))
ORDER BY table_name, column_name;
