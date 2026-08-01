-- Colunas de "faxina não realizada" em housekeeping_tasks.
--
-- O código (skipTask, DND do portal do hóspede, motor de regras, Kanban de governança)
-- escreve e lê "skippedAt"/"guestName" desde a implementação do status 'skipped', mas as
-- colunas nunca existiram no banco. Resultado: o UPDATE do "Pular" era rejeitado pelo
-- PostgREST ("column does not exist"), o erro era ignorado no serviço e a tarefa continuava
-- 'pending' — a camareira via o cartão sumir (otimista) e voltar no refetch seguinte.
--
-- Aditivo e idempotente: nenhuma linha existente é alterada.

ALTER TABLE housekeeping_tasks
  ADD COLUMN IF NOT EXISTS "skippedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "guestName" text;

COMMENT ON COLUMN housekeeping_tasks."skippedAt" IS
  'Quando a faxina foi marcada como não realizada (recusa do hóspede no app da camareira ou DND).';
COMMENT ON COLUMN housekeeping_tasks."guestName" IS
  'Nome do hóspede desnormalizado no momento do skip por DND — exibido no Kanban de governança.';
