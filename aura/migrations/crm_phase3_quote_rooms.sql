-- ═══════════════════════════════════════════════════════════════════════════
-- CRM FASE 3 — 1/1: orçamento com VÁRIAS ACOMODAÇÕES + proposta pública
--
--   rate_quotes += "rooms" JSONB — as acomodações PEDIDAS na negociação.
--       O hóspede pode querer 2 cabanas de casal, ou 1 casal + 1 família:
--       é UM lead, UM card no funil, com valor somado.
--       Cada item: { id, label, adults, children, babies, pets,
--                    options: RateQuoteCategory[], selectedCategory }.
--       `options` são as cabanas OFERECIDAS para aquela acomodação (o cliente
--       escolhe UMA) — calculadas SEMPRE no servidor, nunca vêm do cliente.
--
--       As colunas antigas (adults/children/babies/pets, snapshot,
--       selectedCategory, finalValue) continuam existindo e passam a ESPELHAR
--       a acomodação 1 — é o que mantém o funil do tarifário, o vínculo com a
--       estadia e a ficha do hóspede funcionando sem alteração. Orçamentos
--       antigos ficam com "rooms" NULL e seguem pelo caminho legado.
--
--   rate_quotes += "acceptedAt" — quando o cliente aceitou a proposta na
--       página pública /cotacao/[id].
--
--   crm_interactions.kind += 'client_accepted' (aceite do cliente na timeline).
--       Mesma sonda por pg_constraint da fase B.5: o CHECK original foi criado
--       inline (nome auto-gerado) e, se o DROP falhar calado, o INSERT do kind
--       novo falha SILENCIOSAMENTE — logInteraction nunca lança de propósito.
--
-- Idempotente — pode rodar de novo sem efeito colateral.
-- Aplicar no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Colunas novas ────────────────────────────────────────────────────────

ALTER TABLE public.rate_quotes
  ADD COLUMN IF NOT EXISTS "rooms" JSONB;
ALTER TABLE public.rate_quotes
  ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMPTZ;

-- A proposta aceita é o que a recepção precisa ver primeiro.
CREATE INDEX IF NOT EXISTS idx_rate_quotes_accepted
  ON public.rate_quotes("propertyId", "acceptedAt" DESC)
  WHERE "acceptedAt" IS NOT NULL;

-- ── 2. crm_interactions.kind: + client_accepted ─────────────────────────────

DO $$
DECLARE
  chk RECORD;
BEGIN
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
         'value_change','guest_linked','alarm_done',
         'client_accepted'))
  $chk$;
END $$;

-- ── Conferência ─────────────────────────────────────────────────────────────

-- Deve listar "rooms" (jsonb) e "acceptedAt" (timestamp with time zone):
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'rate_quotes'
   AND column_name IN ('rooms', 'acceptedAt')
 ORDER BY column_name;

-- Deve mostrar UM check contendo client_accepted:
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.crm_interactions'::regclass
   AND contype = 'c'
   AND pg_get_constraintdef(oid) LIKE '%kind%';

-- Quantos orçamentos ainda estão no formato antigo (rooms NULL) — eles
-- continuam válidos; ganham "rooms" quando forem recalculados/reabertos:
SELECT count(*) FILTER (WHERE "rooms" IS NULL) AS sem_rooms,
       count(*) FILTER (WHERE "rooms" IS NOT NULL) AS com_rooms
  FROM public.rate_quotes;
