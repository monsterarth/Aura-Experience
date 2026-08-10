-- ═══════════════════════════════════════════════════════════════════════════
-- TARIFÁRIO FASE 4 — flutuações por período + arquivo de preços
--
--   rate_fluctuations — atribuição de um PRESET de flutuação (os
--       "Flutuações de ocupação" de rate_settings.fluctuations) a um
--       intervalo de datas. `pct` é SNAPSHOT assinado do preset no momento
--       da atribuição (positivo encarece — convenção do motor): editar o
--       preset depois NÃO reprecifica períodos já atribuídos. Cotação em
--       modo "Automática" aplica o % noite a noite e exibe a média.
--       Recepção pode escrever (com auditoria) — regra do refactor.
--
--   rate_table_versions — histórico de preços da fazenda: snapshot da
--       tabela ANTES de cada alteração real (e antes da exclusão).
--       "tableId" sem FK dura: a versão sobrevive à tabela.
--
--   rate_tables."archivedAt"/"archivedBy" — arquivamento manual: some das
--       listas ativas e dos selects de período, vive na aba Arquivo.
--       Import de tarifários antigos cria a tabela já arquivada.
--
--   rate_quotes."fluctuationAuto" — orçamento salvo em modo Automática
--       (reabre em auto; fluctuationPct guarda a média efetiva p/ exibição).
--
-- Idempotente — pode rodar de novo sem efeito colateral.
-- Aplicar no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rate_fluctuations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"    TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  -- id do preset em rate_settings.fluctuations (JSONB — sem FK possível)
  "presetId"      TEXT,
  -- label do preset no momento da atribuição (exibição no calendário/auditoria)
  name            TEXT,
  -- noites, INCLUSIVE nas duas pontas (mesma semântica de rate_periods)
  "startDate"     DATE NOT NULL,
  "endDate"       DATE NOT NULL,
  -- snapshot assinado do preset: positivo encarece, negativo desconta
  pct             NUMERIC(5,2) NOT NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdBy"     TEXT,
  "createdByName" TEXT
);

CREATE INDEX IF NOT EXISTS idx_rate_fluctuations_period
  ON public.rate_fluctuations("propertyId", "startDate");

CREATE TABLE IF NOT EXISTS public.rate_table_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SEM FK dura de propósito: a versão sobrevive à exclusão da tabela
  "tableId"        UUID NOT NULL,
  "propertyId"     TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  prices           JSONB NOT NULL,
  "replacedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "replacedBy"     TEXT,
  "replacedByName" TEXT
);

CREATE INDEX IF NOT EXISTS idx_rate_table_versions
  ON public.rate_table_versions("propertyId", "tableId", "replacedAt" DESC);

ALTER TABLE public.rate_tables ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ;
ALTER TABLE public.rate_tables ADD COLUMN IF NOT EXISTS "archivedBy" TEXT;

ALTER TABLE public.rate_quotes ADD COLUMN IF NOT EXISTS "fluctuationAuto" BOOLEAN NOT NULL DEFAULT false;

-- RLS: browser só LÊ; toda escrita passa pela rota (service role, com auth +
-- auditoria). REVOKE de cinto e suspensório (padrão crm_phase2_alarms):
-- mesmo que uma policy permissiva reapareça, o GRANT de escrita não existe.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.rate_fluctuations ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS rate_fluctuations_auth_read ON public.rate_fluctuations;';
  EXECUTE 'CREATE POLICY rate_fluctuations_auth_read ON public.rate_fluctuations FOR SELECT TO authenticated USING (true);';
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.rate_fluctuations FROM anon, authenticated;';

  EXECUTE 'ALTER TABLE public.rate_table_versions ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS rate_table_versions_auth_read ON public.rate_table_versions;';
  EXECUTE 'CREATE POLICY rate_table_versions_auth_read ON public.rate_table_versions FOR SELECT TO authenticated USING (true);';
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.rate_table_versions FROM anon, authenticated;';
END $$;

-- ── Conferência ─────────────────────────────────────────────────────────────

-- Deve devolver as duas tabelas com RLS habilitada:
SELECT relname, relrowsecurity
  FROM pg_class
 WHERE relname IN ('rate_fluctuations', 'rate_table_versions')
   AND relnamespace = 'public'::regnamespace;

-- Deve devolver as colunas novas:
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE (table_name = 'rate_tables'  AND column_name IN ('archivedAt', 'archivedBy'))
    OR (table_name = 'rate_quotes' AND column_name = 'fluctuationAuto');
