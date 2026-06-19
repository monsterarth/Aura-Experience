-- Enable Realtime for the Aura Database tables
-- Execute this SQL in the Supabase Dashboard SQL Editor
-- Go to: https://supabase.com/dashboard > SQL Editor > New Query

BEGIN;

-- ==============================================
-- PASSO 1: Garantir que a publicação existe
-- ==============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
  END IF;
END $$;

-- ==============================================
-- PASSO 2: Adicionar TODAS as tabelas que precisam de Realtime
-- Usamos blocos DO $$ para ignorar erros se a tabela já estiver na publicação
-- ==============================================

-- Comunicação (Chat WhatsApp)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.communications; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Governança (Housekeeping Kanban)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.housekeeping_tasks; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Manutenção (Maintenance Kanban)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_tasks; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estadias (Stays Page + StayDetailsModal)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.stays; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Folio / Conta de Consumo (StayDetailsModal)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.folio_items; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Agendamentos de Estruturas (Bookings Page)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.structure_bookings; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cabanas e Estruturas (para futuro uso com status realtime)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cabins; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.structures; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- ==============================================
-- VERIFICAÇÃO: Execute este SELECT para confirmar quais tabelas estão ativas
-- ==============================================
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
