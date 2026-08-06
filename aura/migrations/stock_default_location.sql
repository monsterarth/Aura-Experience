-- =============================================================================
-- ESTOQUE PRINCIPAL — origem padrão das transferências
-- =============================================================================
-- Quem transfere quase sempre tira do estoque principal. O campo passa a ser
-- pré-preenchido com este local (e continua trocável no formulário).
--
-- Fica em stock_settings (por propriedade) em vez de hardcoded no código: cada
-- pousada tem o seu, e o nome "ESTOQUE PRINCIPAL" é convenção da Fazenda do Rosa.
-- Configurável em Estoque → Configurações → Parâmetros.
--
-- Aplicar ANTES do deploy. Idempotente.
-- =============================================================================

ALTER TABLE public.stock_settings
  ADD COLUMN IF NOT EXISTS "defaultLocationId" UUID
    REFERENCES public.stock_locations(id) ON DELETE SET NULL;

-- Backfill da Fazenda do Rosa: "ESTOQUE PRINCIPAL" (warehouse).
-- Id explícito de propósito — há outros locais com "ESTOQUE" no nome
-- (ESTOQUE AUXILIAR CAMAREIRAS), então casar por nome seria chute.
UPDATE public.stock_settings
   SET "defaultLocationId" = '8d98ab9e-a985-4530-a3eb-14b3fc165941',
       "updatedAt"         = now()
 WHERE "propertyId" = 'fazenda-do-rosa'
   AND "defaultLocationId" IS NULL;

-- Verificação:
-- SELECT s."propertyId", l.name AS "estoque principal"
--   FROM public.stock_settings s
--   LEFT JOIN public.stock_locations l ON l.id = s."defaultLocationId";
