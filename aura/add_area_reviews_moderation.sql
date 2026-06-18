-- ============================================================
-- Fase E — Avaliações de área: moderação + dedup (idempotente)
-- Rode no SQL editor do Supabase.
-- ============================================================

ALTER TABLE public.structure_reviews
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

-- Preserva visibilidade das avaliações JÁ existentes (novas entram como 'pending').
UPDATE public.structure_reviews SET status = 'approved' WHERE status IS NULL OR status = 'pending';

-- Dedup: 1 avaliação por estadia + área (permite upsert/edição).
CREATE UNIQUE INDEX IF NOT EXISTS uq_structure_reviews_stay_struct
  ON public.structure_reviews ("stayId", "structureId")
  WHERE "stayId" IS NOT NULL;

-- Visibilidade pública é opt-in por propriedade em properties.settings.areaReviews.public
-- (default ausente = privado/só equipe). Configurável no admin (Avaliações de áreas).
