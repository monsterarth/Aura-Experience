-- Cabanas fora da ocupação (extras / uso da casa).
-- Rodar no Supabase Dashboard. Linhas existentes recebem false (comportamento atual).
ALTER TABLE cabins
  ADD COLUMN IF NOT EXISTS "ignoreInOccupancy" BOOLEAN NOT NULL DEFAULT false;
