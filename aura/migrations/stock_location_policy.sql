-- =============================================================================
-- ESTOQUE — POLÍTICA DE LOCAL: PONTO DE CONSUMO (Etapa A)
-- =============================================================================
-- Setores (MANUTENCAO, REFEITORIO, LAVANDERIA, CASA 28...) são centros de
-- custo, não estoques: transferências para eles acumulavam saldo fantasma
-- que ninguém baixava (90d: 153 transferências × 29 saídas). A conversão
-- transferência→saída acontece NO REGISTRO (StockService.registerMovement) —
-- o banco só guarda a política de cada local e a isenção por produto.
--
--   stock_locations."policy":
--     'stock'              → estoque de verdade (padrão; nada muda)
--     'consume_all'        → ponto de consumo: transferência p/ cá vira SAÍDA
--     'consume_categories' → misto: só as categorias em "consumeCategoryIds"
--   stock_products."neverConsume":
--     bem durável (ex.: toalha de rosto) — nunca converte, mantém saldo real
--     no ponto de consumo. Categorias appliesTo='asset' são isentas por regra
--     de código, sem coluna.
--
-- Convenções: "propertyId" TEXT; camelCase entre aspas; idempotente.
-- Aplicar no SQL Editor do Supabase ANTES do deploy do código da Etapa A
-- (upsertLocation grava as colunas novas via spread).
-- Sem RLS/realtime novos — tabelas já existentes e publicadas.
-- =============================================================================

-- Pré-check (rodar antes; esperar 0 linhas = colunas ainda não existem):
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_name IN ('stock_locations','stock_products')
--    AND column_name IN ('policy','consumeCategoryIds','neverConsume');

ALTER TABLE public.stock_locations
  ADD COLUMN IF NOT EXISTS "policy"             TEXT  NOT NULL DEFAULT 'stock',
  ADD COLUMN IF NOT EXISTS "consumeCategoryIds" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- CHECK recriada de forma idempotente (padrão weddings_status_lost.sql):
ALTER TABLE public.stock_locations DROP CONSTRAINT IF EXISTS stock_locations_policy_check;
ALTER TABLE public.stock_locations ADD CONSTRAINT stock_locations_policy_check
  CHECK ("policy" IN ('stock','consume_all','consume_categories'));

ALTER TABLE public.stock_products
  ADD COLUMN IF NOT EXISTS "neverConsume" BOOLEAN NOT NULL DEFAULT false;

-- Verificação:
-- SELECT "policy", count(*) FROM public.stock_locations GROUP BY 1;   -- tudo 'stock'
-- SELECT count(*) FROM public.stock_products WHERE "neverConsume";    -- 0
