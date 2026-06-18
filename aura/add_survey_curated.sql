-- ============================================================
-- Survey 2.0 (curado) — migração de schema (idempotente)
-- Rode no SQL editor do Supabase. Não quebra dados existentes:
-- templates antigos ficam com version='builder' e seguem funcionando.
-- ============================================================

ALTER TABLE public.survey_templates
  ADD COLUMN IF NOT EXISTS version text DEFAULT 'builder',
  ADD COLUMN IF NOT EXISTS config  jsonb DEFAULT '{}'::jsonb;

-- ------------------------------------------------------------
-- SEED OPCIONAL — converter o template default de UMA propriedade
-- para o fluxo curado. Troque <PROPERTY_ID> pelo id da propriedade.
-- (Ou use o editor curado no admin, que grava isto automaticamente.)
-- ------------------------------------------------------------
-- UPDATE public.survey_templates SET
--   version = 'curated',
--   config = '{
--     "overall": { "enabled": true },
--     "categories": [
--       {"id":"limpeza","label":"Limpeza","label_en":"Cleanliness","label_es":"Limpieza","icon":"sparkle"},
--       {"id":"atendimento","label":"Atendimento","label_en":"Service","label_es":"Atención","icon":"heart"},
--       {"id":"cafe","label":"Café da manhã","label_en":"Breakfast","label_es":"Desayuno","icon":"coffee"},
--       {"id":"conforto","label":"Conforto do chalé","label_en":"Comfort","label_es":"Confort","icon":"home"},
--       {"id":"areas","label":"Áreas & lazer","label_en":"Areas & leisure","label_es":"Áreas y ocio","icon":"droplet"}
--     ],
--     "minCategories": 3,
--     "highlights": { "positive": [
--       {"id":"tranquilidade","label":"Tranquilidade"},
--       {"id":"atendimento","label":"Atendimento caloroso"},
--       {"id":"cafe","label":"Café delicioso"},
--       {"id":"vista","label":"Vista linda"},
--       {"id":"limpeza","label":"Limpeza impecável"},
--       {"id":"pet","label":"Aceitaram meu pet"},
--       {"id":"custo","label":"Boa relação custo"},
--       {"id":"voltaria","label":"Voltaria com certeza"}
--     ], "improve": [] },
--     "recommend": { "enabled": true },
--     "comment": { "enabled": true },
--     "review": { "googlePlaceId": "", "booking": "" },
--     "recovery": {},
--     "thankYou": {}
--   }'::jsonb
-- WHERE "propertyId" = '<PROPERTY_ID>' AND "isDefault" = true;
