-- ============================================================================
-- PETS — mais de um pet por estadia (2026-08-17)
--
-- O problema real: o pré-check-in só tinha lugar para UM pet ("petDetails",
-- objeto único). Hóspede com dois pets omitia o segundo e a recepção só
-- descobria na chegada.
--
-- Como funciona:
--   "pets"       — array de { name, breed, species, weight }, a fonte da verdade
--   "hasPet"     — MANTIDO, derivado de pets.length > 0. É o que alimenta as
--                  patinhas na lista de estadias, no mapa e na governança, além
--                  do gate da política pet no portal. Nada disso muda.
--   "petDetails" — MANTIDO como espelho de pets[0]. Legado: o StayDetailsModal
--                  ainda faz round-trip dele, e preserva o dado se a mudança
--                  precisar ser revertida.
--
-- A propriedade declara quantos aceita em properties.settings.maxPets (padrão 1),
-- mas isso NUNCA bloqueia o envio: o formulário avisa e registra do mesmo jeito.
-- Informação omitida é pior que informação fora da política.
--
-- APLICAR ANTES DO DEPLOY: StayService.updateStayData faz {...data} cru no
-- update. Com o código novo e sem a coluna, o PostgREST rejeita o UPDATE inteiro
-- e a ficha da estadia para de salvar.
--
-- Aplicar no SQL Editor do Supabase. Idempotente, sem DROP.
-- ============================================================================

ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS "pets" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: o pet único vira um array de um item.
-- to_jsonb() deixa a condição válida tanto para json quanto para jsonb.
UPDATE public.stays
   SET "pets" = jsonb_build_array(to_jsonb("petDetails"))
 WHERE "hasPet" IS TRUE
   AND "petDetails" IS NOT NULL
   AND jsonb_typeof(to_jsonb("petDetails")) = 'object'
   AND ("pets" IS NULL OR "pets" = '[]'::jsonb);

-- Conferência: a coluna existe e o backfill cobriu todas as estadias com pet.
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'stays' AND column_name = 'pets';

SELECT
  count(*) FILTER (WHERE "hasPet" IS TRUE)                              AS com_pet,
  count(*) FILTER (WHERE "hasPet" IS TRUE AND jsonb_array_length("pets") > 0) AS migradas
FROM public.stays;
