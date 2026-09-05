-- migrations/guests_orphan_stay_repoint.sql
--
-- Conserta a última estadia órfã e valida a FK de `stays`
-- (docs/MODULARIZATION.md §10). Roda DEPOIS de guests_composite_fk.sql.
--
-- O CASO: a estadia `59beae73` (fazenda-do-rosa, 19–21/05/2026, cabana 16, finished)
-- apontava para a ficha provisória `GUEST1778867097125`, que já não existe. Era a
-- única linha que violava a FK, e por causa dela `stays_guest_fk` nasceu NOT VALID.
--
-- QUEM ERA: LUADNY CAMILO. Recuperado do `audit_logs` — a ficha provisória foi
-- criada em 15/05 com esse nome, e as mensagens da estadia foram para o telefone
-- 5548988296923. Ela NÃO some do sistema: tem ficha ativa hoje sob o CPF real
-- `08843053922`, mesma propriedade, MESMO telefone, criada em 07/08/2026 para a
-- segunda estadia dela (08–09/08, cabana 15).
--
-- O QUE ACONTECEU: a ficha provisória foi apagada em algum momento entre maio e
-- agosto sem que esta estadia fosse repontada junto — exatamente o defeito que a
-- FK criada em guests_composite_fk.sql passa a impedir. Não é dado perdido, é
-- referência quebrada.
--
-- POR QUE REPONTAR E NÃO ANULAR: anular o `guestId` validaria a FK do mesmo jeito,
-- mas apagaria o último vestígio de que a estadia foi dela. Repontar restaura a
-- verdade e transforma a LUADNY na hóspede recorrente que ela é (2 estadias).
--
-- Aplicar:  pnpm db:sql migrations/guests_orphan_stay_repoint.sql              (DEV)
--           pnpm db:sql migrations/guests_orphan_stay_repoint.sql --target prod
-- Idempotente. Reversível: o valor antigo é `GUEST1778867097125`.

-- 1) O repoint, com trava: só age se a linha estiver no estado esperado.
DO $$
DECLARE n int;
BEGIN
  UPDATE public.stays
     SET "guestId" = '08843053922'
   WHERE id = '59beae73-5237-4991-86d7-b1de19d04a51'
     AND "propertyId" = 'fazenda-do-rosa'
     AND "guestId" = 'GUEST1778867097125';
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n = 1 THEN
    RAISE NOTICE 'Estadia 59beae73 repontada: GUEST1778867097125 -> 08843053922 (LUADNY CAMILO).';
  ELSE
    RAISE NOTICE 'Nada a repontar (já aplicado, ou a linha mudou de estado).';
  END IF;

  -- A ficha de destino precisa existir na MESMA propriedade, senão a FK recusa.
  IF NOT EXISTS (SELECT 1 FROM public.guests
                  WHERE id = '08843053922' AND "propertyId" = 'fazenda-do-rosa') THEN
    RAISE EXCEPTION 'Ficha 08843053922 não existe em fazenda-do-rosa — repoint impossível.';
  END IF;
END $$;

-- 2) Sobrou alguma estadia apontando para ficha que não existe na propriedade dela?
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n
    FROM public.stays s
   WHERE s."guestId" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.guests g
                      WHERE g.id = s."guestId" AND g."propertyId" = s."propertyId");
  IF n > 0 THEN
    RAISE EXCEPTION 'Ainda há % estadia(s) violando a FK — investigue antes de validar.', n;
  END IF;
END $$;

-- 3) Valida a constraint. A partir daqui ela vale para o histórico inteiro, não só
--    para linha nova.
ALTER TABLE public.stays VALIDATE CONSTRAINT stays_guest_fk;

-- 4) Verificação.
DO $$
DECLARE ok boolean;
BEGIN
  SELECT convalidated INTO ok FROM pg_constraint WHERE conname = 'stays_guest_fk';
  IF NOT ok THEN RAISE EXCEPTION 'stays_guest_fk continua NOT VALID.'; END IF;
  RAISE NOTICE 'stays_guest_fk validada — as 7 FKs de guests valem para todo o histórico.';
END $$;
