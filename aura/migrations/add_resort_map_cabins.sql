-- Adiciona posição no Mapa Interativo do Resort às cabanas.
-- Mesmo padrão de add_resort_map.sql (sem FK, colunas camelCase).
ALTER TABLE public.cabins ADD COLUMN IF NOT EXISTS "mapPin" JSONB;
