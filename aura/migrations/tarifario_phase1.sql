-- ============================================================================
-- TARIFÁRIO — Fase 1 (2026-08-04)
-- Motor comercial nativo do AURA: port do SIT (Sistema de Inteligência
-- Tarifária) que rodava offline em localStorage na recepção.
--
-- Modelo (espelha o SIT):
--   rate_tables   — tabelas de preço: diária por categoria de cabana × nº de
--                   pagantes (1..6), guardada em JSONB no formato
--                   { "<categoria>": { "1": 990, "2": 1090, ... } }
--   rate_periods  — regras de calendário: intervalo de datas + mínimo de
--                   diárias + tabela de dia de semana e de fim de semana
--                   (SEX/SÁB). A noite pertence à regra se
--                   startDate <= noite <= endDate.
--   rate_settings — 1 linha por propriedade: taxa pet, flutuações de ocupação,
--                   descontos manuais, promoções automáticas, links por
--                   categoria e templates de WhatsApp.
--
-- Bloqueios de casamento e eventos festivos do SIT NÃO viram tabelas novas:
-- o módulo de casamentos (weddings) e o de eventos (events) já cobrem isso.
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_tables (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  -- { "<categoria>": { "<pagantes 1..6>": <diária em R$> } }
  prices       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_tables_property
  ON public.rate_tables("propertyId");

CREATE TABLE IF NOT EXISTS public.rate_periods (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"     TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  "startDate"      DATE NOT NULL,
  "endDate"        DATE NOT NULL,
  "minNights"      INTEGER NOT NULL DEFAULT 1,
  -- Tabela apagada => regra fica sem preço naquele tipo de dia (categoria some
  -- do orçamento), igual ao comportamento do SIT com id morto.
  "weekdayTableId" UUID REFERENCES public.rate_tables(id) ON DELETE SET NULL,
  "weekendTableId" UUID REFERENCES public.rate_tables(id) ON DELETE SET NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_periods_property
  ON public.rate_periods("propertyId", "startDate");

CREATE TABLE IF NOT EXISTS public.rate_settings (
  "propertyId"        TEXT PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  "petFee"            NUMERIC(12,2) NOT NULL DEFAULT 50,   -- por pet, por diária
  fluctuations        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ id, name, pct }]
  discounts           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ id, name, pct }]
  -- [{ id, name, pct, startDate, endDate, minNights, dayType: all|fds|week }]
  promos              JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { "<categoria>": "https://..." } — link usado no template de WhatsApp
  "categoryLinks"     JSONB NOT NULL DEFAULT '{}'::jsonb,
  "msgTemplate"       TEXT,
  "msgSingleTemplate" TEXT,
  "eventTemplate"     TEXT,
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS: padrão permissivo dos módulos novos (isolamento por propriedade fica
--    a cargo da aplicação — rotas usam service role + filtro "propertyId") ────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rate_tables', 'rate_periods', 'rate_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_auth_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t || '_auth_all', t
    );
  END LOOP;
END $$;
