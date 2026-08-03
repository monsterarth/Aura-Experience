-- Autor da conferência de saída da cabana (frigobar, chave, objetos esquecidos e emprestados).
--
-- A conferência acontece no check-out, ANTES da faxina, e é sempre executada por alguém —
-- mas até aqui a rota /api/field/cabin-conference só gravava `cabinChecked = true` na
-- tarefa de turnover. Quem conferiu não ficava em lugar nenhum: se o hóspede reclamava de
-- um lançamento de frigobar ou de um objeto não devolvido, não havia nome para chamar.
-- (`stays."lostItemsReportedBy"` só existe quando houve achado, então não serve como fonte.)
--
-- Aditivo e idempotente: nenhuma linha existente é alterada. Conferências anteriores a esta
-- migration continuam sem autor — a ficha da avaliação mostra isso explicitamente em vez de
-- adivinhar (com um fallback rotulado quando houve registro de objetos esquecidos).

ALTER TABLE housekeeping_tasks
  ADD COLUMN IF NOT EXISTS "cabinCheckedBy" text,
  ADD COLUMN IF NOT EXISTS "cabinCheckedAt" timestamptz;

COMMENT ON COLUMN housekeeping_tasks."cabinCheckedBy" IS
  'staff.id de quem concluiu a conferência de saída (frigobar/chave/achados). Vem da sessão no servidor, nunca do cliente.';
COMMENT ON COLUMN housekeeping_tasks."cabinCheckedAt" IS
  'Quando a conferência de saída foi concluída.';
