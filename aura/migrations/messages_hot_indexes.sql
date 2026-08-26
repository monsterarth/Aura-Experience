-- migrations/messages_hot_indexes.sql
--
-- `messages` responde por 90,5% de toda a leitura do banco: 3,97 bilhões de tuplas em 261
-- dias. A tabela tem 36 mil linhas e apenas dois índices — a chave primária e `propertyId`,
-- que não filtra nada porque quase toda mensagem é da mesma propriedade. Resultado: as três
-- queries quentes caem em varredura sequencial e tocam ~1 486 blocos (11,9 MB) cada uma para
-- devolver um número ou uma linha.
--
-- Os três são PARCIAIS de propósito. O predicado é sempre um subconjunto pequeno (2 868 não
-- lidas, 0 em fila), então o índice fica minúsculo e não pesa na escrita das outras linhas.
--
-- Aplicar SEM transação — CREATE INDEX CONCURRENTLY não roda dentro de BEGIN:
--   pnpm db:sql migrations/messages_hot_indexes.sql --no-atomic
--   pnpm db:sql migrations/messages_hot_indexes.sql --no-atomic --target prod

-- 1. Contador do sino (NotificationContext + NotificationCenter): 51 733 chamadas, 42 min de
--    CPU acumulados. Usa head:true, então não gastava banda — só processamento.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_unread
  ON messages ("propertyId")
  WHERE direction = 'inbound' AND "isReadByAdmin" = false;

-- 2. Fila do cron `process-messages`: 42 113 chamadas, 41 min de CPU. Varria as 36 mil linhas
--    para achar as agendadas — hoje são ZERO.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_queue
  ON messages (status, "scheduledFor")
  WHERE status = 'queued';

-- 3. Webhook do WhatsApp casando o id externo da Evolution: 6 308 chamadas, uma linha cada,
--    tabela inteira varrida em todas.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_api_id
  ON messages ("propertyId", "messageIdApi")
  WHERE "messageIdApi" IS NOT NULL;
