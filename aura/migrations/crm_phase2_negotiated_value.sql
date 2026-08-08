-- ═══════════════════════════════════════════════════════════════════════════
-- CRM FASE B.5 — 1/4: valor negociado + kinds novos do histórico
--
--   rate_quotes += "negotiatedValue" — o valor fechado na conversa (desconto,
--       condição especial). Quando presente, VENCE a tabela em
--       resolveQuoteValue: funil, KPIs e vínculo com estadia herdam.
--       Editável pela recepção SEM aval de gerente, mas com rastro duplo
--       (crm_interactions kind='value_change' + audit_logs).
--
--   crm_interactions.kind — o CHECK é recriado UMA vez já com os 3 kinds da
--       fase B.5 inteira: 'value_change' (commit 2), 'guest_linked' (commit 3)
--       e 'alarm_done' (commit 4). Recriar aqui evita três migrations mexendo
--       na mesma constraint.
--
-- POR QUE A SONDA: o CHECK original foi criado inline (nome auto-gerado pelo
-- Postgres). Se o nome divergir e o DROP falhar calado, o CHECK velho
-- sobrevive e o INSERT dos kinds novos falha SILENCIOSAMENTE — logInteraction
-- nunca lança de propósito. Por isso o nome é descoberto via pg_constraint.
--
-- Idempotente — pode rodar de novo sem efeito colateral.
-- Aplicar no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. rate_quotes.negotiatedValue ──────────────────────────────────────────

ALTER TABLE public.rate_quotes
  ADD COLUMN IF NOT EXISTS "negotiatedValue" NUMERIC;

-- ── 2. crm_interactions.kind: recriar o CHECK com os kinds da fase B.5 ──────

DO $$
DECLARE
  chk RECORD;
BEGIN
  -- Derruba todo CHECK de crm_interactions que mencione a coluna kind
  -- (nome auto-gerado varia; o de "entityType" não menciona 'kind').
  FOR chk IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.crm_interactions'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.crm_interactions DROP CONSTRAINT %I', chk.conname);
  END LOOP;

  EXECUTE $chk$
    ALTER TABLE public.crm_interactions
      ADD CONSTRAINT crm_interactions_kind_check CHECK (kind IN
        ('created','note','stage_change','follow_up','sent','converted',
         'stay_linked','lost','reopened',
         'value_change','guest_linked','alarm_done'))
  $chk$;
END $$;

-- ── Conferência ─────────────────────────────────────────────────────────────

-- Deve listar "negotiatedValue" (numeric):
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'rate_quotes'
   AND column_name = 'negotiatedValue';

-- Deve mostrar UM check contendo value_change/guest_linked/alarm_done:
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.crm_interactions'::regclass
   AND contype = 'c'
   AND pg_get_constraintdef(oid) LIKE '%kind%';
