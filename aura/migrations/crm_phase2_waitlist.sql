-- ═══════════════════════════════════════════════════════════════════════════
-- CRM FASE B.5 — 4/4: lista de espera para períodos (waitlist_entries)
--
--   Interessados em períodos concorridos (feriados, casamentos com pousada
--   exclusiva) ficam registrados de forma simples: nome, telefone, e-mail e
--   período desejado. Aba "Espera" na página Comercial · Reservas.
--
--   Conversão: "Converter" abre a calculadora pré-preenchida
--   (/admin/tarifario?waitlistId=) e a entrada só vira 'converted' quando o
--   orçamento é DE FATO salvo — quoteId fica de rastro (sem FK dura).
--
-- Idempotente — pode rodar de novo sem efeito colateral.
-- Aplicar no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId"    TEXT NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT,            -- só dígitos (padrão guests.phone/contacts.id)
  email           TEXT,
  "periodStart"   DATE NOT NULL,
  "periodEnd"     DATE NOT NULL,
  guests          INTEGER,
  notes           TEXT,
  source          TEXT,            -- slug de settings.crmChannels
  status          TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting','contacted','converted','archived')),
  "quoteId"       TEXT,            -- rastro da conversão; sem FK dura
  "contactedAt"   TIMESTAMPTZ,
  "convertedAt"   TIMESTAMPTZ,
  "createdBy"     TEXT,
  "createdByName" TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A aba mostra as ativas por período — índice parcial.
CREATE INDEX IF NOT EXISTS idx_waitlist_active
  ON public.waitlist_entries("propertyId", "periodStart")
  WHERE status IN ('waiting','contacted');

-- RLS: NENHUMA policy — nenhum código de browser toca esta tabela (a aba
-- Espera usa só /api/admin/comercial/waitlist, service role, que ignora RLS).
-- É PII de lead (nome, telefone, e-mail, período de viagem): RLS ligada sem
-- policy nega tudo para anon/authenticated, e o REVOKE fecha a outra metade
-- (mesmo racional do property_secrets; achado da revisão da fase B.5).
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS waitlist_entries_auth_all ON public.waitlist_entries;';
  EXECUTE 'REVOKE ALL PRIVILEGES ON public.waitlist_entries FROM anon, authenticated;';
END $$;

-- ── Conferência ─────────────────────────────────────────────────────────────

SELECT relname, relrowsecurity
  FROM pg_class
 WHERE relname = 'waitlist_entries' AND relnamespace = 'public'::regnamespace;

SELECT count(*) AS waitlist_rows FROM public.waitlist_entries;
