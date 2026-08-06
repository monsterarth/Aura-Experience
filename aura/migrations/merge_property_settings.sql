-- =============================================================================
-- properties.settings — escrita parcial segura
-- =============================================================================
-- Cinco lugares diferentes faziam read-modify-write do objeto `settings` INTEIRO:
--   admin/core/properties/[id]  ·  admin/core/resort-map  ·  fb-service
--   wedding-service             ·  api/admin/area-reviews
-- Duas abas salvando ao mesmo tempo → a última apaga o que a outra gravou, calada.
-- (É o motivo documentado de patrimonio/etiquetas ter fugido para o localStorage.)
--
-- A função troca o "reescreve tudo" por um merge no banco, dentro do UPDATE.
--
-- O merge é RASO (`||`), de propósito: a unidade de concorrência passa a ser a
-- chave de PRIMEIRO nível, o que é previsível e legível. Consequência a saber de
-- cor: quem mexe em fbSettings.breakfast.enabled manda o fbSettings INTEIRO.
-- Merge profundo tornaria "apagar uma chave aninhada" inexprimível.
--
-- SECURITY DEFINER + grants revogados = só a service-role chama, ou seja, só
-- código de servidor. É o que força toda escrita a passar por uma rota com
-- requirePropertyAccess e allowlist de chaves.
--
-- Aplicar ANTES do deploy. Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.merge_property_settings(p_id TEXT, p_patch JSONB)
RETURNS JSONB
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.properties
     SET settings = COALESCE(settings, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb)
   WHERE id = p_id
  RETURNING settings;
$$;

-- Ordem importa: revoga geral e devolve o EXECUTE só ao service_role. Sem o GRANT
-- explícito, revogar PUBLIC pode derrubar o acesso do próprio servidor, já que é de
-- PUBLIC que o EXECUTE costuma vir.
REVOKE ALL ON FUNCTION public.merge_property_settings(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_property_settings(TEXT, JSONB) TO service_role;

-- Verificação (não altera nada — patch vazio):
-- SELECT jsonb_object_keys(public.merge_property_settings('fazenda-do-rosa', '{}'::jsonb));
