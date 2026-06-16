-- =============================================================================
-- MÓDULO ESTOQUE — FASE 3: integração (o "elo") + remoção do frigobar
-- =============================================================================
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- O toggle do módulo (hasStock) vive em properties.settings (JSONB) — sem DDL.
-- =============================================================================

-- Vínculo do item de Concierge ao produto do estoque (integração de consumo)
ALTER TABLE public.concierge_items
  ADD COLUMN IF NOT EXISTS "productId" UUID REFERENCES public.stock_products(id) ON DELETE SET NULL;

-- Local de consumo padrão (de onde concierge/F&B dão baixa)
ALTER TABLE public.stock_settings
  ADD COLUMN IF NOT EXISTS "defaultSaleLocationId" UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL;

-- (As tabelas do frigobar são dropadas na migration da etapa 3B, junto com a
--  remoção do código que as referencia — ver stock_phase3b_drop_minibar.sql.)
