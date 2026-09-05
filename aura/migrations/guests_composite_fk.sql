-- migrations/guests_composite_fk.sql
--
-- As chaves estrangeiras que nunca existiram — passo 3 do multi-tenant
-- (docs/MODULARIZATION.md §10). Roda DEPOIS de guests_composite_pk.sql.
--
-- Até aqui, ZERO constraints apontavam para `guests`: quem garantia que uma
-- estadia apontava para uma ficha da MESMA pousada era o service lembrar de
-- filtrar. Foi assim que 18 linhas atravessaram tenants sem ninguém notar.
-- A partir daqui é o banco que recusa, e o bug não volta por código novo.
--
-- MATCH SIMPLE (o padrão) é o que queremos: estadia sem hóspede (`guestId` NULL)
-- passa, porque com qualquer coluna nula a constraint é satisfeita. É o caso de
-- reserva de bloqueio e de estadia interna.
--
-- ON DELETE NO ACTION, também o padrão: apagar uma ficha que ainda tem estadia
-- passa a ser recusado. É desejado — hoje `promoteGuestId` e `mergeGuests` movem
-- as referências ANTES de apagar a ficha antiga (insere a nova → reponta → apaga),
-- então a ordem já é compatível. O que muda é que um repoint incompleto passa a
-- falhar alto em vez de deixar linha órfã em silêncio.
--
-- `stays` entra NOT VALID de propósito: existe UMA estadia histórica órfã
-- (`59beae73`, fazenda-do-rosa, finished, 19/05/2026) apontando para a ficha
-- provisória `GUEST1778867097125`, que não existe mais. NOT VALID vale para toda
-- linha NOVA e não toca no histórico. Para validar depois, decidir o que fazer
-- com essa estadia (anular o `guestId` ou recriar a ficha) e então:
--   ALTER TABLE stays VALIDATE CONSTRAINT stays_guest_fk;
--
-- Aplicar:  pnpm db:sql migrations/guests_composite_fk.sql              (DEV)
--           pnpm db:sql migrations/guests_composite_fk.sql --target prod
-- Reversível: DROP CONSTRAINT em cada uma.

-- 0) Alguma tabela com `guestId` ficou de fora desta lista?
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.table_name, ', ') INTO faltando
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.column_name = 'guestId'
     AND c.table_name <> 'guests'
     AND c.table_name NOT IN ('stays','contacts','rate_quotes','structure_bookings',
                              'structure_reviews','survey_responses','vehicles');
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Tabela(s) com guestId fora desta migration: %. Inclua ou justifique.', faltando;
  END IF;
END $$;

-- 1) As seis sem violação — entram validadas.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contacts','rate_quotes','structure_bookings',
                           'structure_reviews','survey_responses','vehicles']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_guest_fk') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY ("propertyId","guestId")
           REFERENCES public.guests("propertyId", id)', t, t || '_guest_fk');
      RAISE NOTICE 'FK criada: %', t || '_guest_fk';
    END IF;
  END LOOP;
END $$;

-- 2) `stays`: NOT VALID por causa da estadia órfã histórica.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stays_guest_fk') THEN
    ALTER TABLE public.stays ADD CONSTRAINT stays_guest_fk
      FOREIGN KEY ("propertyId","guestId") REFERENCES public.guests("propertyId", id)
      NOT VALID;
    RAISE NOTICE 'FK criada (NOT VALID): stays_guest_fk';
  END IF;
END $$;

-- 3) Índice em (propertyId, guestId) onde a busca por hóspede é frequente.
--    A FK não cria índice do lado filho, e sem ele o DELETE de uma ficha varre a
--    tabela inteira para checar referências.
CREATE INDEX IF NOT EXISTS stays_property_guest_idx    ON public.stays ("propertyId","guestId");
CREATE INDEX IF NOT EXISTS contacts_property_guest_idx ON public.contacts ("propertyId","guestId");

-- 4) Verificação.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint
   WHERE confrelid = 'public.guests'::regclass AND contype = 'f';
  IF n <> 7 THEN
    RAISE EXCEPTION 'Esperava 7 FKs apontando para guests, encontrei %.', n;
  END IF;
  RAISE NOTICE '7 FKs apontando para guests (stays ainda NOT VALID).';
END $$;
