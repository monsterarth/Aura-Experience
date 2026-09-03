-- migrations/hr_fatia4_afd.sql
--
-- RH v2 — fatia 4: import do AFD e o confronto previsto × realizado.
-- Ver docs/HR-V2.md.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE FALTAVA PARA O IMPORT EXISTIR
--
-- A tabela de batidas já nasceu preparada (`timeclock_phase1.sql`): o par
-- (`repSerial`, `nsr`) é único, e é ele que torna a reimportação idempotente —
-- o AFD é CUMULATIVO, reimportar o mesmo arquivo é o caso normal, e sem isso
-- cada import duplicaria o mês.
--
-- O que não existia era o **identificador**. O AFD identifica a pessoa por PIS
-- (layout da Portaria 1510) ou por CPF (layout da 671), e a tabela `staff` não
-- tem nenhum dos dois. Sem isso não há como casar a batida com o funcionário.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE UMA TABELA SEPARADA, E NÃO DUAS COLUNAS EM `staff`
--
-- A RLS de `staff` deixa qualquer pessoa logada ler a linha inteira de quem é da
-- mesma propriedade (`staff_select`: super_admin OR id = auth.uid() OR
-- propertyId = auth_property_id()), e há leitura de `staff` pelo client do
-- browser nos apps de campo. Pôr CPF e PIS ali entregaria o documento de todo
-- mundo ao navegador de cada camareira.
--
-- Aqui vale o mesmo alvo de `time_clock_events`: RLS ligada, ZERO política, nega
-- tudo fora do service role. Documento pessoal só sai por rota com cargo.
--
-- Aplicar:  pnpm db:sql migrations/hr_fatia4_afd.sql               (DEV)
--           pnpm db:sql migrations/hr_fatia4_afd.sql --target prod

-- ══════════════════════════════════════════════════════════════════════════════
-- 1) O IDENTIFICADOR — o que casa a batida com a pessoa
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_documents (
  "staffId" text PRIMARY KEY,
  "propertyId" text NOT NULL,

  /* Só dígitos, sem pontuação e SEM zeros à esquerda removidos: o AFD escreve o
     PIS com 12 posições e o CPF com 11, ambos preenchidos com zero à esquerda, e
     normalizar para número perderia o zero e o casamento falharia em silêncio. */
  pis text,
  cpf text,

  /* Matrícula interna, quando o relógio identifica por ela em vez de documento.
     Existe porque não dá para saber antes de ver o arquivo de exemplo. */
  "repRegistration" text,

  note text,
  "updatedBy" text,
  "updatedByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_documents_pis_chk') THEN
    ALTER TABLE staff_documents ADD CONSTRAINT staff_documents_pis_chk
      CHECK (pis IS NULL OR pis ~ '^[0-9]{11,12}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_documents_cpf_chk') THEN
    ALTER TABLE staff_documents ADD CONSTRAINT staff_documents_cpf_chk
      CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
  END IF;
END $$;

/* O casamento do import é por documento DENTRO da propriedade. Único para que
   dois cadastros não disputem a mesma batida — e parcial por IS NOT NULL, que é
   o único parcial que o planejador alcança com parâmetro (ver
   `perf_indices_postgrest_parametros.sql`). */
CREATE UNIQUE INDEX IF NOT EXISTS staff_documents_pis_uniq
  ON staff_documents ("propertyId", pis) WHERE pis IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_documents_cpf_uniq
  ON staff_documents ("propertyId", cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_documents_reg_uniq
  ON staff_documents ("propertyId", "repRegistration") WHERE "repRegistration" IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2) HISTÓRICO DE IMPORTAÇÃO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Existe para a tela poder dizer o que aconteceu, e para o segundo import do
-- mesmo arquivo ser uma informação em vez de um susto. Guarda também as batidas
-- que NÃO entraram e por quê — que é o dado que faz alguém ir cadastrar o PIS
-- que falta em vez de achar que a pessoa não bateu ponto.

CREATE TABLE IF NOT EXISTS afd_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" text NOT NULL,

  "fileName" text,
  "fileBytes" int,
  /* Hash do conteúdo: reimportar o MESMO arquivo é reconhecido na hora, antes de
     percorrer linha por linha. */
  "fileHash" text,

  layout text,                    /* '1510' · '671' · 'desconhecido' */
  "repSerial" text,
  "periodFrom" date,
  "periodTo" date,

  "linesTotal" int NOT NULL DEFAULT 0,
  "punchesFound" int NOT NULL DEFAULT 0,
  "punchesImported" int NOT NULL DEFAULT 0,
  "punchesDuplicated" int NOT NULL DEFAULT 0,
  "punchesUnmatched" int NOT NULL DEFAULT 0,

  /* Quem o arquivo trouxe e o sistema não soube de quem era. É a lista de
     "cadastre o PIS desta pessoa". */
  "unmatchedIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,

  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_afd_imports_property
  ON afd_imports ("propertyId", "createdAt" DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3) A BATIDA SABE DE QUAL IMPORT VEIO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Sem isto, um import feito com o de-para errado não teria como ser desfeito
-- sem levar junto as batidas boas.

ALTER TABLE time_clock_events
  ADD COLUMN IF NOT EXISTS "importId" uuid REFERENCES afd_imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tce_import ON time_clock_events ("importId");

-- ══════════════════════════════════════════════════════════════════════════════
-- 4) SEGURANÇA
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE afd_imports     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON staff_documents, afd_imports FROM anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5) CONFERÊNCIA
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_rep int;
BEGIN
  SELECT count(*) INTO v_rep FROM staff WHERE "timeSource" = 'rep';
  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'staff_documents e afd_imports criadas.';
  RAISE NOTICE 'pessoas com timeSource = rep: %  (o import só aceita batida destas)', v_rep;
  RAISE NOTICE 'Cadastre o PIS/CPF em /admin/rh antes do primeiro import.';
  RAISE NOTICE '─────────────────────────────────────────────';
END $$;
