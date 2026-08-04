-- ============================================================================
-- CASAMENTOS — status "perdido" para negociações que não frutificaram
-- (2026-08-04)
--
-- Faltava fechar o funil: um casamento 'tentative' que não converte hoje ou
-- fica em negociação para sempre (poluindo a lista ativa) ou é marcado como
-- 'cancelled' — o que é outra coisa. Cancelado = contrato fechado que caiu;
-- perdido = negociação que nunca virou contrato. Misturar os dois inviabiliza
-- qualquer leitura de taxa de conversão.
--
-- A coluna status tem CHECK constraint, então o valor novo exige recriá-la.
-- O nome da constraint varia conforme foi criada, então localizamos pela
-- definição em vez de chutar o nome.
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- ── 1. Motivo e data da perda ───────────────────────────────────────────────

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS "lostReason" TEXT;

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS "lostAt" TIMESTAMPTZ;

-- ── 2. Constraint de status aceita 'lost' ───────────────────────────────────

DO $$
DECLARE
  c RECORD;
BEGIN
  -- Remove qualquer CHECK que mencione a coluna status (nome não é garantido).
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel  ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'public'
       AND rel.relname = 'weddings'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.weddings DROP CONSTRAINT %I;', c.conname);
    RAISE NOTICE 'Constraint antiga removida: %', c.conname;
  END LOOP;

  ALTER TABLE public.weddings
    ADD CONSTRAINT weddings_status_check
    CHECK (status IN ('tentative', 'confirmed', 'completed', 'cancelled', 'lost'));
END $$;

-- ── 3. Conferência ──────────────────────────────────────────────────────────

SELECT pg_get_constraintdef(con.oid) AS constraint_status
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
 WHERE rel.relname = 'weddings' AND con.conname = 'weddings_status_check';

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'weddings'
   AND column_name IN ('lostReason', 'lostAt')
 ORDER BY column_name;
