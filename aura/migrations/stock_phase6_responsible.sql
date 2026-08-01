-- =============================================================================
-- ESTOQUE — FASE 6: RESPONSÁVEL PELA AÇÃO + LANÇAMENTO EM LOTE
-- =============================================================================
-- "responsibleId" é QUEM RESPONDE pela movimentação — começa preenchido com o
-- usuário logado e pode ser trocado no formulário.
-- "performedBy" continua sendo QUEM OPEROU o sistema (derivado da sessão em
-- requireAuth, não forjável). São coisas diferentes e ambas ficam registradas.
--
-- "batchRef" agrupa as movimentações lançadas juntas em lote — é o que permite
-- mostrar o lote no histórico e estorná-lo inteiro (revertBatch).
--
-- TEXT sem FK, mesmo padrão de "performedBy" e "fromStaffId": funcionário
-- desligado (ou removido) não quebra o histórico.
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- Seguro aplicar com a produção rodando o código atual: colunas anuláveis sem
-- default (sem rewrite da tabela) e o INSERT existente lista as colunas.
-- =============================================================================

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS "responsibleId"   TEXT,
  ADD COLUMN IF NOT EXISTS "responsibleName" TEXT,
  ADD COLUMN IF NOT EXISTS "batchRef"        UUID;

CREATE INDEX IF NOT EXISTS idx_stock_movements_responsible
  ON public.stock_movements("responsibleId");

CREATE INDEX IF NOT EXISTS idx_stock_movements_batchref
  ON public.stock_movements("batchRef") WHERE "batchRef" IS NOT NULL;
