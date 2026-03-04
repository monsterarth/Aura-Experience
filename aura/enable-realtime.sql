-- Enable Realtime for the Aura Database tables
BEGIN;

-- Se a publicação não existir, criamos. Se já existir, isso pode dar erro, então fazemos apenas as adições
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
  END IF;
END $$;

-- Adiciona AS TABELAS QUE PRECISAM DE REALTIME explicitamente
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.communications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.housekeeping_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_tasks;

-- Adiciona AS COLUNAS FALTANTES na tabela de messages
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT,
ADD COLUMN IF NOT EXISTS "originalBody" TEXT;

COMMIT;
