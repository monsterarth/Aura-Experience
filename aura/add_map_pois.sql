-- Migration: cria a tabela de Pontos de Interesse (MapPoi)
-- Executar no Supabase SQL Editor antes de usar a funcionalidade de POIs no mapa.

CREATE TABLE IF NOT EXISTS public.map_pois (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "propertyId"   TEXT NOT NULL,
  name           TEXT NOT NULL,
  name_en        TEXT,
  name_es        TEXT,
  description    TEXT,
  "mapPin"       JSONB,           -- { lat?, lng?, pixelX?, pixelY? }
  "pinIcon"      TEXT DEFAULT '📍',
  "pinColor"     TEXT DEFAULT '#6b7280',
  -- Categorias: gate | photo_spot | trail | parking | restaurant | bar | market | other
  category       TEXT NOT NULL DEFAULT 'other',
  photos         JSONB DEFAULT '[]',
  "externalLink" TEXT,            -- site ou link externo (restaurante, bar, etc.)
  "showOnMap"    BOOLEAN DEFAULT true,
  "createdAt"    TIMESTAMPTZ DEFAULT now()
);

-- RLS: acesso restrito à propriedade (mesmo padrão das outras tabelas)
ALTER TABLE public.map_pois ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map_pois_property_access" ON public.map_pois
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Índice para buscas por propriedade
CREATE INDEX IF NOT EXISTS map_pois_property_idx ON public.map_pois ("propertyId");
