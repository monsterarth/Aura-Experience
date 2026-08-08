-- ═══════════════════════════════════════════════════════════════════════════
-- CRM FASE B.5 — 2/4: alarmes comerciais (follow-up, cobrança, lembrete)
--
--   crm_alarms — alarmes de leads E de negociações fechadas (cobrança é
--       pós-fechamento, então NÃO há FK para o pipeline). "entityLabel" é
--       snapshot do nome do lead: a fila não depende do recorte de 60 dias do
--       pipeline nem de join.
--
--   Fila no CRM + badge no menu (SEM push nesta fase). O badge conta pelo
--   BROWSER (NotificationContext), por isso RLS permissiva + realtime.
--
-- Idempotente — pode rodar de novo sem efeito colateral.
-- Aplicar no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.crm_alarms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"    TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  "entityType"    TEXT NOT NULL CHECK ("entityType" IN ('quote', 'wedding')),
  -- rate_quotes.id ou weddings.id; sem FK dura (alarme sobrevive ao lead)
  "entityId"      TEXT NOT NULL,
  -- Snapshot do nome ("Maria Silva", "Raquel & Mateus") — ver cabeçalho
  "entityLabel"   TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('follow_up','payment','reminder','other')),
  title           TEXT NOT NULL,
  note            TEXT,
  "dueAt"         DATE NOT NULL,
  "dueTime"       TEXT,            -- HH:mm opcional, só exibição
  done            BOOLEAN NOT NULL DEFAULT false,
  "doneAt"        TIMESTAMPTZ,
  "doneBy"        TEXT,
  "doneByName"    TEXT,
  "createdBy"     TEXT,
  "createdByName" TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A fila e o badge só olham alarmes abertos — índice parcial.
CREATE INDEX IF NOT EXISTS idx_crm_alarms_open
  ON public.crm_alarms("propertyId", "dueAt") WHERE done = false;
CREATE INDEX IF NOT EXISTS idx_crm_alarms_entity
  ON public.crm_alarms("propertyId", "entityType", "entityId", "createdAt" DESC);

-- RLS: padrão permissivo dos módulos novos (service role + filtro na aplicação;
-- o badge conta pelo browser autenticado).
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.crm_alarms ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS crm_alarms_auth_all ON public.crm_alarms;';
  EXECUTE 'CREATE POLICY crm_alarms_auth_all ON public.crm_alarms FOR ALL TO authenticated USING (true) WITH CHECK (true);';
END $$;

-- Realtime para o badge do sidebar (padrão enable-realtime.sql).
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_alarms; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Conferência ─────────────────────────────────────────────────────────────

-- Deve devolver a tabela com RLS habilitada:
SELECT relname, relrowsecurity
  FROM pg_class
 WHERE relname = 'crm_alarms' AND relnamespace = 'public'::regnamespace;

-- Deve listar crm_alarms na publicação realtime:
SELECT tablename FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime' AND tablename = 'crm_alarms';
