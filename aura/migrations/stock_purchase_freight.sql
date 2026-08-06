-- =============================================================================
-- TAXA DE ENTREGA (frete) na nota de compra — Estoque → Compras
-- =============================================================================
-- Contexto: como não havia campo, o frete vinha sendo lançado como um PRODUTO
-- ("TAXA DE ENTREGA", unidade kg) só para fechar o valor da NF. Isso criava
-- entradas de estoque fantasmas (5 "kg" de taxa parados no saldo, R$ 25 no
-- valor em estoque) e sujava as movimentações.
--
-- Agora "purchases.freightValue" é um campo da nota, como o desconto:
--   totalValue = soma dos itens + freightValue − discountValue
-- A taxa NÃO rateia no custo médio dos produtos (mesma regra do desconto).
--
-- Aplicar ANTES do deploy que grava o campo, senão o salvar da compra quebra.
-- Idempotente: rodar de novo não faz nada (as seções 2–5 já não encontram dados).
--
-- BACKUP dos registros tocados (produção, coletado em 2026-08-05):
--   produto             a8f6291f-73ab-480d-b964-9acf24cf5537  "TAXA DE ENTREGA"  (fazenda-do-rosa)
--   purchase_items (5)  1889e1e9-df2d-41b7-af6c-883d2ac595fa  NF 75069  R$ 5,00
--                       c7fb7c6c-1c31-4d46-b0bb-b82259631415  NF 75235  R$ 5,00
--                       eb2f89f0-c140-4c6d-84c4-96a8a9ac6a91  NF 75432  R$ 5,00
--                       97e8d3a3-bbc8-4c87-a7ad-fb668ba6adf7  NF 75642  R$ 5,00
--                       80cf2eb3-16da-4b24-b69d-8a9dc917e850  NF 75857  R$ 5,00
--   stock_movements (5) 1ab70bfa / 80a2ddb0 / 1f8c9013 / e661f93e / b11c85ec  (entry, 1 un, R$ 5)
--   stock_balances (1)  ccc99942-b907-4b9a-9bb4-ae5c908e4805  qtd 5 @ local 19557562-…
--   stock_batches (0)
-- Os 5 totalValue das compras NÃO mudam: o que era item vira frete.
-- =============================================================================

-- 1) Campo na nota -----------------------------------------------------------
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS "freightValue" NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Confere quem mais existe (outras propriedades / outros nomes) antes de seguir:
-- SELECT id, "propertyId", name, active, deleted FROM public.stock_products
--  WHERE name ILIKE '%taxa%' OR name ILIKE '%frete%' OR name ILIKE '%entrega%';

-- 2) Itens "TAXA DE ENTREGA" viram freightValue da nota ----------------------
UPDATE public.purchases p
   SET "freightValue" = agg.v,
       "updatedAt"    = now()
  FROM (
    SELECT "purchaseId" AS pid, SUM("totalCost")::numeric(12,2) AS v
      FROM public.purchase_items
     WHERE "productId" = 'a8f6291f-73ab-480d-b964-9acf24cf5537'
     GROUP BY "purchaseId"
  ) agg
 WHERE p.id = agg.pid;

-- 3) Remove os itens fantasmas ------------------------------------------------
DELETE FROM public.purchase_items
 WHERE "productId" = 'a8f6291f-73ab-480d-b964-9acf24cf5537';

-- 4) Desfaz a entrada de estoque que o recebimento gerou ----------------------
DELETE FROM public.stock_movements
 WHERE "productId" = 'a8f6291f-73ab-480d-b964-9acf24cf5537';

DELETE FROM public.stock_balances
 WHERE "productId" = 'a8f6291f-73ab-480d-b964-9acf24cf5537';

-- 5) Aposenta o produto (soft-delete, preserva o id em qualquer referência) ---
UPDATE public.stock_products
   SET deleted     = true,
       active      = false,
       "updatedAt" = now()
 WHERE id = 'a8f6291f-73ab-480d-b964-9acf24cf5537';

-- Verificação ----------------------------------------------------------------
-- SELECT "invoiceNumber", "totalValue", "freightValue", "discountValue"
--   FROM public.purchases WHERE "freightValue" > 0 ORDER BY "createdAt";
-- Esperado: 5 notas (75069 · 75235 · 75432 · 75642 · 75857) com freightValue = 5,00
-- e totalValue inalterado (127.42 · 129.51 · 133.37 · 143.95 · 88.89).
