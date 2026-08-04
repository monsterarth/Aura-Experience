-- ============================================================================
-- CATEGORIAS DE CABANA — entidade canônica (2026-08-04)
--
-- PROBLEMA
-- `cabins.category` era texto livre, redigitado a cada cabana. Resultado na
-- Fazenda do Rosa: 11 grafias para ~8 tipos reais, incluindo o mesmo Jardim
-- escrito de dois jeitos ("Jardim - 2 Dormitórios" nas cabanas 13/14 e
-- "Jardim 2 Dormitórios" nas 07/08). Como o Tarifário cruzava preço x
-- disponibilidade POR STRING, só "Eco Suíte" batia — as outras categorias
-- ficavam sem disponibilidade na tela de orçamento.
--
-- SOLUÇÃO
-- `cabin_categories` por propriedade. As cabanas apontam por "categoryId" e as
-- tabelas de preço passam a indexar `prices` pelo MESMO id. Preço e
-- disponibilidade deixam de se encontrar por texto: divergir vira impossível.
--
-- Cada categoria guarda:
--   name      — operacional, compõe cabins.name ("01 - Praia - 2 Dormitórios")
--   shortName — comercial, usado no orçamento/WhatsApp ("Praia 2")
--   siteUrl   — link da categoria no site (sai de rate_settings.categoryLinks)
--
-- `cabins.category` CONTINUA existindo como espelho desnormalizado do nome, para
-- as telas que já a exibem (governança, mapa) não quebrarem. Quem manda é o id.
--
-- SEGURANÇA: nenhum DROP. Idempotente — pode rodar mais de uma vez.
-- Aplicar no SQL Editor do Supabase.
-- ============================================================================

-- ── 1. Tabela ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cabin_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  "shortName"  TEXT,
  "siteUrl"    TEXT,
  "order"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cabin_categories_property
  ON public.cabin_categories("propertyId", "order");

-- Unicidade sem caixa: é o que impede "Jardim 2 Dormitórios" de renascer ao
-- lado de "Jardim - 2 dormitórios".
CREATE UNIQUE INDEX IF NOT EXISTS idx_cabin_categories_unique_name
  ON public.cabin_categories("propertyId", lower(name));

ALTER TABLE public.cabins
  ADD COLUMN IF NOT EXISTS "categoryId" UUID REFERENCES public.cabin_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cabins_category
  ON public.cabins("categoryId");

-- ── 2. Backfill genérico: uma categoria por grafia existente ─────────────────
-- Vale para todas as propriedades. A consolidação das grafias divergentes é o
-- passo 3 (específico da Fazenda do Rosa).

-- DISTINCT ON por lower(): duas grafias que só diferem em caixa ("Eco Suite" e
-- "ECO SUITE") colidiriam no índice único se ambas fossem inseridas de uma vez.
INSERT INTO public.cabin_categories ("propertyId", name, "order")
SELECT DISTINCT ON (c."propertyId", lower(btrim(c.category)))
       c."propertyId", btrim(c.category), 0
FROM public.cabins c
WHERE c.category IS NOT NULL
  AND btrim(c.category) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.cabin_categories cc
    WHERE cc."propertyId" = c."propertyId"
      AND lower(cc.name) = lower(btrim(c.category))
  )
ORDER BY c."propertyId", lower(btrim(c.category)), btrim(c.category);

UPDATE public.cabins c
SET "categoryId" = cc.id
FROM public.cabin_categories cc
WHERE c."categoryId" IS NULL
  AND cc."propertyId" = c."propertyId"
  AND lower(cc.name) = lower(btrim(c.category));

-- ── 3. Consolidação + nomes comerciais (Fazenda do Rosa) ────────────────────
-- Os nomes comerciais são os que o SIT já usava, e viram a chave de casamento
-- na importação do backup. O nome operacional mantém o padrão com hífen que a
-- propriedade já usa na maioria das categorias.

DO $$
DECLARE
  prop TEXT := 'fazenda-do-rosa';
  jardim_canon UUID;
  jardim_dup   UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.properties WHERE id = prop) THEN
    RAISE NOTICE 'Propriedade % ausente — passo 3 ignorado.', prop;
    RETURN;
  END IF;

  -- 3a. Funde "Jardim 2 Dormitórios" (07/08) em "Jardim - 2 Dormitórios" (13/14).
  SELECT id INTO jardim_canon FROM public.cabin_categories
   WHERE "propertyId" = prop AND lower(name) = lower('Jardim - 2 Dormitórios');
  SELECT id INTO jardim_dup FROM public.cabin_categories
   WHERE "propertyId" = prop AND lower(name) = lower('Jardim 2 Dormitórios');

  IF jardim_canon IS NOT NULL AND jardim_dup IS NOT NULL THEN
    UPDATE public.cabins
       SET "categoryId" = jardim_canon,
           category     = 'Jardim - 2 Dormitórios',
           name         = number || ' - Jardim - 2 Dormitórios',
           "updatedAt"  = now()
     WHERE "propertyId" = prop AND "categoryId" = jardim_dup;

    DELETE FROM public.cabin_categories WHERE id = jardim_dup;
    RAISE NOTICE 'Jardim consolidado: cabanas 07/08 renomeadas.';
  END IF;

  -- 3b. Nome comercial + ordem de exibição (o "de fora para dentro" do site).
  UPDATE public.cabin_categories SET "shortName" = v.short, "order" = v.ord, "updatedAt" = now()
  FROM (VALUES
    ('Praia - 1 Dormitório',       'Praia 1',      1),
    ('Praia - 2 Dormitórios',      'Praia 2',      2),
    ('Eco Suíte',                  'Eco Suíte',    3),
    ('Bem estar - 1 Dormitório',   'Bem Estar 1',  4),
    ('Bem estar - 2 Suítes',       'Bem Estar 2',  5),
    ('Jardim - 2 Dormitórios',     'Jardim 2',     6),
    ('Mar - 2 Suítes',             'Mar 2',        7),
    ('Hibisco',                    'Hibiscos',     8)
  ) AS v(nome, short, ord)
  WHERE public.cabin_categories."propertyId" = prop
    AND lower(public.cabin_categories.name) = lower(v.nome);
END $$;

-- ── 4. Tabelas de preço: chaves de NOME → categoryId ────────────────────────
-- `prices` era { "Praia 2": {...} }; passa a ser { "<uuid>": {...} }. O casamento
-- usa shortName (que é exatamente como o SIT nomeava) ou o nome operacional.
-- Chave sem categoria correspondente é DESCARTADA e avisada no NOTICE — melhor
-- perder um preço órfão do que manter uma categoria fantasma.

DO $$
DECLARE
  t         RECORD;
  novo      JSONB;
  chave     TEXT;
  valor     JSONB;
  cat_id    UUID;
  perdidas  TEXT := '';
BEGIN
  IF to_regclass('public.rate_tables') IS NULL THEN
    RAISE NOTICE 'rate_tables ausente — passo 4 ignorado.';
    RETURN;
  END IF;

  FOR t IN SELECT id, "propertyId", name, prices FROM public.rate_tables LOOP
    novo := '{}'::jsonb;

    FOR chave, valor IN SELECT * FROM jsonb_each(COALESCE(t.prices, '{}'::jsonb)) LOOP
      -- Já é um uuid de categoria válido? mantém como está (re-execução).
      IF chave ~ '^[0-9a-fA-F-]{36}$'
         AND EXISTS (SELECT 1 FROM public.cabin_categories WHERE id = chave::uuid) THEN
        novo := novo || jsonb_build_object(chave, valor);
        CONTINUE;
      END IF;

      SELECT cc.id INTO cat_id
        FROM public.cabin_categories cc
       WHERE cc."propertyId" = t."propertyId"
         AND (lower(cc."shortName") = lower(btrim(chave)) OR lower(cc.name) = lower(btrim(chave)))
       LIMIT 1;

      IF cat_id IS NOT NULL THEN
        novo := novo || jsonb_build_object(cat_id::text, valor);
      ELSE
        perdidas := perdidas || format(' [%s: %s]', t.name, chave);
      END IF;
    END LOOP;

    UPDATE public.rate_tables SET prices = novo, "updatedAt" = now() WHERE id = t.id;
  END LOOP;

  IF perdidas <> '' THEN
    RAISE NOTICE 'Preços sem categoria correspondente (descartados):%', perdidas;
  ELSE
    RAISE NOTICE 'Todas as chaves de preço foram mapeadas para categorias.';
  END IF;
END $$;

-- ── 5. Links do site: rate_settings.categoryLinks → cabin_categories.siteUrl ─

DO $$
DECLARE
  s      RECORD;
  chave  TEXT;
  valor  JSONB;
BEGIN
  IF to_regclass('public.rate_settings') IS NULL THEN RETURN; END IF;

  FOR s IN SELECT "propertyId", "categoryLinks" FROM public.rate_settings LOOP
    FOR chave, valor IN SELECT * FROM jsonb_each(COALESCE(s."categoryLinks", '{}'::jsonb)) LOOP
      UPDATE public.cabin_categories cc
         SET "siteUrl" = trim(both '"' from valor::text), "updatedAt" = now()
       WHERE cc."propertyId" = s."propertyId"
         AND (lower(cc."shortName") = lower(btrim(chave)) OR lower(cc.name) = lower(btrim(chave)))
         AND (cc."siteUrl" IS NULL OR cc."siteUrl" = '');
    END LOOP;
  END LOOP;
END $$;

-- ── 6. RLS (mesmo padrão dos módulos novos) ─────────────────────────────────

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.cabin_categories ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS cabin_categories_auth_all ON public.cabin_categories;';
  EXECUTE 'CREATE POLICY cabin_categories_auth_all ON public.cabin_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);';
END $$;

-- ── 7. Conferência ──────────────────────────────────────────────────────────
-- Deve listar cada categoria com nº de cabanas e em quantas tabelas tem preço.
-- "cabanas > 0 e tabelas > 0" = cruzamento preço x disponibilidade fechado.

SELECT
  p.name  AS propriedade,
  cc.name AS categoria,
  cc."shortName" AS comercial,
  (SELECT count(*) FROM public.cabins c WHERE c."categoryId" = cc.id) AS cabanas,
  -- jsonb_exists() em vez do operador ?, que alguns clientes leem como parâmetro
  (SELECT count(*) FROM public.rate_tables rt
    WHERE rt."propertyId" = cc."propertyId" AND jsonb_exists(rt.prices, cc.id::text)) AS tabelas_com_preco
FROM public.cabin_categories cc
JOIN public.properties p ON p.id = cc."propertyId"
ORDER BY p.name, cc."order", cc.name;
