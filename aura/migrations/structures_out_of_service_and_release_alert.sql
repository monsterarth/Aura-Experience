-- migrations/structures_out_of_service_and_release_alert.sql
--
-- 05/09/2026 — duas colunas em `structures`:
--
--  1. "outOfService" — estrutura INTEIRA fora de operação, mesmo shape do
--     "unitStatus" ({status, note, since, byName}). É o caminho de quem não tem
--     unidades cadastradas (quiosque, salão, sala de massagem): sem unidade não há
--     chave em "unitStatus", e a única saída era relançar bloqueio manual todo dia
--     — a rotina que o estado persistente por unidade matou em 30/08/2026.
--
--  2. "releaseAlertSentFor" — último dia (YYYY-MM-DD) em que o cron
--     /api/cron/structure-release já mandou o push de "área ainda fechada".
--     Trava de repetição: sem ela o push sairia a cada rodada de 15 min.
--
-- Ambas nullable, sem default: ausência = disponível / nunca avisado. Não há
-- backfill a fazer — nenhuma linha existente muda de comportamento.
--
-- NÃO confundir "outOfService" com a coluna legada "status" ('available' |
-- 'maintenance' | ...), que está no tipo e no modal de edição mas NENHUM código
-- lê. Ela segue morta de propósito: um enum sem motivo, sem data e sem autor não
-- serve para o que a operação precisa mostrar ao hóspede.

ALTER TABLE structures
  ADD COLUMN IF NOT EXISTS "outOfService" jsonb,
  ADD COLUMN IF NOT EXISTS "releaseAlertSentFor" text;

COMMENT ON COLUMN structures."outOfService" IS
  'Estrutura inteira fora de operação: {status:''maintenance'', note, since, byName}. NULL = em operação. Persiste até alguém devolver (não reseta à meia-noite, ao contrário de releasedForDate).';

COMMENT ON COLUMN structures."releaseAlertSentFor" IS
  'YYYY-MM-DD do último push de "área ainda não liberada" enviado pelo cron structure-release. Trava de repetição.';
