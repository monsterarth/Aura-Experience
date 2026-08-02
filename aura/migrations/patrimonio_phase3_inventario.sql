-- =============================================================================
-- PATRIMÔNIO — FASE 3: conferência (inventário) de ativos
-- =============================================================================
-- Espelha inventory_counts/inventory_count_items (stock_phase2.sql:39-66), com
-- UMA diferença essencial: ativo não tem QUANTIDADE, tem PRESENÇA.
--
-- Por isso "systemQty/countedQty/difference" do estoque viram um único campo
-- `status` (pending|found|missing|moved|unexpected), e a acuracidade é
-- encontrados/esperados — que é exatamente o ramo de fallback da fórmula do
-- estoque quando não há base de quantidade (inventory-service.ts:123).
--
-- "moved" é o caso interessante: o ativo existe, mas apareceu em outro lugar.
-- Ao fechar a campanha com "applyMoves", o sistema corrige o local do ativo e
-- registra a correção em asset_movements — a conferência vira fonte de verdade.
--
-- Convenções: camelCase entre aspas; "propertyId"/"cabinId" TEXT, resto UUID.
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- Depende de patrimonio_phase1.sql (asset_movements).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.asset_inventory_counts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"      TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "locationId"      UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,  -- null = todos
  "cabinId"         TEXT REFERENCES public.cabins(id) ON DELETE SET NULL,
  scope             JSONB NOT NULL DEFAULT '[]'::jsonb,   -- categoryIds ([] = todas)
  status            TEXT NOT NULL DEFAULT 'counting',     -- open|counting|closed
  "expectedCount"   INTEGER NOT NULL DEFAULT 0,
  "foundCount"      INTEGER,
  "missingCount"    INTEGER,
  "movedCount"      INTEGER,
  "unexpectedCount" INTEGER,
  accuracy          NUMERIC(5,2),
  "applyMoves"      BOOLEAN NOT NULL DEFAULT true,        -- ao fechar, corrige o local
  "createdBy"       TEXT,
  "createdByName"   TEXT,
  "startedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "closedAt"        TIMESTAMPTZ,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_inv_counts_property
  ON public.asset_inventory_counts("propertyId", "createdAt" DESC);

-- Só uma campanha aberta por vez: é o que permite bipar um código sem precisar
-- dizer em qual conferência ele entra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_inv_counts_one_open
  ON public.asset_inventory_counts("propertyId") WHERE status <> 'closed';

CREATE TABLE IF NOT EXISTS public.asset_inventory_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "countId"            UUID NOT NULL REFERENCES public.asset_inventory_counts(id) ON DELETE CASCADE,
  "assetId"            UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  "expectedLocationId" UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  "expectedCabinId"    TEXT REFERENCES public.cabins(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'pending',  -- pending|found|missing|moved|unexpected
  "foundLocationId"    UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  "foundCabinId"       TEXT REFERENCES public.cabins(id) ON DELETE SET NULL,
  "checkedAt"          TIMESTAMPTZ,
  "checkedBy"          TEXT,
  "checkedByName"      TEXT,
  notes                TEXT,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- O equivalente do estoque não tem esta constraint; aqui ela evita o duplo bipe.
  UNIQUE ("countId", "assetId")
);
CREATE INDEX IF NOT EXISTS idx_asset_inv_items_count ON public.asset_inventory_items("countId");
CREATE INDEX IF NOT EXISTS idx_asset_inv_items_asset ON public.asset_inventory_items("assetId");

-- ── RLS (padrão *_auth_all) ──────────────────────────────────────────────────
ALTER TABLE public.asset_inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_inventory_items  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['asset_inventory_counts','asset_inventory_items'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_auth_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t || '_auth_all', t);
  END LOOP;
END $$;

-- ── Realtime (idempotente) ───────────────────────────────────────────────────
ALTER TABLE public.asset_inventory_counts REPLICA IDENTITY FULL;
ALTER TABLE public.asset_inventory_items  REPLICA IDENTITY FULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['asset_inventory_counts','asset_inventory_items'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    END IF;
  END LOOP;
END $$;
