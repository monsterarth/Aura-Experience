-- Devolve as estadias arquivadas ao histórico.
--
-- "Arquivar" era a única faxina possível na aba Encerradas: um botão manual que
-- tirava a estadia da lista para sempre. Com a grade de "Últimas saídas" no topo
-- e o histórico filtrável embaixo, ele perdeu a função — e o que ele escondeu
-- precisa voltar, senão essas estadias somem do histórico para sempre (8 linhas
-- na contagem de 24/08/2026).
--
-- `billClosedAt` entra junto porque agora é ele que decide a aba: sem data, a
-- estadia reapareceria em "Ativas" como conta aberta.
--
-- Idempotente: só toca linhas ainda em 'archived'.

SELECT count(*) AS arquivadas_antes FROM stays WHERE status = 'archived';

UPDATE stays
   SET status = 'finished',
       "billClosedAt" = COALESCE("billClosedAt", "checkOutActual", "checkOut"),
       "updatedAt" = now()
 WHERE status = 'archived';

SELECT count(*) AS arquivadas_depois FROM stays WHERE status = 'archived';
