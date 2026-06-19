-- =============================================================================
-- MÓDULO ESTOQUE — FASE 5: ficha técnica do Concierge + indisponibilidade
-- (Fase 4 = dashboard "Visão Geral", sem migration.)
-- =============================================================================
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- Evolui o vínculo 1:1 (concierge_items.productId, Fase 3) para uma ficha
-- técnica: cada item pode baixar VÁRIOS produtos, cada um com sua quantidade
-- de consumo por unidade entregue (mesmo modelo de fb_menu_items.ingredients).
-- =============================================================================

-- Toggle "Baixar do estoque" por item de Concierge
ALTER TABLE public.concierge_items
  ADD COLUMN IF NOT EXISTS "deductFromStock" BOOLEAN NOT NULL DEFAULT false;

-- Ficha técnica: [{ productId, consumptionQty, unit?, name? }]
ALTER TABLE public.concierge_items
  ADD COLUMN IF NOT EXISTS "stockComponents" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: todo item já vinculado (Fase 3, razão 1:1) vira uma ficha de 1 linha.
-- Só roda em itens ainda sem ficha, para ser idempotente.
UPDATE public.concierge_items
SET
  "deductFromStock" = true,
  "stockComponents" = jsonb_build_array(
    jsonb_build_object('productId', "productId", 'consumptionQty', 1)
  )
WHERE "productId" IS NOT NULL
  AND ("stockComponents" IS NULL OR "stockComponents" = '[]'::jsonb);

-- A coluna "productId" fica DEPRECADA (não é dropada) — segurança/rollback.
-- A lógica de baixa e de disponibilidade passa a ler "stockComponents".
