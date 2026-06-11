-- =============================================================================
-- MÓDULO ESTOQUE — FASE 1 (ajuste): nota fiscal anexada à compra
-- invoiceUrl = documento da NF (PDF ou imagem) na própria compra.
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- =============================================================================
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS "invoiceUrl" TEXT;
