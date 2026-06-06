-- Liberação diária de estruturas (ex: jacuzzi que precisa ser limpa/aquecida antes de liberar).
-- requiresDailyRelease: marca a estrutura como bloqueada por padrão a cada dia.
-- releasedForDate: a data (YYYY-MM-DD) para a qual a recepção liberou o uso.
--   A estrutura conta como liberada apenas quando releasedForDate == data de hoje,
--   então o bloqueio volta sozinho à meia-noite (sem cron). NULL = nunca liberada.

ALTER TABLE public.structures
    ADD COLUMN IF NOT EXISTS "requiresDailyRelease" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "releasedForDate"      TEXT;
