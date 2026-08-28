-- Agregações do painel de plataforma (/admin/core/dashboard).
--
-- Por que isto existe: o PostgREST não faz GROUP BY. Sem estas funções o painel
-- só teria dois caminhos, ambos ruins:
--   (a) baixar as linhas cruas e contar no Node — ~18 mil timestamps de mensagens
--       por carga, meio megabyte de egress para produzir um gráfico de 30 pontos;
--   (b) disparar ~200 requisições `head:true` (uma por dia por tabela).
-- O painel existe para VIGIAR o consumo; ele não pode ser um dos consumidores.
-- Cada função abaixo devolve alguns kilobytes de JSON já somados no banco.
--
-- SEGURANÇA: são todas SECURITY DEFINER (precisam ler `extensions.pg_stat_statements`
-- e `storage.objects`, fora do alcance dos papéis normais). Por isso cada uma revoga
-- EXECUTE de public/anon/authenticated e concede só a service_role — o painel chama
-- pelo servidor com a chave de serviço. Ver o histórico em
-- `rls_close_public_policies.sql`: chave anônima com alcance demais já vazou dado aqui.
--
-- Idempotente: só CREATE OR REPLACE + GRANT/REVOKE. Rodar duas vezes dá o mesmo.

-- ---------------------------------------------------------------------------
-- 1. Série diária do trabalho executado pela plataforma
-- ---------------------------------------------------------------------------
-- Um ponto por dia por tipo de evento. O fuso é fixado em America/Sao_Paulo:
-- agrupar em UTC jogaria tudo que aconteceu depois das 21h para o dia seguinte,
-- e é justamente aí que a governança fecha o dia.

CREATE OR REPLACE FUNCTION public.platform_work_series(p_days int DEFAULT 30)
RETURNS TABLE(day date, kind text, n bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  r record;
BEGIN
  -- A terceira coluna é o nome da coluna de data: as tabelas de F&B são o legado
  -- snake_case (`created_at`), o resto do banco é camelCase entre aspas.
  FOR r IN
    SELECT * FROM (VALUES
      ('messages',            'mensagens',    'createdAt'),
      ('housekeeping_tasks',  'governanca',   'createdAt'),
      ('maintenance_tasks',   'manutencao',   'createdAt'),
      ('structure_bookings',  'agendamentos', 'createdAt'),
      ('fb_orders',           'fb',           'created_at'),
      ('folio_items',         'folio',        'createdAt'),
      ('concierge_requests',  'concierge',    'createdAt'),
      ('breakfast_attendance','cafe',         'createdAt'),
      ('stock_movements',     'estoque',      'createdAt')
    ) AS t(tbl, label, ts)
  LOOP
    RETURN QUERY EXECUTE format(
      $q$
        SELECT ((%I AT TIME ZONE 'America/Sao_Paulo')::date), %L::text, count(*)
        FROM public.%I
        WHERE %I >= (now() - ($1 || ' days')::interval)
        GROUP BY 1
      $q$, r.ts, r.label, r.tbl, r.ts
    ) USING p_days;
  END LOOP;

  -- Check-ins não têm tabela própria: são a transição registrada na auditoria.
  RETURN QUERY
    SELECT ((a.timestamp AT TIME ZONE 'America/Sao_Paulo')::date), 'checkins'::text, count(*)
    FROM public.audit_logs a
    WHERE a.timestamp >= (now() - (p_days || ' days')::interval)
      AND a.action IN ('CHECKIN', 'CHECKOUT')
    GROUP BY 1;
END $$;

REVOKE ALL ON FUNCTION public.platform_work_series(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_work_series(int) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Adoção de módulos por propriedade
-- ---------------------------------------------------------------------------
-- "Quando foi a última vez que esta propriedade usou este módulo?" — o KPI que
-- separa módulo vivo de módulo que ninguém abriu desde a demonstração.

CREATE OR REPLACE FUNCTION public.platform_module_adoption()
RETURNS TABLE(property_id text, module text, last_used timestamptz, n30 bigint, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('stays',              'Estadias',     'createdAt',  'propertyId'),
      ('messages',           'Comunicação',  'createdAt',  'propertyId'),
      ('housekeeping_tasks', 'Governança',   'createdAt',  'propertyId'),
      ('maintenance_tasks',  'Manutenção',   'createdAt',  'propertyId'),
      ('concierge_requests', 'Concierge',    'createdAt',  'propertyId'),
      ('fb_orders',          'F&B',          'created_at', 'property_id'),
      ('breakfast_attendance','Café',        'createdAt',  'propertyId'),
      ('structure_bookings', 'Agendamentos', 'createdAt',  'propertyId'),
      ('folio_items',        'Fólio',        'createdAt',  'propertyId'),
      ('stock_movements',    'Estoque',      'createdAt',  'propertyId'),
      ('purchases',          'Compras',      'createdAt',  'propertyId'),
      ('assets',             'Patrimônio',   'createdAt',  'propertyId'),
      ('weddings',           'Casamentos',   'createdAt',  'propertyId'),
      ('events',             'Eventos',      'createdAt',  'propertyId'),
      ('rate_quotes',        'Tarifário',    'createdAt',  'propertyId'),
      ('vehicle_movements',  'Guarita',      'createdAt',  'propertyId'),
      ('survey_responses',   'Pesquisas',    'createdAt',  'propertyId'),
      ('staff_scraps',       'Mural',        'createdAt',  'propertyId')
    ) AS t(tbl, label, ts, pid)
  LOOP
    RETURN QUERY EXECUTE format(
      $q$
        SELECT %I::text, %L::text, max(%I),
               count(*) FILTER (WHERE %I >= now() - interval '30 days'),
               count(*)
        FROM public.%I
        WHERE %I IS NOT NULL
        GROUP BY 1
      $q$, r.pid, r.label, r.ts, r.ts, r.tbl, r.pid
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.platform_module_adoption() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_module_adoption() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Saúde por propriedade — qualidade de dado + equipe ativa
-- ---------------------------------------------------------------------------
-- As checagens de qualidade não são estéticas: cada uma já causou incidente.
--   · ficha provisória GUEST-*  → ver `guests_id_e_ficha_provisoria`
--   · telefone sem DDI 55       → derrubou envio de WhatsApp com 400 em ago/2026
--   · estadia encerrada com fólio aberto → dinheiro que ninguém fechou

CREATE OR REPLACE FUNCTION public.platform_property_health()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id',   p.id,
      'name', p.name,
      'slug', p.slug,
      'createdAt', p."createdAt",
      'staffTotal',  (SELECT count(*) FROM staff s WHERE s."propertyId" = p.id AND s.active),
      -- Só conta quem É funcionário ativo desta propriedade: a auditoria também
      -- guarda ações de hóspede, do cron e de gente já desligada, e sem o JOIN o
      -- painel exibia coisas como "28 de 26 ativos".
      'staffActive7d', (SELECT count(DISTINCT s.id) FROM staff s
                        WHERE s."propertyId" = p.id AND s.active
                          AND EXISTS (SELECT 1 FROM audit_logs a
                                      WHERE a."userId" = s.id AND a."propertyId" = p.id
                                        AND a.timestamp >= now() - interval '7 days')),
      'actions7d',   (SELECT count(*) FROM audit_logs a
                      WHERE a."propertyId" = p.id AND a.timestamp >= now() - interval '7 days'),
      'staysActive', (SELECT count(*) FROM stays st WHERE st."propertyId" = p.id AND st.status = 'active'),
      'staysTotal',  (SELECT count(*) FROM stays st WHERE st."propertyId" = p.id),
      'guests',      (SELECT count(*) FROM guests g WHERE g."propertyId" = p.id),
      'quality', jsonb_build_object(
        'guestsProvisional', (SELECT count(*) FROM guests g
                              WHERE g."propertyId" = p.id AND g.id LIKE 'GUEST-%'),
        'phonesNoDdi',       (SELECT count(*) FROM guests g
                              WHERE g."propertyId" = p.id AND g.phone IS NOT NULL AND g.phone <> ''
                                AND left(regexp_replace(g.phone, '\D', '', 'g'), 2) <> '55'),
        'guestsNoEmail',     (SELECT count(*) FROM guests g
                              WHERE g."propertyId" = p.id AND coalesce(g.email, '') = ''),
        'staysOpenFolio',    (SELECT count(*) FROM stays st
                              WHERE st."propertyId" = p.id AND st.status = 'completed'
                                AND st."hasOpenFolio" IS TRUE),
        'staysNoBillClosed', (SELECT count(*) FROM stays st
                              WHERE st."propertyId" = p.id AND st.status = 'completed'
                                AND st."billClosedAt" IS NULL)
      )
    ) AS x
    FROM properties p
  ) q;
$$;

REVOKE ALL ON FUNCTION public.platform_property_health() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_property_health() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Plantão — o que está quebrado agora
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.platform_pulse()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT jsonb_build_object(
    'queue', (
      SELECT jsonb_object_agg(status, n) FROM (
        SELECT status, count(*) n FROM messages
        WHERE status IN ('processing', 'pending', 'queued') OR "createdAt" >= now() - interval '24 hours'
        GROUP BY status
      ) s
    ),
    'stuckOldest', (SELECT min("createdAt") FROM messages WHERE status = 'processing'),
    'failed24h',   (SELECT count(*) FROM messages WHERE status = 'failed' AND "createdAt" >= now() - interval '24 hours'),
    'failedTotal', (SELECT count(*) FROM messages WHERE status = 'failed'),
    'loginFails24h', (SELECT count(*) FROM login_attempts
                      WHERE success IS FALSE AND attempted_at >= now() - interval '24 hours'),
    'openBugs',    (SELECT count(*) FROM system_bugs WHERE coalesce(status, 'open') <> 'closed'),
    'cron', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('action', action, 'lastRun', last_run, 'runs7d', runs) ORDER BY last_run DESC), '[]'::jsonb)
      FROM (
        SELECT action, max(timestamp) last_run, count(*) FILTER (WHERE timestamp >= now() - interval '7 days') runs
        FROM audit_logs
        WHERE "userName" ILIKE '%cron%' OR "userId" = 'SYSTEM'
        GROUP BY action
      ) c
    )
  );
$$;

REVOKE ALL ON FUNCTION public.platform_pulse() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_pulse() TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Carga do banco — quem consome
-- ---------------------------------------------------------------------------
-- Substitui a métrica de bytes de egress (que só existe no billing) pela pergunta
-- respondível: QUEM está consumindo. `pg_stat_statements` é cumulativo desde o
-- último reset — por isso devolvemos também o instante do reset.

CREATE OR REPLACE FUNCTION public.platform_db_load()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
STABLE
AS $$
  SELECT jsonb_build_object(
    'dbSizeBytes', pg_database_size(current_database()),
    'statsSince',  (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()),
    'cacheHitPct', (SELECT round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2)
                    FROM pg_stat_database),
    'topQueries', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'label', label, 'calls', calls, 'totalMs', total_ms, 'meanMs', mean_ms
             ) ORDER BY total_ms DESC), '[]'::jsonb)
      FROM (
        SELECT
          CASE
            WHEN query ILIKE '%pg_publication_tables%' OR query ILIKE '%wal->>%' THEN 'Realtime (polling de WAL)'
            WHEN query ILIKE '%pg_timezone_names%'                               THEN 'pg_timezone_names'
            WHEN query ILIKE '%"public"."messages"%'                             THEN 'Fila de mensagens'
            WHEN query ILIKE '%"public"."audit_logs"%'                           THEN 'Auditoria'
            WHEN query ILIKE '%"public"."stays"%'                                THEN 'Estadias'
            WHEN query ILIKE '%"public"."housekeeping_tasks"%'                   THEN 'Governança'
            WHEN query ILIKE '%pgrst_source%'                                    THEN 'Outras rotas PostgREST'
            ELSE 'Manutenção interna do Postgres'
          END AS label,
          sum(calls)                          AS calls,
          round(sum(total_exec_time))::bigint AS total_ms,
          round((sum(total_exec_time) / nullif(sum(calls), 0))::numeric, 1) AS mean_ms
        FROM pg_stat_statements
        GROUP BY 1
      ) q
    ),
    'topTables', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'table', relname, 'rows', n_live_tup, 'bytes', total_bytes
             ) ORDER BY total_bytes DESC), '[]'::jsonb)
      FROM (
        SELECT relname, n_live_tup,
               pg_total_relation_size(relid) AS total_bytes
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 10
      ) t
    )
  );
$$;

REVOKE ALL ON FUNCTION public.platform_db_load() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_db_load() TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Acervo do Storage
-- ---------------------------------------------------------------------------
-- Metade do egress que estourou a cota gratuita em ago/2026 saiu daqui: 178
-- objetos somando 477 MB, média de 2,7 MB por imagem. Ler `storage.objects` pelo
-- banco custa alguns kilobytes; listar pela Storage API traria os metadados todos.

CREATE OR REPLACE FUNCTION public.platform_storage()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
STABLE
AS $$
  SELECT jsonb_build_object(
    'buckets', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'bucket', bucket_id, 'objects', n, 'bytes', bytes, 'avgBytes', round(bytes::numeric / nullif(n, 0))
             ) ORDER BY bytes DESC), '[]'::jsonb)
      FROM (
        SELECT bucket_id, count(*) n, coalesce(sum((metadata->>'size')::bigint), 0) bytes
        FROM storage.objects GROUP BY 1
      ) b
    ),
    'heaviest', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'name', name, 'bucket', bucket_id, 'bytes', bytes, 'createdAt', created_at
             ) ORDER BY bytes DESC), '[]'::jsonb)
      FROM (
        SELECT name, bucket_id, (metadata->>'size')::bigint bytes, created_at
        FROM storage.objects
        WHERE metadata->>'size' IS NOT NULL
        ORDER BY (metadata->>'size')::bigint DESC
        LIMIT 12
      ) h
    ),
    -- Distribuição por faixa de tamanho: mostra de uma vez quantos arquivos
    -- passam do limite de compressão que o ImageUpload aplica desde ago/2026.
    'sizeBands', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('band', band, 'n', n, 'bytes', bytes) ORDER BY ord), '[]'::jsonb)
      FROM (
        SELECT
          CASE
            WHEN sz < 262144  THEN '< 256 KB' WHEN sz < 1048576 THEN '256 KB – 1 MB'
            WHEN sz < 3145728 THEN '1 – 3 MB' WHEN sz < 6291456 THEN '3 – 6 MB'
            ELSE '> 6 MB'
          END AS band,
          CASE
            WHEN sz < 262144  THEN 1 WHEN sz < 1048576 THEN 2
            WHEN sz < 3145728 THEN 3 WHEN sz < 6291456 THEN 4 ELSE 5
          END AS ord,
          count(*) n, sum(sz) bytes
        FROM (SELECT (metadata->>'size')::bigint sz FROM storage.objects WHERE metadata->>'size' IS NOT NULL) o
        GROUP BY 1, 2
      ) s
    )
  );
$$;

REVOKE ALL ON FUNCTION public.platform_storage() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_storage() TO service_role;
