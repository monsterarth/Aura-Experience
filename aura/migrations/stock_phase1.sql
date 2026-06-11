-- =============================================================================
-- MÓDULO ESTOQUE — FASE 1
--   Track A: suppliers, purchases, purchase_items (recebimento gera entradas)
--   Track B: assets (patrimônio com depreciação linear + garantia)
-- =============================================================================
-- Mesmas convenções da Fase 0: PK uuid, colunas camelCase entre aspas,
-- "propertyId"/"cabinId" são TEXT. Aplicar no SQL Editor do Supabase.
-- asset_depreciation_entries + cron de depreciação ficam para a Fase 2.
-- =============================================================================

-- ── FORNECEDORES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"    TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  cnpj            TEXT,
  email           TEXT,
  phone           TEXT,
  "contactPerson" TEXT,
  address         TEXT,
  "paymentTerms"  TEXT,
  category        TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_property ON public.suppliers("propertyId");

-- ── COMPRAS (notas) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"    TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "supplierId"    UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  "locationId"    UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL, -- local de recebimento
  "invoiceNumber" TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft|ordered|received|cancelled
  "isEmergency"   BOOLEAN NOT NULL DEFAULT false,
  "orderDate"     DATE,
  "receivedDate"  TIMESTAMPTZ,
  "totalValue"    NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_property ON public.purchases("propertyId");
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases("supplierId");

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchaseId"  UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  "productId"   UUID NOT NULL REFERENCES public.stock_products(id) ON DELETE CASCADE,
  quantity      NUMERIC(12,3) NOT NULL DEFAULT 0,
  "unitCost"    NUMERIC(12,4) NOT NULL DEFAULT 0,
  "totalCost"   NUMERIC(12,2) NOT NULL DEFAULT 0,
  "expiryDate"  DATE,
  "batchCode"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items("purchaseId");

-- ── PATRIMÔNIO (ativos duráveis) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"         TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  "assetTag"           TEXT,                                   -- nº de patrimônio
  "categoryId"         UUID REFERENCES public.stock_categories(id) ON DELETE SET NULL,
  "locationId"         UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  "cabinId"            TEXT REFERENCES public.cabins(id) ON DELETE SET NULL,
  "serialNumber"       TEXT,
  brand                TEXT,
  model                TEXT,
  "acquisitionDate"    DATE,
  "acquisitionCost"    NUMERIC(12,2) NOT NULL DEFAULT 0,
  "supplierId"         UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  "purchaseId"         UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  "depreciationMethod" TEXT NOT NULL DEFAULT 'linear',          -- 'linear' | 'none'
  "usefulLifeMonths"   INTEGER,
  "residualValue"      NUMERIC(12,2) NOT NULL DEFAULT 0,
  "depreciationStart"  DATE,
  status               TEXT NOT NULL DEFAULT 'active',          -- active|maintenance|inactive|disposed|written_off
  "warrantyUntil"      DATE,                                   -- garantia (opcional)
  "warrantyProvider"   TEXT,
  "warrantyDocUrl"     TEXT,
  "warrantyNotes"      TEXT,
  "imageUrl"           TEXT,
  notes                TEXT,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assets_property ON public.assets("propertyId");
CREATE INDEX IF NOT EXISTS idx_assets_category ON public.assets("categoryId");

-- ── RLS (authenticated; APIs usam service-role) ──────────────────────────────
ALTER TABLE public.suppliers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers','purchases','purchase_items','assets'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_auth_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t || '_auth_all', t);
  END LOOP;
END $$;

-- ── Realtime (idempotente) ───────────────────────────────────────────────────
ALTER TABLE public.suppliers      REPLICA IDENTITY FULL;
ALTER TABLE public.purchases      REPLICA IDENTITY FULL;
ALTER TABLE public.purchase_items REPLICA IDENTITY FULL;
ALTER TABLE public.assets         REPLICA IDENTITY FULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers','purchases','purchase_items','assets'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    END IF;
  END LOOP;
END $$;
