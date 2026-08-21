-- =============================================================================
-- REPOSIÇÃO (camareira/governanta → mensageiro) — Etapa B, extraída do Concierge
-- =============================================================================
-- O pedido de reposição deixa de ser item de Concierge (flag "Camareira") e
-- vira feature do módulo Estoque: aponta PRODUTO do estoque, nunca toca fólio.
-- Fluxo: camareira pede → mensageiro assume (precondição de status barra o
-- assumir duplo) → entrega → baixa automática (exit, referenceType 'restock')
-- da fonte resolvida por produto→categoria, com fallback pro local de maior
-- saldo quando a fonte está em falta.
--
-- Convenções: "propertyId"/"cabinId" TEXT; camelCase entre aspas; idempotente.
-- Aplicar no SQL Editor do Supabase ANTES do deploy do código da Etapa B.
-- =============================================================================

-- Pré-check (esperar NULL = tabela ainda não existe):
-- SELECT to_regclass('public.restock_requests');

CREATE TABLE IF NOT EXISTS public.restock_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"          TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "cabinId"             TEXT REFERENCES public.cabins(id) ON DELETE SET NULL,
  "productId"           UUID NOT NULL REFERENCES public.stock_products(id) ON DELETE CASCADE,
  quantity              NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','in_progress','delivered','not_delivered','cancelled')),
  "notDeliveredReason"  TEXT,
  "requestedById"       TEXT,
  "requestedByName"     TEXT,
  "requestedByRole"     TEXT,                -- 'maid' | 'governance' (badge no app do mensageiro)
  "assignedTo"          TEXT,
  "assignedName"        TEXT,
  "plannedSourceId"     UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL, -- fonte resolvida na criação
  "fallbackSourceId"    UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL, -- "pegar no estoque Y"
  "sourceLocationId"    UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL, -- fonte REALMENTE usada na entrega
  notes                 TEXT,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "assignedAt"          TIMESTAMPTZ,
  "deliveredAt"         TIMESTAMPTZ,
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_restock_requests_prop_status ON public.restock_requests("propertyId", status);
CREATE INDEX IF NOT EXISTS idx_restock_requests_created     ON public.restock_requests("createdAt");

-- RLS: padrão das tabelas internas (APIs usam service-role; realtime no browser
-- precisa de leitura autenticada).
ALTER TABLE public.restock_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS restock_requests_auth_all ON public.restock_requests;
CREATE POLICY restock_requests_auth_all ON public.restock_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime (payload completo + publicação, idempotente).
ALTER TABLE public.restock_requests REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'restock_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.restock_requests;
  END IF;
END $$;

-- Catálogo + fonte de baixa ---------------------------------------------------
-- Produto: entra no catálogo da camareira ("maidRequestable") e define a fonte
-- de baixa ('default' segue a categoria | 'none' não baixa | 'location' fixa).
-- Categoria: fonte padrão dos produtos dela (NULL = "nenhum", sem baixa).
ALTER TABLE public.stock_products
  ADD COLUMN IF NOT EXISTS "maidRequestable"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "deductMode"       TEXT    NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS "deductLocationId" UUID    REFERENCES public.stock_locations(id) ON DELETE SET NULL;
ALTER TABLE public.stock_products DROP CONSTRAINT IF EXISTS stock_products_deduct_mode_check;
ALTER TABLE public.stock_products ADD CONSTRAINT stock_products_deduct_mode_check
  CHECK ("deductMode" IN ('default','none','location'));

ALTER TABLE public.stock_categories
  ADD COLUMN IF NOT EXISTS "deductLocationId" UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL;

-- Verificação:
-- SELECT count(*) FROM public.restock_requests;                                -- 0
-- SELECT "deductMode", count(*) FROM public.stock_products GROUP BY 1;         -- tudo 'default'
-- SELECT count(*) FROM public.stock_categories WHERE "deductLocationId" IS NOT NULL;  -- 0
