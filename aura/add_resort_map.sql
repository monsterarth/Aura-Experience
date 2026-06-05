-- ==========================================================================
-- Mapa Interativo de Resort
-- Camada espacial/visual sobre as Structures + avaliações por área.
-- Colunas em camelCase (entre aspas) para casar com as interfaces de aura.ts,
-- já que os services fazem select('*') e dão cast direto para o tipo.
-- mapConfig fica no JSON `settings` de `properties` (sem coluna nova).
-- ==========================================================================

-- 1) Camada de mapa nas estruturas existentes (piscinas, restaurantes, quadras...)
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS "showOnMap" BOOLEAN DEFAULT false;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS "mapPin"    JSONB;   -- { lat, lng, pixelX?, pixelY? }
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS "pinColor"  TEXT;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS "pinIcon"   TEXT;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS "amenities" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS "photos"    JSONB DEFAULT '[]'::jsonb;

-- 2) Avaliações por área feitas pelo hóspede
-- IDs como TEXT e sem foreign keys — segue o padrão das demais tabelas do projeto
-- (ex.: survey_responses), pois os IDs são strings geradas pela aplicação
-- (properties.id é o slug, não um UUID).
CREATE TABLE IF NOT EXISTS public.structure_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"  TEXT NOT NULL,
  "structureId" TEXT NOT NULL,
  "stayId"      TEXT,
  "guestId"     TEXT,
  "guestName"   TEXT,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  "createdAt"   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_structure_reviews_structure ON public.structure_reviews ("structureId");
CREATE INDEX IF NOT EXISTS idx_structure_reviews_property  ON public.structure_reviews ("propertyId");

-- Enable realtime
ALTER TABLE public.structure_reviews REPLICA IDENTITY FULL;
