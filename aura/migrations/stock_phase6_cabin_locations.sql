-- =============================================================================
-- ESTOQUE — FASE 6: CABANAS COMO LOCAIS DERIVADOS DA COLEÇÃO `cabins`
-- =============================================================================
-- A coluna stock_locations."cabinId" existe desde a Fase 0 e nunca foi usada.
-- A partir daqui ela é o VÍNCULO DE IDENTIDADE entre um local de estoque e uma
-- cabana: local com "cabinId" preenchido é derivado da cabana, some das listas
-- planas de local e passa a ser escolhido pelo seletor de dois passos.
--
-- ⚠️  ESTE ARQUIVO NÃO ATUALIZA DADOS — E NÃO DEVE PASSAR A ATUALIZAR.
-- Os ~20 locais "CABANA N" que já existem têm SALDO e HISTÓRICO. Vinculá-los por
-- UPDATE às cegas (casando nome com número) é justamente o que não pode ser
-- feito: o casamento é proposto pelo servidor e CONFIRMADO PELO USUÁRIO na aba
-- Cabanas (Estoque → Configurações), que grava só o "cabinId", linha a linha.
-- Se você veio aqui para "resolver de uma vez com um UPDATE": não resolva.
--
-- Pré-checagem — precisa voltar 0 linhas antes de aplicar:
--   SELECT "propertyId", "cabinId", count(*)
--     FROM public.stock_locations
--    WHERE "cabinId" IS NOT NULL
--    GROUP BY 1, 2 HAVING count(*) > 1;
--
-- Aplicar ANTES de qualquer vínculo: hoje todos os "cabinId" são NULL, então o
-- índice único sobe instantâneo e não restringe nada. Depois de vincular, uma
-- duplicata faria a criação do índice falhar.
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- =============================================================================

-- Uma cabana = no máximo um local de estoque por propriedade.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_locations_cabin
  ON public.stock_locations("propertyId", "cabinId") WHERE "cabinId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_locations_cabin
  ON public.stock_locations("cabinId");
