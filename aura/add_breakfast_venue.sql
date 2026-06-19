-- Marca uma estrutura como o "salão do café da manhã".
-- A estrutura marcada vira a fonte única do horário do café (operatingHours)
-- e da localização no mapa (mapPin) usados pelo Portal do Hóspede 2.0.
-- Rodar no Supabase ANTES de usar o toggle/seletor de café.

ALTER TABLE structures
  ADD COLUMN IF NOT EXISTS "isBreakfastVenue" boolean NOT NULL DEFAULT false;

-- Exclusividade (no máximo uma por propriedade) é garantida na aplicação
-- (StructureService.setBreakfastVenue limpa as demais ao definir uma nova).
