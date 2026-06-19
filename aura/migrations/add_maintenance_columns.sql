-- Script para adicionar os novos campos na tabela maintenance_tasks
-- Acesse o SQL Editor no painel do Supabase e execute o seguinte comando:

ALTER TABLE public.maintenance_tasks
ADD COLUMN IF NOT EXISTS "blocksCabin" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "expectedStart" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "expectedEnd" timestamp with time zone;

-- Depois de executar, a nova funcionalidade do Mapa de Reservas irá automaticamente 
-- enviar e ler essas colunas quando uma manutenção interditar a acomodação.
