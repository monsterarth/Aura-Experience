-- ═══════════════════════════════════════════════════════════════════════════
-- TARIFÁRIO — "O que está incluso" na proposta pública
--
--   rate_settings += "inclusionsText" — o texto que o cliente lê na página da
--   proposta (/cotacao/<id>), logo acima das regras da pousada: café da manhã,
--   estacionamento, o que a diária cobre. Editável em Tarifário → Comercial,
--   ao lado dos templates de WhatsApp (é o mesmo tipo de conteúdo comercial).
--
--   Uma linha por item — a proposta renderiza como lista.
--
-- Idempotente e aditiva: sem a coluna, a seção simplesmente não aparece.
-- Aplicar no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.rate_settings
  ADD COLUMN IF NOT EXISTS "inclusionsText" TEXT;

-- ── Conferência ─────────────────────────────────────────────────────────────

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'rate_settings'
   AND column_name = 'inclusionsText';
