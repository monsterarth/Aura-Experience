-- migrations/guests_composite_pk.sql
--
-- `guests` passa a ter chave composta (propertyId, id) — passo 2 do multi-tenant
-- (docs/MODULARIZATION.md §10).
--
-- O PROBLEMA QUE ISTO RESOLVE: `guests.id` é o documento (o CPF, quando há um) e
-- era chave primária GLOBAL. Duas pousadas não podiam ter o mesmo hóspede. Antes
-- da fatia 0 isso CORROMPIA — a pousada B sobrescrevia a ficha da A e levava o
-- `propertyId` junto (18 linhas contaminadas, medidas em 02/09 e limpas em 05/09).
-- Depois da fatia 0 passou a BLOQUEAR, com mensagem. Nenhum dos dois serve para
-- vender o AURA a pousadas de uma mesma região, onde o hóspede repete.
--
-- Com a chave composta, cada pousada tem a SUA ficha do mesmo documento. É também
-- o que a LGPD pede: cada pousada é controladora própria, e o histórico de uma não
-- pode vazar para a outra.
--
-- POR QUE É BARATO: as 7 tabelas filhas (`stays`, `contacts`, `rate_quotes`,
-- `structure_bookings`, `structure_reviews`, `survey_responses`, `vehicles`) JÁ
-- têm `propertyId`, e `audit_logs` também. Não falta coluna em lugar nenhum —
-- faltava usar o que já estava lá. Zero linha transformada: os 417 ids de hoje
-- são distintos e a chave nova aceita todos como estão.
--
-- ORDEM OBRIGATÓRIA — esta migration e o código vão no MESMO deploy:
--   • `GuestService.upsertGuestDirect` usa `onConflict: 'id'`. Sem trocar para
--     'propertyId,id', o PostgREST recusa TODA gravação de ficha (recepção parada).
--   • O contrário também quebra: 'propertyId,id' sem a constraint não resolve.
-- As leituras já foram escopadas antes (passo 1, commit 8a8fdfc) — é o que impede
-- um `.eq('id', x).single()` de estourar no dia da primeira coexistência.
--
-- Aplicar:  pnpm db:sql migrations/guests_composite_pk.sql              (DEV)
--           pnpm db:sql migrations/guests_composite_pk.sql --target prod
-- Reversível enquanto não houver documento repetido entre pousadas:
--   ALTER TABLE guests DROP CONSTRAINT guests_pkey;
--   ALTER TABLE guests ADD PRIMARY KEY (id);

-- 0) Travas de segurança — falhar aqui é melhor do que falhar no meio.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.guests WHERE "propertyId" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Há % ficha(s) com propertyId NULL — a chave composta não aceita. Resolva antes.', n;
  END IF;

  SELECT count(*) INTO n FROM (
    SELECT "propertyId", id FROM public.guests GROUP BY 1,2 HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'Há % par(es) (propertyId, id) repetido(s) — impossível sob a PK atual. Investigue.', n;
  END IF;

  -- `guests` não está em nenhuma publicação de realtime; se um dia estiver, trocar a
  -- PK muda a REPLICA IDENTITY e os subscribers param de identificar a linha.
  IF EXISTS (SELECT 1 FROM pg_publication_tables
              WHERE schemaname='public' AND tablename='guests') THEN
    RAISE EXCEPTION 'guests entrou numa publicação de realtime — revise a REPLICA IDENTITY antes de trocar a PK.';
  END IF;
END $$;

-- 1) A troca da chave.
ALTER TABLE public.guests DROP CONSTRAINT guests_pkey;
ALTER TABLE public.guests ADD CONSTRAINT guests_pkey PRIMARY KEY ("propertyId", id);

-- 2) Índices. A PK nova já indexa `propertyId` na primeira posição, então o índice
--    avulso vira redundante. Em compensação, busca POR DOCUMENTO sem propriedade
--    (suporte, super_admin, o `promoteGuestId`) perde o índice da PK antiga —
--    este devolve.
DROP INDEX IF EXISTS public.guests_propertyid_idx;
CREATE INDEX IF NOT EXISTS guests_id_idx ON public.guests (id);

-- 3) Verificação: falha se a chave não ficou como esperado.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint WHERE conrelid = 'public.guests'::regclass AND contype = 'p';
  IF def IS DISTINCT FROM 'PRIMARY KEY ("propertyId", id)' THEN
    RAISE EXCEPTION 'PK inesperada depois da migration: %', def;
  END IF;
  RAISE NOTICE 'guests_pkey = %', def;
END $$;
