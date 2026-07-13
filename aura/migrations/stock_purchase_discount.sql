-- Desconto na nota de compra (Estoque → Compras).
-- "totalValue" passa a ser o valor líquido: soma dos itens − "discountValue".
-- Aplicar ANTES do deploy que grava o campo, senão o salvar da compra quebra.

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS "discountValue" NUMERIC(12,2) NOT NULL DEFAULT 0;
