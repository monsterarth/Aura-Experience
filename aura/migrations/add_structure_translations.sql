-- Traduções inline (i18n) para estruturas exibidas no mapa do hóspede.
-- Padrão do projeto: colunas name/name_en/name_es e description/description_en/description_es,
-- resolvidas por preferredLanguage no render. Vazio cai no PT (coluna base).

ALTER TABLE public.structures
    ADD COLUMN IF NOT EXISTS "name_en"        TEXT,
    ADD COLUMN IF NOT EXISTS "name_es"        TEXT,
    ADD COLUMN IF NOT EXISTS "description_en" TEXT,
    ADD COLUMN IF NOT EXISTS "description_es" TEXT;
