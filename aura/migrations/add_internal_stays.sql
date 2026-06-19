-- Reservas de "uso da casa" (ocupação interna).
-- Rodar no Supabase Dashboard.
-- guestId passa a ser opcional (reserva interna pode não ter hóspede real).
ALTER TABLE stays ALTER COLUMN "guestId" DROP NOT NULL;

ALTER TABLE stays ADD COLUMN IF NOT EXISTS "internalUse"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stays ADD COLUMN IF NOT EXISTS "internalLabel" TEXT;

-- O interruptor mestre de automações vive no JSONB automationFlags (campo `enabled`);
-- ausência é tratada como habilitado no código, então não há migração de coluna para ele.
