-- Status operacional por UNIDADE de uma estrutura (ex: uma das duas jacuzzis quebrada).
--
-- Contexto: a trava diária (requiresDailyRelease/releasedForDate) vale para a estrutura
-- inteira. Quando uma única unidade sai de operação, a recepção não tinha onde registrar
-- isso — e passou a lançar 5 maintenance_block por dia (um por slot) só para escondê-la.
-- Esta coluna guarda esse estado de forma PERSISTENTE: marca uma vez, sai da agenda até
-- alguém devolver à operação. Não reseta à meia-noite (ao contrário da liberação diária).
--
-- Formato: { "<unitId>": { "status": "maintenance", "note": "bomba queimada",
--                          "since": "2026-08-30T12:00:00.000Z", "byName": "Fulano" } }
-- Unidade AUSENTE do mapa = disponível. Só unidade fora de operação ganha chave.

ALTER TABLE public.structures
    ADD COLUMN IF NOT EXISTS "unitStatus" JSONB;
