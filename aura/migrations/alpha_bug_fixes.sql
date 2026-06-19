-- ============================================================
-- ALPHA BUG FIXES — Aura Experience
-- Execute no Supabase Dashboard (SQL Editor) em ordem
-- ============================================================

-- ============================================================
-- FIX 1: Prevenir double-booking de hospedagens na mesma cabana
-- Requer btree_gist para exclusion constraints com date ranges
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Antes de criar a constraint, remover eventuais overlaps existentes (AVISO: verifique manualmente)
-- ALTER TABLE stays ADD CONSTRAINT stays_no_overlap
--   EXCLUDE USING GIST (
--     "cabinId" WITH =,
--     daterange("checkIn"::date, "checkOut"::date, '[)') WITH &&
--   )
--   WHERE (status NOT IN ('cancelled', 'archived', 'finished'));
--
-- NOTA: Descomente a linha acima APENAS após confirmar que não há stays sobrepostas no banco.
-- Para verificar overlaps existentes:
-- SELECT a.id, a."cabinId", a."checkIn", a."checkOut", b.id, b."checkIn", b."checkOut"
-- FROM stays a
-- JOIN stays b ON a."cabinId" = b."cabinId" AND a.id < b.id
-- WHERE a.status NOT IN ('cancelled','archived','finished')
--   AND b.status NOT IN ('cancelled','archived','finished')
--   AND a."checkIn" < b."checkOut" AND a."checkOut" > b."checkIn";

-- ============================================================
-- FIX 3: Prevenir pedidos de café duplicados (mesmo stay + data + tipo)
-- ============================================================

-- Passo 1: Verificar e remover duplicatas existentes (mantém o mais antigo de cada grupo)
DELETE FROM fb_orders
WHERE id NOT IN (
  SELECT DISTINCT ON (stay_id, delivery_date, type) id
  FROM fb_orders
  ORDER BY stay_id, delivery_date, type, created_at ASC
);

-- Passo 2: Adicionar constraint única
ALTER TABLE fb_orders
  DROP CONSTRAINT IF EXISTS fb_orders_unique_stay_date_type;

ALTER TABLE fb_orders
  ADD CONSTRAINT fb_orders_unique_stay_date_type
  UNIQUE (stay_id, delivery_date, type);

-- ============================================================
-- FIX 4: Prevenir duplicação de tarefas de manutenção recorrentes
-- ============================================================
ALTER TABLE maintenance_tasks
  ADD COLUMN IF NOT EXISTS "recurrenceSourceId" UUID,
  ADD COLUMN IF NOT EXISTS "recurrenceDate" DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_recurrence_unique
  ON maintenance_tasks ("recurrenceSourceId", "recurrenceDate")
  WHERE "recurrenceSourceId" IS NOT NULL;

-- ============================================================
-- FIX 7: Prevenir pedidos duplicados no concierge (mesmo item pendente)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_concierge_pending_dedup
  ON concierge_requests ("stayId", "itemId")
  WHERE status = 'pending';

-- ============================================================
-- FEATURE: Cesta especial de café da manhã por estadia
-- ============================================================
ALTER TABLE stays
  ADD COLUMN IF NOT EXISTS "cestaBreakfastEnabled" BOOLEAN DEFAULT false;
