-- ═══════════════════════════════════════════════════════════════════════════
-- SITE DOS NOIVOS — simulador de tarifas para convidados de casamento
--
--   O casamento ganha uma página pública (/casamento) acessada por CÓDIGO DE
--   6 DÍGITOS impresso no convite. Convidados simulam a hospedagem do fim de
--   semana do evento com a TABELA VINCULADA ao casamento ("rateTableId") e
--   deixam uma pré-reserva — que vira rate_quote no funil comercial
--   (rate_quotes."weddingId" já existe desde crm_phase1_foundation.sql).
--
--   Dois códigos por casamento:
--     "guestCode"  — convidados (simulador)
--     "coupleCode" — noivos (painel: ocupação por categoria + personalização)
--   Unicidade GLOBAL entre as duas colunas: a URL /casamento/<code> não tem
--   contexto de propriedade — o lookup é só pelo código. Casamento encerrado
--   NÃO recicla código (convite impresso); o gate de acesso é "siteEnabled"
--   + status = 'confirmed', nunca a existência do código.
--
-- Idempotente — pode rodar de novo sem efeito colateral.
-- Aplicar no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Colunas novas em weddings ────────────────────────────────────────────

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS "guestCode"       TEXT,
  ADD COLUMN IF NOT EXISTS "coupleCode"      TEXT,
  ADD COLUMN IF NOT EXISTS "rateTableId"     UUID,
  ADD COLUMN IF NOT EXISTS "maxExtendNights" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "siteEnabled"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "siteConfig"      JSONB;

-- Formato dos códigos: exatamente 6 dígitos (o gerador usa 100000–999999
-- para nunca nascer com zero à esquerda, mas a CHECK aceita qualquer 6).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weddings_guest_code_format'
  ) THEN
    ALTER TABLE public.weddings
      ADD CONSTRAINT weddings_guest_code_format
      CHECK ("guestCode" IS NULL OR "guestCode" ~ '^[0-9]{6}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weddings_couple_code_format'
  ) THEN
    ALTER TABLE public.weddings
      ADD CONSTRAINT weddings_couple_code_format
      CHECK ("coupleCode" IS NULL OR "coupleCode" ~ '^[0-9]{6}$');
  END IF;
END $$;

-- FK da tabela vinculada: apagar a tabela de preços NÃO pode quebrar o
-- casamento — o site degrada com aviso ("tarifa indisponível") e a ativação
-- volta a exigir vínculo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weddings_rate_table_fk'
  ) THEN
    ALTER TABLE public.weddings
      ADD CONSTRAINT weddings_rate_table_fk
      FOREIGN KEY ("rateTableId") REFERENCES public.rate_tables(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 2. Índices ──────────────────────────────────────────────────────────────

-- Unicidade dos códigos (parcial: NULL fica de fora). A unicidade CRUZADA
-- (um guestCode nunca igual a um coupleCode alheio) é garantida pelo gerador,
-- que consulta as duas colunas antes de aceitar o sorteio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_weddings_guest_code
  ON public.weddings("guestCode") WHERE "guestCode" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_weddings_couple_code
  ON public.weddings("coupleCode") WHERE "coupleCode" IS NOT NULL;

-- Holds do simulador: pré-reservas ABERTAS de um casamento (desconto de
-- disponibilidade + painel dos noivos leem por este recorte).
CREATE INDEX IF NOT EXISTS idx_rate_quotes_wedding_open
  ON public.rate_quotes("weddingId")
  WHERE "weddingId" IS NOT NULL AND status IN ('open','sent','negotiating','won');

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
-- Nada novo: weddings e rate_quotes já são `TO authenticated` com anon
-- revogado. A superfície pública passa por service-role em rota, e a
-- ALLOWLIST de campos do wedding-site-service é a defesa (mesma regra da
-- proposta pública — ver rate-quote-public-service.ts).

-- ── Conferência ─────────────────────────────────────────────────────────────

-- Colunas criadas (esperado: 6 linhas):
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'weddings'
   AND column_name IN ('guestCode','coupleCode','rateTableId','maxExtendNights','siteEnabled','siteConfig')
 ORDER BY column_name;

-- Índices criados (esperado: 3 linhas):
SELECT indexname FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN ('uq_weddings_guest_code','uq_weddings_couple_code','idx_rate_quotes_wedding_open');
