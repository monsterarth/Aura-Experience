-- ============================================================================
-- CRM — Fase 1 (backfill): normaliza os orçamentos existentes (2026-08-08)
--
-- Rodar DEPOIS de crm_phase1_foundation.sql. Cada passo tem uma SONDA
-- (SELECT) antes do UPDATE — rode a sonda, confira o número, depois o UPDATE.
-- Idempotente: re-executar não altera linhas já corrigidas.
--
-- 1. snapshot[] sem categoryId → resolve pelo nome (snapshots gravados entre o
--    commit do funil e o da categoria-entidade têm chave só por nome).
-- 2. selectedCategory nome → categoryId (a UI antiga gravava o nome).
-- 3. expiresAt dos orçamentos abertos (30 dias, teto na data do check-in —
--    mesma regra dos casamentos; o padrão por propriedade passa a valer para
--    os novos via settings.crmQuoteLead).
-- 4. sentAt retroativo ≈ updatedAt para sent/negotiating/won — APROXIMAÇÃO
--    honesta: é o melhor sinal disponível; KPIs de tempo pré-backfill devem
--    ser lidos com essa ressalva.
-- 5. rate_settings.categoryLinks → cabin_categories.siteUrl (repete o passo 5
--    de cabin_categories.sql por segurança; não dropa a coluna legada).
-- ============================================================================

-- ── 1. snapshot sem categoryId ──────────────────────────────────────────────

-- SONDA: quantos orçamentos têm itens de snapshot sem categoryId?
SELECT count(*) AS quotes_com_snapshot_sem_categoryId
  FROM public.rate_quotes q
 WHERE jsonb_typeof(q.snapshot) = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.snapshot) e
               WHERE COALESCE(e->>'categoryId','') = '');

UPDATE public.rate_quotes q
SET snapshot = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN COALESCE(elem->>'categoryId', '') <> '' THEN elem
      ELSE elem || jsonb_build_object('categoryId', COALESCE((
        SELECT cc.id::text
          FROM public.cabin_categories cc
         WHERE cc."propertyId" = q."propertyId"
           AND (lower(COALESCE(cc."shortName", '')) = lower(elem->>'category')
             OR lower(cc.name) = lower(elem->>'category'))
         LIMIT 1), ''))
    END ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(q.snapshot) WITH ORDINALITY AS t(elem, ord)
)
WHERE jsonb_typeof(q.snapshot) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.snapshot) e
              WHERE COALESCE(e->>'categoryId','') = '');

-- CONFERÊNCIA: sobras esperadas = 0 (ou itens de categorias excluídas, que
-- ficam com categoryId = '' e continuam funcionando pelo nome).
SELECT count(*) AS itens_ainda_sem_categoryId
  FROM public.rate_quotes q, jsonb_array_elements(q.snapshot) e
 WHERE COALESCE(e->>'categoryId','') = '';

-- ── 2. selectedCategory nome → categoryId ───────────────────────────────────

-- SONDA
SELECT count(*) AS selectedCategory_por_nome
  FROM public.rate_quotes q
 WHERE q."selectedCategory" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q.snapshot) e
                   WHERE e->>'categoryId' = q."selectedCategory")
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.snapshot) e
               WHERE e->>'category' = q."selectedCategory"
                 AND COALESCE(e->>'categoryId','') <> '');

UPDATE public.rate_quotes q
SET "selectedCategory" = (
  SELECT e->>'categoryId' FROM jsonb_array_elements(q.snapshot) e
   WHERE e->>'category' = q."selectedCategory"
     AND COALESCE(e->>'categoryId','') <> ''
   LIMIT 1)
WHERE q."selectedCategory" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q.snapshot) e
                  WHERE e->>'categoryId' = q."selectedCategory")
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.snapshot) e
              WHERE e->>'category' = q."selectedCategory"
                AND COALESCE(e->>'categoryId','') <> '');

-- ── 3. expiresAt dos orçamentos abertos ─────────────────────────────────────

-- SONDA: quantos ganham prazo agora, e quantos o PRIMEIRO cron arquivaria
-- (checkIn já passou → viram 'lost' na primeira execução — comportamento
-- desejado, mas confira o número antes).
SELECT count(*) FILTER (WHERE "checkIn" >= CURRENT_DATE) AS ganham_prazo_futuro,
       count(*) FILTER (WHERE "checkIn" <  CURRENT_DATE) AS serao_arquivados_no_1o_cron
  FROM public.rate_quotes
 WHERE status IN ('open','sent','negotiating') AND "expiresAt" IS NULL;

UPDATE public.rate_quotes
SET "expiresAt" = LEAST("checkIn", CURRENT_DATE + 30)
WHERE status IN ('open','sent','negotiating') AND "expiresAt" IS NULL;

-- ── 4. sentAt retroativo ────────────────────────────────────────────────────

UPDATE public.rate_quotes
SET "sentAt" = "updatedAt"
WHERE status IN ('sent','negotiating','won') AND "sentAt" IS NULL;

-- ── 5. categoryLinks legado → cabin_categories.siteUrl ──────────────────────

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
         AND (lower(COALESCE(cc."shortName", '')) = lower(btrim(chave))
           OR lower(cc.name) = lower(btrim(chave)))
         AND (cc."siteUrl" IS NULL OR cc."siteUrl" = '');
    END LOOP;
  END LOOP;
END $$;

-- ── Conferência final ───────────────────────────────────────────────────────

SELECT status, count(*),
       count(*) FILTER (WHERE "expiresAt" IS NOT NULL) AS com_prazo,
       count(*) FILTER (WHERE "sentAt"    IS NOT NULL) AS com_sentAt
  FROM public.rate_quotes
 GROUP BY status ORDER BY status;
