-- =============================================================================
-- MÓDULO ESTOQUE — FASE 1 (ajuste): mídia do patrimônio
-- Fotos: imageUrl (produto, já existe) + specImageUrl (etiqueta de especificações)
-- Documentos: invoiceUrl (nota fiscal, PDF/imagem) + warrantyDocUrl (já existe)
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- =============================================================================
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS "specImageUrl" TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS "invoiceUrl"   TEXT;
