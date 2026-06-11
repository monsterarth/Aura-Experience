-- =============================================================================
-- MÓDULO ESTOQUE — FASE 0 (Fundação)
-- =============================================================================
-- Tabelas: stock_categories, stock_locations, stock_products,
--          stock_balances, stock_movements, stock_settings
--
-- Convenções (alinhadas ao schema vivo coletado em 2026-06-11):
--   • PK uuid (gen_random_uuid()).
--   • Colunas camelCase entre aspas (padrão CLAUDE.md / tabela cabins).
--   • "propertyId" é TEXT  → properties.id é TEXT neste banco.
--   • "cabinId"    é TEXT  → cabins.id é TEXT neste banco.
--   • TIMESTAMPTZ DEFAULT now().
--
-- Aplicar no SQL Editor do Supabase. Idempotente (CREATE TABLE IF NOT EXISTS).
-- Lotes (stock_batches) e a FK stock_movements.batchId entram na FASE 2.
-- =============================================================================

-- 1) CATEGORIAS — compartilhadas entre consumível e patrimônio -----------------
CREATE TABLE IF NOT EXISTS public.stock_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"  TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  name_en       TEXT,
  name_es       TEXT,
  icon          TEXT,                                   -- emoji (ex.: 🧹)
  color         TEXT,
  "appliesTo"   TEXT NOT NULL DEFAULT 'consumable',     -- 'consumable' | 'asset' | 'both'
  "order"       INTEGER DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_categories_property ON public.stock_categories("propertyId");

-- 2) LOCAIS DE ESTOQUE ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"  TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'warehouse',      -- warehouse|kitchen|bar|laundry|cabin|other
  "cabinId"     TEXT REFERENCES public.cabins(id) ON DELETE SET NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_locations_property ON public.stock_locations("propertyId");

-- 3) PRODUTO MESTRE (consumível) ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"       TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  name_en            TEXT,
  name_es            TEXT,
  "categoryId"       UUID REFERENCES public.stock_categories(id) ON DELETE SET NULL,
  sku                TEXT,
  unit               TEXT NOT NULL DEFAULT 'un',        -- un|kg|g|L|ml|cx|pct...
  barcode            TEXT,
  "imageUrl"         TEXT,
  "trackExpiry"      BOOLEAN NOT NULL DEFAULT false,
  "minStock"         NUMERIC(12,3) NOT NULL DEFAULT 0,
  "maxStock"         NUMERIC(12,3),
  "averageCost"      NUMERIC(12,4) NOT NULL DEFAULT 0,  -- custo médio ponderado
  "lastPurchaseCost" NUMERIC(12,4),
  active             BOOLEAN NOT NULL DEFAULT true,
  deleted            BOOLEAN NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_products_property ON public.stock_products("propertyId");
CREATE INDEX IF NOT EXISTS idx_stock_products_category ON public.stock_products("categoryId");

-- 4) SALDO MATERIALIZADO por (produto, local) ---------------------------------
CREATE TABLE IF NOT EXISTS public.stock_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"  TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "productId"   UUID NOT NULL REFERENCES public.stock_products(id)  ON DELETE CASCADE,
  "locationId"  UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  quantity      NUMERIC(12,3) NOT NULL DEFAULT 0,
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("productId", "locationId")
);
CREATE INDEX IF NOT EXISTS idx_stock_balances_property ON public.stock_balances("propertyId");

-- 5) RAZÃO DE MOVIMENTAÇÕES (fonte da verdade) --------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"      TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "productId"       UUID NOT NULL REFERENCES public.stock_products(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,                      -- entry|exit|transfer|adjustment|loss
  quantity          NUMERIC(12,3) NOT NULL,
  "unitCost"        NUMERIC(12,4) NOT NULL DEFAULT 0,
  "totalCost"       NUMERIC(12,2) NOT NULL DEFAULT 0,
  "fromLocationId"  UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  "toLocationId"    UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  "batchId"         UUID,                               -- FK p/ stock_batches na FASE 2
  "lossType"        TEXT,                               -- expiry|damage|handling|other
  "referenceType"   TEXT NOT NULL DEFAULT 'manual',     -- purchase|consumption|manual|inventory|concierge|minibar|fb
  "referenceId"     TEXT,
  "performedBy"     TEXT,
  "performedByName" TEXT,
  notes             TEXT,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_property ON public.stock_movements("propertyId");
CREATE INDEX IF NOT EXISTS idx_stock_movements_product  ON public.stock_movements("productId");
CREATE INDEX IF NOT EXISTS idx_stock_movements_created  ON public.stock_movements("createdAt");

-- 6) PARÂMETROS CONFIGURÁVEIS (1 linha por propriedade) -----------------------
CREATE TABLE IF NOT EXISTS public.stock_settings (
  "propertyId"          TEXT PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  "noTurnoverDays"      INTEGER NOT NULL DEFAULT 60,    -- janela "sem giro"
  "expiryAlertLeadDays" INTEGER NOT NULL DEFAULT 30,    -- antecedência alerta de validade
  "autoLossOnExpiry"    BOOLEAN NOT NULL DEFAULT false,
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: habilita e libera acesso a usuários autenticados (padrão das tabelas
-- internas; as APIs usam service-role e ignoram RLS, mas o realtime no browser
-- precisa de leitura). Reveja/tighten depois se quiser políticas por papel.
ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_balances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_settings   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stock_categories','stock_locations','stock_products',
    'stock_balances','stock_movements','stock_settings'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I;', t || '_auth_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t || '_auth_all', t);
  END LOOP;
END $$;

-- Realtime: REPLICA IDENTITY FULL p/ payloads completos no postgres_changes.
ALTER TABLE public.stock_movements REPLICA IDENTITY FULL;
ALTER TABLE public.stock_balances  REPLICA IDENTITY FULL;
ALTER TABLE public.stock_products  REPLICA IDENTITY FULL;

-- OPCIONAL — só se a publicação supabase_realtime NÃO for "FOR ALL TABLES".
-- Se der erro dizendo que a publicação é FOR ALL TABLES, ignore (já está coberto).
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_balances;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_products;
