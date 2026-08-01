-- =============================================================================
-- ESTOQUE — DESTINO "COLABORADOR" NA MOVIMENTAÇÃO
-- =============================================================================
-- Pedido do estoquista (31/07/2026): nas transferências, registrar PARA QUEM
-- (colaborador) o material foi entregue.
--
-- Modelo: cabanas já são locais próprios (stock_locations tipo 'cabin'), então
-- a lista de destinos só precisou ser AGRUPADA na UI — sem mudança de schema.
-- Colaborador é diferente: seriam ~40 locais novos e um saldo por pessoa que
-- ninguém zera. Então vira um DETALHE do local: cria-se UM local do tipo 'staff'
-- (ex.: "COLABORADORES") e a movimentação guarda quem recebeu/devolveu.
-- O saldo continua sendo do local; estas colunas são rastreabilidade.
--
-- stock_locations.type é TEXT — o tipo 'staff' não precisa de migration.
-- staff: TEXT sem FK, mesmo padrão de stock_movements."performedBy".
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- =============================================================================

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS "fromStaffId" TEXT,
  ADD COLUMN IF NOT EXISTS "toStaffId"   TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_movements_to_staff ON public.stock_movements("toStaffId");
