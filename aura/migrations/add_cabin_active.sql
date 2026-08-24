-- Cabana ativa / fora de operação.
--
-- A grade de "Últimas saídas" mostra uma cabana por card, e para isso precisa
-- saber quais cabanas contam. Existia só `ignoreInOccupancy` ("extra / uso da
-- casa", não entra na taxa de ocupação), que é outra pergunta: uma cabana pode
-- contar na ocupação e ainda assim estar fora de operação (reforma longa,
-- desativada, saiu do inventário).
--
-- `status = 'maintenance'` também não serve: é transitório e a cabana volta.
--
-- Aditivo e idempotente. Default true: toda cabana existente continua ativa.

ALTER TABLE cabins
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN cabins.active IS
  'false = cabana fora de operação (não aparece na grade de últimas saídas nem em listagens operacionais). Diferente de ignoreInOccupancy, que só tira da taxa de ocupação.';
