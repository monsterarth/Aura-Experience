-- ============================================================================
-- FINANCEIRO — Fase 2: diária pausável e editável por noite (2026-08-04)
--
-- Casos reais que a fase 1 não cobria:
--   · "pausar a diária automática" enquanto se resolve algo com o hóspede;
--   · negociar UMA noite por outro valor (ex.: 3 noites a 1000 e a última a 890);
--   · desfazer diárias lançadas por engano (check-in cadastrado errado).
--
-- Como funciona:
--   "lodgingPaused"    — true: o cron ignora a estadia (nada é lançado)
--   "nightlyOverrides" — { "2026-08-05": 890 } valor daquela noite
--                        { "2026-08-01": 0   } noite NÃO cobrada (pulada)
--
-- O override com 0 é o que impede o cron de recriar uma diária apagada: sem
-- ele, apagar o item só liberaria a trava do índice único e a noite voltaria
-- no dia seguinte.
--
-- Aplicar no SQL Editor do Supabase. Idempotente, sem DROP.
-- ============================================================================

ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS "lodgingPaused" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS "nightlyOverrides" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Conferência
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'stays'
  AND column_name IN ('lodgingPaused', 'nightlyOverrides')
ORDER BY column_name;
