-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSTA PÚBLICA — CADASTRO DO TITULAR ("intake") + LEAD DE INSTAGRAM
--
--   rate_quotes += "intake" / "intakeAt" — os dados que o CLIENTE preenche na
--   página da proposta (/cotacao/<id>) logo depois de aceitar: titular (nome,
--   documento, nascimento, contato), endereço completo, acompanhantes, placa
--   do veículo, pet, forma de pagamento escolhida, observações e a prova do
--   consentimento (LGPD + regras). É o que a recepção pedia no WhatsApp.
--
--   O JSON fica NO ORÇAMENTO de propósito: a página pública é anônima e não
--   escreve em `guests`. A ficha do hóspede e a estadia são pré-preenchidas
--   depois, na conversão, por quem tem sessão. `intakeAt` também é a TRAVA —
--   preenchido, o link não aceita um segundo envio (correção é da recepção).
--
--   rate_quotes += "clientInstagram" — lead que chega pelo Instagram não tem
--   telefone nem e-mail, só o @usuário. Passa a valer como meio de contato no
--   wizard ("telefone, e-mail OU Instagram").
--
--   rate_settings += "paymentOptions" — as condições de pagamento que o
--   cliente escolhe na proposta (Pix à vista com desconto, 50%+50%, cartão
--   parcelado), com rótulo em PT/EN/ES e o % de desconto. Vazio = cai nos
--   padrões do código (DEFAULT_PAYMENT_OPTIONS em src/lib/rate-engine.ts).
--
--   crm_interactions.kind += 'client_intake' — a entrada da timeline.
--
-- Idempotente e aditiva: nenhuma coluna existente muda de tipo ou é removida.
-- Aplicar com `pnpm db:sql migrations/crm_intake_proposta.sql` (DEV primeiro).
--
-- ORDEM IMPORTA: aplicar ANTES do deploy. `saveQuote` passa a gravar
-- "clientInstagram" em todo orçamento — sem a coluna, salvar cotação falha.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. rate_quotes: cadastro do titular + Instagram ─────────────────────────

ALTER TABLE public.rate_quotes
  ADD COLUMN IF NOT EXISTS "clientInstagram" TEXT,
  ADD COLUMN IF NOT EXISTS "intake"          JSONB,
  ADD COLUMN IF NOT EXISTS "intakeAt"        TIMESTAMPTZ;

-- A Fila de hoje e o funil perguntam "quem já mandou os dados?" — índice
-- parcial, que a esmagadora maioria das linhas nunca terá cadastro.
CREATE INDEX IF NOT EXISTS idx_rate_quotes_intake_at
  ON public.rate_quotes ("propertyId", "intakeAt")
  WHERE "intakeAt" IS NOT NULL;

-- ── 2. rate_settings: condições de pagamento da proposta ────────────────────

ALTER TABLE public.rate_settings
  ADD COLUMN IF NOT EXISTS "paymentOptions" JSONB;

-- ── 3. crm_interactions.kind: + client_intake ───────────────────────────────

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
         'client_accepted','client_intake'))
  $chk$;
END $$;

-- ── Conferência ─────────────────────────────────────────────────────────────

-- Deve listar "clientInstagram" (text), "intake" (jsonb) e "intakeAt" (timestamptz):
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'rate_quotes'
   AND column_name IN ('clientInstagram', 'intake', 'intakeAt')
 ORDER BY column_name;

-- Deve listar "paymentOptions" (jsonb):
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'rate_settings'
   AND column_name = 'paymentOptions';

-- Deve mostrar UM check contendo client_intake:
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.crm_interactions'::regclass
   AND contype = 'c'
   AND pg_get_constraintdef(oid) LIKE '%kind%';
