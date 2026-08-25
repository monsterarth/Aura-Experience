-- migrations/guests_created_at.sql
--
-- `guests` só tinha updatedAt — sem como saber QUANDO a ficha nasceu (stays já
-- tem createdAt). Regra do preenchimento:
--   • Coluna nasce SEM default no ADD (senão todo o legado seria carimbado com a
--     data da migration); o DEFAULT now() entra depois, só para linhas novas.
--   • Legado: backfill best-effort com o primeiro audit_log de CREATE da ficha
--     (data real de criação). Quem não tem log fica NULL = "data desconhecida" —
--     honesto, em vez de uma data inventada.

ALTER TABLE guests ADD COLUMN IF NOT EXISTS "createdAt" timestamptz;
ALTER TABLE guests ALTER COLUMN "createdAt" SET DEFAULT now();

UPDATE guests g
   SET "createdAt" = src.first_log
  FROM (
    SELECT "entityId" AS guest_id, MIN(timestamp) AS first_log
      FROM audit_logs
     WHERE entity = 'GUEST' AND action = 'CREATE'
     GROUP BY "entityId"
  ) src
 WHERE g.id = src.guest_id
   AND g."createdAt" IS NULL;

SELECT count(*) FILTER (WHERE "createdAt" IS NOT NULL) AS com_data,
       count(*) FILTER (WHERE "createdAt" IS NULL)     AS sem_data_legado
  FROM guests;
