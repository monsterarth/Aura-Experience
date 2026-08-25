-- migrations/hsystem_integration.sql
--
-- Módulo Hsystem (HUnit/HBook/HPrice) — fase 1: inbound de reservas + outbound de
-- disponibilidade. Ver docs e decisões em /admin/hsystem e src/services/hsystem-service.ts.
--
-- Aplicar:  pnpm db:sql migrations/hsystem_integration.sql            (DEV, default)
--           pnpm db:sql migrations/hsystem_integration.sql --target prod   (produção, com OK)

-- 1) Origem externa na estadia ------------------------------------------------
-- `source` reaproveita os slugs de canal do CRM (site/booking/airbnb/...).
-- `externalId` = locatorId da reserva no HUNIT; `externalRoomId` = roomLocatorId
-- do quarto (reserva multi-quarto vira N estadias no mesmo groupId).
ALTER TABLE stays ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE stays ADD COLUMN IF NOT EXISTS "externalId" text;
ALTER TABLE stays ADD COLUMN IF NOT EXISTS "externalRoomId" text;

-- Idempotência do import: no máximo 1 estadia por (propriedade, reserva, quarto).
CREATE UNIQUE INDEX IF NOT EXISTS stays_external_room_uniq
  ON stays ("propertyId", "externalId", "externalRoomId")
  WHERE "externalId" IS NOT NULL;

-- 2) Espelho das reservas recebidas do HUNIT ---------------------------------
-- Estado + auditoria + idempotência do polling. `payload` guarda a reserva
-- parseada SEM o elemento payment (dados de cartão nunca tocam o banco).
CREATE TABLE IF NOT EXISTS hsystem_reservations (
  "propertyId" text NOT NULL,
  "locatorId" text NOT NULL,
  "portalId" integer,
  "portalName" text,
  "channelReservationId" text,
  status text,
  payload jsonb,
  "contentHash" text,
  "guestName" text,
  "checkIn" date,
  "checkOut" date,
  "totalValue" numeric,
  "collectType" text,
  "paymentType" integer,
  "stayGroupId" text,
  "stayIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  action text,
  "actionDetail" text,
  error text,
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "processedAt" timestamptz,
  "confirmedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("propertyId", "locatorId")
);

CREATE INDEX IF NOT EXISTS hsystem_reservations_recent_idx
  ON hsystem_reservations ("propertyId", "receivedAt" DESC);

-- 3) Log de sincronização (bookings / availability / kpi) ---------------------
CREATE TABLE IF NOT EXISTS hsystem_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "propertyId" text NOT NULL,
  kind text NOT NULL,
  ok boolean NOT NULL DEFAULT true,
  "itemCount" integer NOT NULL DEFAULT 0,
  detail jsonb,
  error text,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "finishedAt" timestamptz
);

CREATE INDEX IF NOT EXISTS hsystem_sync_log_prop_idx
  ON hsystem_sync_log ("propertyId", "startedAt" DESC);

-- 4) Acesso: só service-role (mesmo modelo de property_secrets) ---------------
ALTER TABLE hsystem_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hsystem_sync_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hsystem_reservations FROM anon, authenticated;
REVOKE ALL ON hsystem_sync_log FROM anon, authenticated;
