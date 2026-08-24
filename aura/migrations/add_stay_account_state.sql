-- A conta da estadia: chave, itens emprestados e objetos esquecidos viram estado.
--
-- A conta e o fólio são a mesma coisa — cada estadia tem UMA conta, que precisa ser
-- encerrada depois do check-out. Além do saldo, três coisas seguram o ciclo e até
-- aqui não tinham onde morar:
--
--   • Chave — o check-out já grava `keyLocation`, e a camareira já responde "estava na
--     acomodação?" na conferência de saída. Mas o "não estava" só virava um item de
--     rastreio R$ 0 no fólio: no dia seguinte ninguém sabia se a chave apareceu.
--   • Itens emprestados — `loanedItemsChecked` só sabe dizer "conferido"; não existia
--     o desfecho "não voltou" nem "foi cobrado".
--   • Objetos esquecidos — `lostItemsDescription` ficava preenchido para sempre. Pior:
--     `closeStayBill()` APAGAVA a descrição ao encerrar a conta (perda de registro).
--     A partir daqui o destino é explícito: devolvido, descartado ou guardado.
--
-- Aditivo e idempotente. O backfill só afirma o que o banco já sabia — chave que o
-- hóspede devolveu na recepção e empréstimo que a camareira conferiu. Estadia antiga
-- sem registro fica NULL (chip neutro "sem registro"), nunca vermelha por invenção.

ALTER TABLE stays
  ADD COLUMN IF NOT EXISTS "keyStatus"           text,
  ADD COLUMN IF NOT EXISTS "keyStatusAt"         timestamptz,
  ADD COLUMN IF NOT EXISTS "keyStatusBy"         text,
  ADD COLUMN IF NOT EXISTS "loanedItemsStatus"   text,
  ADD COLUMN IF NOT EXISTS "lostItemsResolution" text,
  ADD COLUMN IF NOT EXISTS "lostItemsResolvedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "lostItemsResolvedBy" text;

COMMENT ON COLUMN stays."keyStatus" IS
  'Ciclo da chave: reception (devolvida no balcão) | awaiting_conference (ficou na cabana, governança confirma) | found (camareira achou) | missing (não localizada) | returned (apareceu depois) | charged (cobrada no fólio). NULL = sem registro.';
COMMENT ON COLUMN stays."keyStatusBy" IS 'staff.id de quem deu o último desfecho à chave.';
COMMENT ON COLUMN stays."loanedItemsStatus" IS
  'Itens emprestados: pending | returned | missing | charged. NULL = nada emprestado.';
COMMENT ON COLUMN stays."lostItemsResolution" IS
  'Destino do objeto esquecido: returned (devolvido ao hóspede) | discarded (descartado) | stored (guardado em achados e perdidos — segue pendente, mas não impede encerrar a conta).';

-- Backfill honesto: só o que já estava registrado.
UPDATE stays
   SET "keyStatus" = 'reception'
 WHERE "keyStatus" IS NULL
   AND status = 'finished'
   AND "keyLocation" = 'reception';

UPDATE stays
   SET "loanedItemsStatus" = 'returned'
 WHERE "loanedItemsStatus" IS NULL
   AND "loanedItemsChecked" = true;

UPDATE stays
   SET "loanedItemsStatus" = 'pending'
 WHERE "loanedItemsStatus" IS NULL
   AND "loanedItems" IS NOT NULL
   AND btrim("loanedItems") <> ''
   AND COALESCE("loanedItemsChecked", false) = false;
