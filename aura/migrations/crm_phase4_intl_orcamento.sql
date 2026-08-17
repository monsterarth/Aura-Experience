-- ═══════════════════════════════════════════════════════════════════════════
-- CRM fase 4 — ORÇAMENTO INTERNACIONAL: documento além do CPF + idioma do
-- hóspede em 3 idiomas (PT/EN/ES).
--
--   rate_quotes += "clientDocumentType" — tipo do documento do lead (FNRH ID:
--   CPF/PASSAPORTE/RG/DNI/CNH/OUTRO), default 'CPF'. Documento internacional
--   (DNI, passaporte) deixa de ser forçado a caber no formato de CPF.
--
--   rate_quotes += "clientLanguage" — idioma falado pelo hóspede (pt/en/es),
--   default 'pt', escolhido pelo vendedor no wizard. Rege o idioma da
--   proposta pública (/cotacao/<id>) e qual variante dos templates de
--   WhatsApp é copiada.
--
--   rate_settings += 6 colunas "_en"/"_es" — as 3 mensagens de WhatsApp
--   (mensagem principal, bloco por cabana, aviso de evento) em inglês e
--   espanhol, ao lado das colunas PT já existentes.
--
--   rate_settings += 2 colunas "_en"/"_es" — "O que está incluso" (texto da
--   proposta pública) em inglês e espanhol.
--
--   Vazio nas colunas novas = cai no texto PT (mesmo comportamento de
--   fallback que name_en/name_es já têm em outras tabelas do projeto).
--
-- Idempotente e aditiva: nenhuma coluna existente muda de tipo ou é removida.
-- Aplicar no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.rate_quotes
  ADD COLUMN IF NOT EXISTS "clientDocumentType" TEXT DEFAULT 'CPF',
  ADD COLUMN IF NOT EXISTS "clientLanguage"     TEXT DEFAULT 'pt';

ALTER TABLE public.rate_settings
  ADD COLUMN IF NOT EXISTS "msgTemplate_en"       TEXT,
  ADD COLUMN IF NOT EXISTS "msgTemplate_es"       TEXT,
  ADD COLUMN IF NOT EXISTS "msgSingleTemplate_en" TEXT,
  ADD COLUMN IF NOT EXISTS "msgSingleTemplate_es" TEXT,
  ADD COLUMN IF NOT EXISTS "eventTemplate_en"     TEXT,
  ADD COLUMN IF NOT EXISTS "eventTemplate_es"     TEXT,
  ADD COLUMN IF NOT EXISTS "inclusionsText_en"    TEXT,
  ADD COLUMN IF NOT EXISTS "inclusionsText_es"    TEXT;

-- Backfill: linhas existentes não têm o default aplicado retroativamente por
-- padrão em algumas versões — garante que nada fique NULL onde deveria ser
-- 'CPF'/'pt'.
UPDATE public.rate_quotes SET "clientDocumentType" = 'CPF' WHERE "clientDocumentType" IS NULL;
UPDATE public.rate_quotes SET "clientLanguage"      = 'pt'  WHERE "clientLanguage" IS NULL;

-- ── Conferência ─────────────────────────────────────────────────────────────

SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'rate_quotes'
   AND column_name IN ('clientDocumentType', 'clientLanguage');

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'rate_settings'
   AND column_name LIKE '%\_en' ESCAPE '\'
    OR column_name LIKE '%\_es' ESCAPE '\';
