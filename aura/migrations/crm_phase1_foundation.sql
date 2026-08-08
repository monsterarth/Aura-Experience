-- ============================================================================
-- CRM — Fase 1 (fundação): origem, prazos e histórico de interações
-- (2026-08-08)
--
-- Dá aos DOIS funis (orçamentos de reserva e negociações de casamento) os
-- conceitos comerciais que faltavam:
--
--   rate_quotes  += "source" (canal de origem), "followUpAt"/"expiresAt"
--                   (prazos do lead — simetria com weddings), "sentAt"
--                   (quando a cotação foi enviada) e "lostAt".
--   weddings     += "couplePhone"/"coupleEmail" (o módulo não tinha NENHUM
--                   contato do casal) e "source".
--   crm_interactions — histórico compartilhado: cada contato, troca de etapa,
--                   envio, conversão e perda vira uma linha. Tabela ÚNICA com
--                   "entityType" porque os KPIs de tempo (Fase C) precisam de
--                   query uniforme sobre os dois funis.
--
-- Canais de origem e prazos padrão de orçamento NÃO viram tabela: vivem em
-- properties.settings (crmChannels / crmQuoteLead), como weddingLead.
--
-- Aplicar no SQL Editor do Supabase ANTES do deploy da fase. Idempotente.
-- Rodar crm_phase1_backfill.sql em seguida.
-- ============================================================================

-- ── rate_quotes: origem + prazos do lead ────────────────────────────────────

ALTER TABLE public.rate_quotes
  ADD COLUMN IF NOT EXISTS "source" TEXT;            -- slug do canal (settings.crmChannels)
ALTER TABLE public.rate_quotes
  ADD COLUMN IF NOT EXISTS "followUpAt" DATE;
ALTER TABLE public.rate_quotes
  ADD COLUMN IF NOT EXISTS "expiresAt" DATE;
ALTER TABLE public.rate_quotes
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMPTZ;
ALTER TABLE public.rate_quotes
  ADD COLUMN IF NOT EXISTS "lostAt" TIMESTAMPTZ;

-- Espelho dos índices parciais de weddings_lead_validity.sql: o cron varre só
-- o que está aberto.
CREATE INDEX IF NOT EXISTS idx_rate_quotes_expiry
  ON public.rate_quotes("propertyId", "expiresAt")
  WHERE status IN ('open', 'sent', 'negotiating');

CREATE INDEX IF NOT EXISTS idx_rate_quotes_followup
  ON public.rate_quotes("propertyId", "followUpAt")
  WHERE status IN ('open', 'sent', 'negotiating');

-- ── weddings: contato do casal + origem ─────────────────────────────────────

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS "couplePhone" TEXT;       -- só dígitos = contacts.id
ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS "coupleEmail" TEXT;
ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS "source" TEXT;

-- ── crm_interactions: histórico compartilhado dos dois funis ────────────────

CREATE TABLE IF NOT EXISTS public.crm_interactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"  TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "entityType"  TEXT NOT NULL CHECK ("entityType" IN ('quote', 'wedding')),
  -- rate_quotes.id ou weddings.id; sem FK dura (mesma razão de guestId em
  -- rate_quotes: apagar o lead não pode quebrar o histórico agregado dos KPIs)
  "entityId"    TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN
    ('created','note','stage_change','follow_up','sent','converted','stay_linked','lost','reopened')),
  note          TEXT,
  -- {from,to} em stage_change · {stayId} em stay_linked · {reason} em lost ·
  -- {followUpAt,expiresAt} em follow_up
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "actorId"     TEXT,     -- 'cron' nos automáticos
  "actorName"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_interactions_entity
  ON public.crm_interactions("propertyId", "entityType", "entityId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_crm_interactions_recent
  ON public.crm_interactions("propertyId", "createdAt" DESC);

-- RLS: padrão permissivo dos módulos novos (service role + filtro na aplicação)
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS crm_interactions_auth_all ON public.crm_interactions;';
  EXECUTE 'CREATE POLICY crm_interactions_auth_all ON public.crm_interactions FOR ALL TO authenticated USING (true) WITH CHECK (true);';
END $$;

-- ── Conferência ─────────────────────────────────────────────────────────────

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'rate_quotes' AND column_name IN ('source','followUpAt','expiresAt','sentAt','lostAt'))
     OR (table_name = 'weddings'    AND column_name IN ('couplePhone','coupleEmail','source')))
 ORDER BY table_name, column_name;

SELECT count(*) AS crm_interactions_rows FROM public.crm_interactions;
