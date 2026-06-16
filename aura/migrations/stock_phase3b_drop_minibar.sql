-- =============================================================================
-- MÓDULO ESTOQUE — FASE 3B: aposentar o Frigobar legado
-- =============================================================================
-- Os itens do frigobar foram migrados para o Concierge (grupo "Frigobar") e o
-- lançamento agora passa pelo pipeline do Concierge. As tabelas legadas saem.
-- Aplicar SÓ depois que o código da 3B estiver no ar (nenhuma referência resta).
-- =============================================================================
DROP TABLE IF EXISTS public.minibar_cabin_overrides;
DROP TABLE IF EXISTS public.minibar_items;
