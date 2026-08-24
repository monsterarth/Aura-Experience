-- Fecha a conta das estadias que já estavam encerradas de fato.
--
-- A partir da fase 2 o portão entre "Ativas" e "Encerradas" é `billClosedAt`: fez
-- check-out e a conta ainda não foi encerrada → a estadia CONTINUA em Ativas, no
-- grupo "Saíram · conta aberta". Sem este backfill, todo o histórico (251 estadias
-- `finished` sem `billClosedAt` na contagem de 24/08/2026) reapareceria em Ativas
-- no primeiro deploy.
--
-- A condição é a mesma que a aba "Conta" usava para considerar algo pendente: fólio
-- com lançamento pendente ou objeto esquecido sem destino. Quem tiver pendência de
-- verdade NÃO é fechado aqui — aparece em Ativas para alguém resolver, que é
-- exatamente o comportamento novo. Na contagem de 24/08 nenhuma das 251 tinha
-- pendência, então o backfill fecha todas; a condição existe para o dia em que a
-- migration rodar em produção com o banco já diferente.
--
-- A data usada é a saída real (`checkOutActual`), com `checkOut` como reserva —
-- não `now()`: inventar "encerrada hoje" bagunçaria a ordenação do histórico.
--
-- Idempotente: só toca linhas com `billClosedAt` nulo.

UPDATE stays s
   SET "billClosedAt" = COALESCE(s."checkOutActual", s."checkOut"),
       "hasOpenFolio" = false
 WHERE s.status = 'finished'
   AND s."billClosedAt" IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM folio_items f
      WHERE f."stayId" = s.id AND f.status = 'pending'
   )
   AND (s."lostItemsDescription" IS NULL OR btrim(s."lostItemsDescription") = '');

-- Conferência: quantas seguem abertas de propósito (vão aparecer em Ativas).
SELECT count(*) AS contas_abertas_restantes
  FROM stays
 WHERE status = 'finished' AND "billClosedAt" IS NULL;
