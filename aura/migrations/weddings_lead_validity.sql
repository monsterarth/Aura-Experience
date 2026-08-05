-- ============================================================================
-- CASAMENTOS — validade do lead: follow-up e expiração (2026-08-04)
--
-- A regra anterior só dava a negociação por perdida quando a DATA DO EVENTO
-- passava. Para um casamento marcado para 2028 isso significa manter o lead
-- aberto por dois anos — a lista ativa vira depósito e a taxa de conversão
-- perde o sentido.
--
-- Agora cada negociação carrega dois prazos próprios:
--   "followUpAt" — quando falar com o casal de novo (só sinaliza, não arquiva)
--   "expiresAt"  — quando a negociação é dada como perdida automaticamente
--
-- Os dois nascem de um padrão por propriedade (properties.settings.weddingLead,
-- editável na própria tela de Casamentos) e podem ser alterados caso a caso —
-- um lead grande merece prazo maior que um pedido de orçamento avulso.
--
-- Aplicar no SQL Editor do Supabase. Idempotente, sem DROP.
-- ============================================================================

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS "followUpAt" DATE;

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS "expiresAt" DATE;

-- O cron varre negociações vencidas; o índice parcial evita varrer o histórico
-- inteiro (55 casamentos hoje, mas cresce e a maioria não é negociação).
CREATE INDEX IF NOT EXISTS idx_weddings_lead_expiry
  ON public.weddings("expiresAt")
  WHERE status = 'tentative';

CREATE INDEX IF NOT EXISTS idx_weddings_followup
  ON public.weddings("followUpAt")
  WHERE status = 'tentative';

-- ── Conferência ─────────────────────────────────────────────────────────────

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'weddings'
   AND column_name IN ('followUpAt', 'expiresAt')
 ORDER BY column_name;
