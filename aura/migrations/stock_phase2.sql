-- =============================================================================
-- MÓDULO ESTOQUE — FASE 2
--   Lotes (validade/FIFO) · Inventário físico · Lançamentos de depreciação
-- =============================================================================
-- Convenções da Fase 0/1. Aplicar no SQL Editor do Supabase. Idempotente.
-- =============================================================================

-- ── LOTES (apenas para produtos com trackExpiry) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"  TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "productId"   UUID NOT NULL REFERENCES public.stock_products(id)  ON DELETE CASCADE,
  "locationId"  UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  "batchCode"   TEXT,
  quantity      NUMERIC(12,3) NOT NULL DEFAULT 0,   -- saldo restante do lote
  "unitCost"    NUMERIC(12,4) NOT NULL DEFAULT 0,
  "expiryDate"  DATE,
  "purchaseId"  UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_batches_property ON public.stock_batches("propertyId");
CREATE INDEX IF NOT EXISTS idx_stock_batches_fifo     ON public.stock_batches("productId","locationId","expiryDate");
CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry   ON public.stock_batches("expiryDate");

-- FK do movimento -> lote (coluna batchId já existe desde a Fase 0)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_batch_fk'
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_batch_fk
      FOREIGN KEY ("batchId") REFERENCES public.stock_batches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── INVENTÁRIO FÍSICO ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"    TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "locationId"    UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL, -- null = todos os locais
  scope           JSONB DEFAULT '[]'::jsonb,        -- categoryIds incluídas ([] = todas)
  status          TEXT NOT NULL DEFAULT 'open',     -- open|counting|closed
  accuracy        NUMERIC(5,2),                     -- % definida ao fechar
  "createdBy"     TEXT,
  "createdByName" TEXT,
  "startedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "closedAt"      TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_property ON public.inventory_counts("propertyId");

CREATE TABLE IF NOT EXISTS public.inventory_count_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "countId"     UUID NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  "productId"   UUID NOT NULL REFERENCES public.stock_products(id) ON DELETE CASCADE,
  "locationId"  UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  "systemQty"   NUMERIC(12,3) NOT NULL DEFAULT 0,   -- snapshot do saldo no momento da abertura
  "countedQty"  NUMERIC(12,3),                      -- null = ainda não contado
  difference    NUMERIC(12,3),
  adjusted      BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_count_items_count ON public.inventory_count_items("countId");

-- ── DEPRECIAÇÃO (lançamentos mensais) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.asset_depreciation_entries (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"              TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "assetId"                 UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  period                    TEXT NOT NULL,           -- YYYY-MM
  amount                    NUMERIC(12,2) NOT NULL DEFAULT 0,
  "accumulatedDepreciation" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "bookValue"               NUMERIC(12,2) NOT NULL DEFAULT 0,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("assetId", period)
);
CREATE INDEX IF NOT EXISTS idx_asset_depr_property ON public.asset_depreciation_entries("propertyId");

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_batches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_depreciation_entries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_batches','inventory_counts','inventory_count_items','asset_depreciation_entries'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_auth_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t || '_auth_all', t);
  END LOOP;
END $$;

-- ── Realtime (idempotente) ───────────────────────────────────────────────────
ALTER TABLE public.stock_batches         REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_counts      REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_count_items REPLICA IDENTITY FULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_batches','inventory_counts','inventory_count_items'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    END IF;
  END LOOP;
END $$;
