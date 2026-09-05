-- migrations/modules_backfill_flags.sql
--
-- Modularização, fatia 1 — backfill EXPLÍCITO das flags de módulo
-- (docs/MODULARIZATION.md §6, regra 6).
--
-- Até aqui `src/lib/modules.ts` tinha um default por chave, e `hasStock` nascia
-- LIGADO para quem nunca opinou. Medido em produção em 02/09/2026: a Estância do
-- Vale — 0 estadias, nunca contratou nada — tinha o grupo Compras & Estoque no
-- menu. A partir desta fatia o default de TODA chave é desligado, e quem já
-- existe recebe o valor gravado, para que nenhuma propriedade dependa do default.
--
-- A regra do estoque é pelo DADO, não pelo nome da propriedade: quem tem
-- `stock_settings` usa o módulo (a Fazenda, que aliás já tem a flag explícita).
-- Quem não tem, não usa. As demais flags eram desligadas por default e ficam
-- desligadas — só passam a estar escritas.
--
-- Merge raso, chave a chave (`||`), como toda escrita em settings. Só toca quem
-- NÃO tem a chave como booleano; valor explícito existente é respeitado.
--
-- Aplicar:  pnpm db:sql migrations/modules_backfill_flags.sql              (DEV)
--           pnpm db:sql migrations/modules_backfill_flags.sql --target prod
-- Pode rodar antes ou depois do deploy: com a flag gravada o código velho e o
-- novo leem a mesma coisa. Idempotente. Reversível removendo as chaves
-- (`settings - 'hasStock'`), mas não há motivo — o valor explícito É o estado.

-- 1) Estoque: pelo dado.
UPDATE public.properties p
   SET settings = COALESCE(p.settings, '{}'::jsonb)
                  || jsonb_build_object(
                       'hasStock',
                       EXISTS (SELECT 1 FROM public.stock_settings s WHERE s."propertyId" = p.id)
                     )
 WHERE jsonb_typeof(COALESCE(p.settings, '{}'::jsonb) -> 'hasStock') IS DISTINCT FROM 'boolean';

-- 2) Os demais: ausente era desligado; agora está escrito.
UPDATE public.properties
   SET settings = COALESCE(settings, '{}'::jsonb) || '{"hasGuarita": false}'::jsonb
 WHERE jsonb_typeof(COALESCE(settings, '{}'::jsonb) -> 'hasGuarita') IS DISTINCT FROM 'boolean';

UPDATE public.properties
   SET settings = COALESCE(settings, '{}'::jsonb) || '{"hasHsystem": false}'::jsonb
 WHERE jsonb_typeof(COALESCE(settings, '{}'::jsonb) -> 'hasHsystem') IS DISTINCT FROM 'boolean';

UPDATE public.properties
   SET settings = COALESCE(settings, '{}'::jsonb) || '{"hasRH": false}'::jsonb
 WHERE jsonb_typeof(COALESCE(settings, '{}'::jsonb) -> 'hasRH') IS DISTINCT FROM 'boolean';

UPDATE public.properties
   SET settings = COALESCE(settings, '{}'::jsonb) || '{"hasTimeclock": false}'::jsonb
 WHERE jsonb_typeof(COALESCE(settings, '{}'::jsonb) -> 'hasTimeclock') IS DISTINCT FROM 'boolean';

-- Verificação (só leitura): toda propriedade com as 5 chaves booleanas.
-- SELECT id,
--        settings->'hasStock'     AS estoque,
--        settings->'hasGuarita'   AS guarita,
--        settings->'hasHsystem'   AS hsystem,
--        settings->'hasRH'        AS rh,
--        settings->'hasTimeclock' AS ponto
--   FROM public.properties ORDER BY id;
