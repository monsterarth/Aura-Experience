-- perf: os índices parciais do módulo de mensagens nunca puderam ser usados
--
-- Sintoma: em 28/08/2026 a recepção estava lançando reservas e o Supabase começou a
-- devolver a tela de erro do Cloudflare; o app (Vercel, sem Cloudflare na frente) passou
-- a dar 504. O banco não estava "fora do ar" — estava varrendo tabela.
--
-- Causa: três índices de `messages` foram criados como PARCIAIS com literal no predicado
-- (`WHERE direction='inbound' AND "isReadByAdmin"=false`, `WHERE status='queued'`). O
-- PostgREST sempre manda os valores como PARÂMETRO ($1, $2...), e aí o Postgres monta um
-- plano genérico onde não consegue provar que `$2 = 'inbound'`. Índice parcial com literal
-- no predicado é, na prática, inalcançável por qualquer query do PostgREST.
--
-- Medido em produção (pg_stat_user_indexes): idx_messages_queue com idx_scan = 0. Nunca
-- foi usado. E pg_stat_user_tables: `messages` com 183.316 seq scans e 3,3 BILHÕES de
-- linhas lidas numa tabela de 37 mil linhas.
--
-- Prova (mesma query, EXPLAIN ANALYZE em produção):
--   com parâmetros (o que roda de verdade) → messages_propertyid_idx, 20.550 linhas
--                                             descartadas no filtro, 811 buffers, 7,2 ms
--   com literais  (o que o índice esperava) → idx_messages_unread, 81 buffers, 0,15 ms
--
-- Repare que `idx_messages_api_id` (parcial em `"messageIdApi" IS NOT NULL`) FUNCIONA:
-- o predicado não depende de parâmetro, então o planejador consegue prová-lo. A regra é
-- essa — parcial por `IS NOT NULL` pode; parcial por igualdade a literal, não.
--
-- Correção: índices compostos comuns (sem predicado), que o plano genérico alcança.

-- 1. Badge de não lidas + lista de não lidas do NotificationContext.
--    Roda em TODA página do admin, para todo usuário logado, e refaz a cada evento
--    de realtime. Era o maior consumidor de I/O do banco.
--    (propertyId, direction, isReadByAdmin) resolve o count; createdAt DESC no fim
--    entrega a ordenação da lista sem sort.
CREATE INDEX IF NOT EXISTS idx_messages_inbox
  ON messages ("propertyId", direction, "isReadByAdmin", "createdAt" DESC);

-- 2. Fila de envio do process-messages: WHERE status = $1 AND "scheduledFor" <= $2.
--    Substitui idx_messages_queue, que era parcial em status='queued' e nunca pegou.
CREATE INDEX IF NOT EXISTS idx_messages_status_scheduled
  ON messages (status, "scheduledFor");

-- 3. Watchdog de status: WHERE status = $1 AND "updatedAt" < $2.
--    Vinha caindo no idx_messages_api_id por falta de coisa melhor (182 ms de média
--    no UPDATE, 9.279 chamadas).
CREATE INDEX IF NOT EXISTS idx_messages_status_updated
  ON messages (status, "updatedAt");

-- 4. Tarefas de governanta: WHERE "propertyId" = $1 AND status = $2/ANY($2).
--    O índice só por propertyId não filtra nada — são 2 propriedades. O plano genérico
--    lia o índice inteiro e descartava 1.786 das 1.835 linhas no filtro (52 ms).
--    É o mesmo caminho do /api/field/housekeeping-tasks que vinha dando 504.
CREATE INDEX IF NOT EXISTS idx_housekeeping_property_status
  ON housekeeping_tasks ("propertyId", status);

-- 5. Agendamentos de estrutura: WHERE "propertyId"=$1 AND status=$2 AND type=$3,
--    às vezes com ORDER BY "createdAt". Também é chamado pelo badge (52.560 vezes).
CREATE INDEX IF NOT EXISTS idx_structure_bookings_property_status_type
  ON structure_bookings ("propertyId", status, type, "createdAt");

-- 6. Os dois índices mortos saem: ocupam espaço, custam em toda escrita e, como está
--    provado acima, nenhuma query do PostgREST consegue alcançá-los.
DROP INDEX IF EXISTS idx_messages_queue;
DROP INDEX IF EXISTS idx_messages_unread;

ANALYZE messages;
ANALYZE housekeeping_tasks;
ANALYZE structure_bookings;

-- ---------------------------------------------------------------------------
-- Rollback (se precisar voltar exatamente ao estado anterior):
--
--   DROP INDEX IF EXISTS idx_messages_inbox;
--   DROP INDEX IF EXISTS idx_messages_status_scheduled;
--   DROP INDEX IF EXISTS idx_messages_status_updated;
--   DROP INDEX IF EXISTS idx_housekeeping_property_status;
--   DROP INDEX IF EXISTS idx_structure_bookings_property_status_type;
--   CREATE INDEX idx_messages_queue  ON messages (status, "scheduledFor")
--     WHERE status = 'queued';
--   CREATE INDEX idx_messages_unread ON messages ("propertyId")
--     WHERE direction = 'inbound' AND "isReadByAdmin" = false;
-- ---------------------------------------------------------------------------
