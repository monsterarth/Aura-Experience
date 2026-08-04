-- ============================================================================
-- TARIFÁRIO — Fase 2: Orçamentos persistidos + funil de vendas (2026-08-04)
--
-- Cada orçamento calculado na tela pode ser salvo com os dados do cliente
-- (todos opcionais — é um lead, não um hóspede) e acompanhado num funil:
--   open → sent → negotiating → won | lost
--
-- Vínculos são progressivos e SEM FK dura:
--   "guestId"  → guests.id (documento normalizado) quando o lead vira/já é hóspede;
--                sem FK porque merge/limpeza de hóspedes não pode quebrar o funil.
--   "stayId"   → estadia criada na conversão (preenchido depois).
--   "weddingId"→ weddings.id quando o orçamento é de convidado de casamento.
--
-- `snapshot` congela as categorias/preços calculados no momento do orçamento —
-- tabelas de tarifa mudam, mas o valor prometido ao cliente não.
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_quotes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"     TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  -- Cliente (lead) — tudo opcional
  "clientName"     TEXT,
  "clientDocument" TEXT,    -- CPF/passaporte como digitado
  "clientPhone"    TEXT,    -- só dígitos, como em guests.phone
  "clientEmail"    TEXT,
  "guestId"        TEXT,    -- guests.id (doc normalizado), sem FK
  "stayId"         TEXT,    -- estadia criada na conversão, sem FK
  "weddingId"      TEXT,    -- weddings.id, sem FK

  -- Parâmetros da consulta
  "checkIn"        DATE NOT NULL,
  "checkOut"       DATE NOT NULL,
  adults           INTEGER NOT NULL DEFAULT 2,
  children         INTEGER NOT NULL DEFAULT 0,
  babies           INTEGER NOT NULL DEFAULT 0,
  pets             INTEGER NOT NULL DEFAULT 0,
  "fluctuationPct" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "discountIds"    JSONB NOT NULL DEFAULT '[]'::jsonb,
  "adhocValue"     NUMERIC(12,2) NOT NULL DEFAULT 0,
  "adhocType"      TEXT NOT NULL DEFAULT 'pct',   -- pct|brl

  -- Resultado congelado no momento do orçamento
  snapshot           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- RateQuoteCategory[]
  "selectedCategory" TEXT,                                -- opção escolhida pelo cliente
  "finalValue"       NUMERIC(12,2),                       -- valor da opção escolhida

  -- Funil
  status           TEXT NOT NULL DEFAULT 'open',  -- open|sent|negotiating|won|lost
  "lostReason"     TEXT,
  notes            TEXT,

  "createdBy"      TEXT,
  "createdByName"  TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_quotes_property
  ON public.rate_quotes("propertyId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_rate_quotes_status
  ON public.rate_quotes("propertyId", status);
CREATE INDEX IF NOT EXISTS idx_rate_quotes_guest
  ON public.rate_quotes("guestId") WHERE "guestId" IS NOT NULL;

-- RLS: mesmo padrão permissivo da fase 1 (service role + filtro na aplicação)
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.rate_quotes ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS rate_quotes_auth_all ON public.rate_quotes;';
  EXECUTE 'CREATE POLICY rate_quotes_auth_all ON public.rate_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);';
END $$;
