-- migrations/rate_settings_age_policy.sql
--
-- Política de idade dos acompanhantes: até que idade é isento, qual faixa paga
-- meia e quanto vale a meia. Era regra de cabeça ("free até 5") e vira
-- configuração da propriedade — a mesma política classifica bebê × criança nas
-- reservas que chegam dos canais (hsystem-service).
--
-- Sem DEFAULT: ausência = DEFAULT_AGE_POLICY no código (free 5, sem meia, 50%).

ALTER TABLE rate_settings ADD COLUMN IF NOT EXISTS "agePolicy" jsonb;

SELECT "propertyId", "agePolicy" FROM rate_settings;
