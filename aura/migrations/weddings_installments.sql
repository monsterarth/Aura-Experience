-- ═══════════════════════════════════════════════════════════════════════════
-- CRM FASE B.5 — 3/4: parcelas reais de casamento (wedding_installments)
--
--   As parcelas deixam de ser 2 campos fixos em weddings (depositValue /
--   secondInstallmentValue) + uma 3ª derivada na tela, e viram linhas com
--   VENCIMENTO: parcela vencida e não paga entra na fila de alarmes do
--   funil de casamentos como cobrança (linha virtual — sem duplicar estado).
--
--   Os campos legados ficam CONGELADOS no banco (a UI para de escrever);
--   a tela lê wedding_installments com fallback na derivação legada se vazio.
--
-- POR QUE O DO DINÂMICO: a tabela weddings é anterior às migrations
-- versionadas — o tipo da PK não é garantido (uuid vs text). O FK das
-- parcelas é criado com o tipo REAL lido de pg_attribute.
--
-- Idempotente — pode rodar de novo sem efeito colateral IMEDIATO (o backfill
-- só pega casamentos SEM nenhuma parcela). ATENÇÃO: rodar de novo MESES
-- depois recriaria parcelas de casamentos que ficaram deliberadamente sem
-- nenhuma — rode uma vez só.
-- Aplicar no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabela (FK com o tipo real da PK de weddings) ────────────────────────

DO $$
DECLARE
  pk_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO pk_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.weddings'::regclass
     AND a.attname = 'id';

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'wedding_installments' AND relnamespace = 'public'::regnamespace
  ) THEN
    EXECUTE format($ct$
      CREATE TABLE public.wedding_installments (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "weddingId" %s NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
        label       TEXT NOT NULL,
        value       NUMERIC NOT NULL DEFAULT 0,
        "dueDate"   DATE,               -- NULL até o vencimento ser combinado
        paid        BOOLEAN NOT NULL DEFAULT false,
        "paidAt"    TIMESTAMPTZ,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )$ct$, pk_type);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wedding_installments_wedding
  ON public.wedding_installments("weddingId", "sortOrder");
-- Cobrança: a fila e o badge só olham vencida + não paga.
CREATE INDEX IF NOT EXISTS idx_wedding_installments_overdue
  ON public.wedding_installments("dueDate") WHERE paid = false;

-- RLS: o browser só LÊ (badge conta parcelas vencidas + realtime); escrita é
-- exclusiva das rotas (service role, com posse validada + auditoria). Policy
-- FOR ALL deixaria qualquer staff logado marcar parcela alheia como paga
-- direto no PostgREST, sem auditoria — achado da revisão da fase B.5.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.wedding_installments ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS wedding_installments_auth_all ON public.wedding_installments;';
  EXECUTE 'DROP POLICY IF EXISTS wedding_installments_auth_read ON public.wedding_installments;';
  EXECUTE 'CREATE POLICY wedding_installments_auth_read ON public.wedding_installments FOR SELECT TO authenticated USING (true);';
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.wedding_installments FROM anon, authenticated;';
END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.wedding_installments; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Sonda ANTES do backfill ──────────────────────────────────────────────

-- Quantos casamentos vão ganhar parcelas (sem nenhuma linha ainda):
SELECT count(*) AS casamentos_sem_parcelas
  FROM public.weddings w
 WHERE NOT EXISTS (SELECT 1 FROM public.wedding_installments i WHERE i."weddingId" = w.id);

-- ── 3. Backfill idempotente ─────────────────────────────────────────────────
-- Um único INSERT com CTE: as três parcelas nascem juntas do MESMO recorte de
-- "sem parcelas" (três INSERTs separados quebrariam a idempotência — o 1º já
-- faria o 2º pular o casamento). A 3ª é derivada: contrato − sinal − 2ª.
-- Só entram linhas com valor > 0. dueDate fica NULL: vencimento não se inventa.
-- ATENÇÃO combinada em plano: casamento antigo com saldo ganha 3ª parcela
-- "pendente" — correto, mas a marcação de pago é manual.

WITH sem_parcelas AS (
  SELECT w.id, w."contractTotal", w."depositValue", w."depositPaid",
         w."secondInstallmentValue", w."secondInstallmentPaid"
    FROM public.weddings w
   WHERE NOT EXISTS (SELECT 1 FROM public.wedding_installments i WHERE i."weddingId" = w.id)
)
INSERT INTO public.wedding_installments ("weddingId", label, value, paid, "paidAt", "sortOrder")
SELECT id, '1ª parcela — Sinal', "depositValue",
       COALESCE("depositPaid", false),
       CASE WHEN COALESCE("depositPaid", false) THEN now() END, 1
  FROM sem_parcelas
 WHERE COALESCE("depositValue", 0) > 0
UNION ALL
SELECT id, '2ª parcela — Intermediária', "secondInstallmentValue",
       COALESCE("secondInstallmentPaid", false),
       CASE WHEN COALESCE("secondInstallmentPaid", false) THEN now() END, 2
  FROM sem_parcelas
 WHERE COALESCE("secondInstallmentValue", 0) > 0
UNION ALL
SELECT id, '3ª parcela — Saldo final',
       GREATEST(COALESCE("contractTotal", 0) - COALESCE("depositValue", 0) - COALESCE("secondInstallmentValue", 0), 0),
       false, NULL, 3
  FROM sem_parcelas
 WHERE GREATEST(COALESCE("contractTotal", 0) - COALESCE("depositValue", 0) - COALESCE("secondInstallmentValue", 0), 0) > 0;

-- ── Conferência ─────────────────────────────────────────────────────────────

-- Parcelas criadas por casamento (esperado: até 3 por casamento com contrato):
SELECT w.bride || ' & ' || w.groom AS casal, w."contractTotal",
       count(i.id) AS parcelas, COALESCE(sum(i.value), 0) AS soma_parcelas
  FROM public.weddings w
  LEFT JOIN public.wedding_installments i ON i."weddingId" = w.id
 GROUP BY w.id, w.bride, w.groom, w."contractTotal"
 ORDER BY w."contractTotal" DESC;

-- Divergências soma ≠ contrato (esperado: só casamentos com campos legados
-- inconsistentes — ex.: sinal + 2ª maiores que o contrato):
SELECT w.bride || ' & ' || w.groom AS casal, w."contractTotal", sum(i.value) AS soma
  FROM public.weddings w
  JOIN public.wedding_installments i ON i."weddingId" = w.id
 GROUP BY w.id, w.bride, w.groom, w."contractTotal"
HAVING abs(sum(i.value) - w."contractTotal") > 0.01;
