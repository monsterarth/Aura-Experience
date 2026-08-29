-- Telefone brasileiro guardado sem o DDI 55.
--
-- A regra do sistema é uma só (`src/lib/phone.ts`): o banco guarda **dígitos já
-- com o DDI**, porque o `to` do WhatsApp é esse valor cru e não existe — nem
-- deve existir — auto-55 escondido no servidor. Só que o cadastro antigo
-- (anterior ao campo de DDI nos formulários) deixou linhas de 10/11 dígitos.
--
-- O que isso custou: 22 mensagens morreram como "Bad Request" entre março e
-- agosto de 2026, uma de cada vez, sem ninguém ligar a causa ao efeito.
--
-- Medido em produção em 28/08/2026: 53 contatos, 15 hóspedes e 1 funcionário.
--
-- Por que 10 e 11 dígitos e nada mais:
--   10 = DDD + 8 (fixo antigo) · 11 = DDD + 9 (celular). Os dois são brasileiros
--   sem o país e ganham o 55 com segurança — inclusive quando já começam com 55,
--   que aí é o DDD de Santa Maria/RS e o resultado correto é 55 + 55 + número.
--
-- O que fica INTACTO de propósito (verificado linha a linha antes de escrever):
--   12-13 dígitos começando com 54/595/49/89… → internacional de verdade;
--   18 dígitos começando com 120363          → JID de GRUPO do WhatsApp;
--   14-16 e 22 dígitos, e um '0' solto        → dado corrompido, que prefixar
--                                               não conserta e só disfarça.
--
-- Idempotente: rodar de novo não encontra mais nenhuma linha de 10/11 dígitos.
--
-- Aplicar:  pnpm db:sql migrations/phone_ddi_backfill.sql             (DEV)
--           pnpm db:sql migrations/phone_ddi_backfill.sql --target prod

UPDATE contacts
SET phone = '55' || regexp_replace(phone, '[^0-9]', '', 'g')
WHERE length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) IN (10, 11);

UPDATE guests
SET phone = '55' || regexp_replace(phone, '[^0-9]', '', 'g')
WHERE length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) IN (10, 11);

UPDATE staff
SET phone = '55' || regexp_replace(phone, '[^0-9]', '', 'g')
WHERE length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) IN (10, 11);
