-- Migration: adiciona o campo de Instagram aos Pontos de Interesse (MapPoi)
-- Executar no Supabase SQL Editor.

ALTER TABLE public.map_pois
  ADD COLUMN IF NOT EXISTS instagram TEXT;   -- @usuario ou URL do perfil
