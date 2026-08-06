-- =============================================================================
-- SEGURANÇA — FASE 0B: segredos de integração fora do alcance do navegador
-- =============================================================================
-- Hoje a apiKey da Evolution e o token do Chatwoot moram em
-- properties.settings.whatsappConfig. A tabela `properties` é legível pela chave
-- ANON (pública, vai no bundle do navegador) — sondagem de 2026-08-06 confirmou
-- que dá para ler os segredos das 3 propriedades sem nenhum login.
--
-- A correção NÃO é esconder o campo na UI (o valor continuaria no JSON): é tirar
-- o segredo de uma tabela que o navegador consegue ler.
--
--   property_secrets  → RLS ligada e ZERO policies + REVOKE de anon/authenticated.
--                       Só a service-role (que ignora RLS) entra. Ou seja: só
--                       código de servidor.
--
-- Ficam em settings.whatsappConfig os campos NÃO secretos (apiUrl, instanceName,
-- chatwootUrl, chatwootAccountId, chatwootInboxId) — GuestContactModal.tsx:89 e
-- admin/comunicacao/page.tsx:31 leem esses pelo navegador e continuam funcionando.
--
-- O backfill COPIA, não move: as chaves seguem em settings até o código novo
-- rodar um ciclo em produção. Assim o rollback é reverter o deploy, sem migration
-- de volta. A limpeza sai numa migration posterior (fase 7).
--
-- Aplicar ANTES do deploy. Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.property_secrets (
  "propertyId"  TEXT PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  secrets       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS ligada SEM nenhuma policy = ninguém autenticado passa. A service-role
-- ignora RLS por definição, então o servidor continua lendo.
ALTER TABLE public.property_secrets ENABLE ROW LEVEL SECURITY;

-- Cinto e suspensório: mesmo que alguém crie uma policy sem querer, sem GRANT
-- não há acesso.
REVOKE ALL PRIVILEGES ON TABLE public.property_secrets FROM anon, authenticated;

-- Backfill: copia os dois segredos de quem já os tem.
INSERT INTO public.property_secrets ("propertyId", secrets)
SELECT p.id,
       jsonb_strip_nulls(jsonb_build_object(
         'evolutionApiKey',  p.settings->'whatsappConfig'->>'apiKey',
         'chatwootApiToken', p.settings->'whatsappConfig'->>'chatwootApiToken'
       ))
  FROM public.properties p
 WHERE p.settings->'whatsappConfig' IS NOT NULL
ON CONFLICT ("propertyId") DO NOTHING;

-- Verificação (roda como service-role no SQL Editor):
-- SELECT "propertyId", jsonb_object_keys(secrets) FROM public.property_secrets;
-- Esperado: fazenda-do-rosa (evolutionApiKey) e fazenda-modelo-aura
-- (evolutionApiKey, chatwootApiToken). A prova final é a sonda: property_secrets
-- deve aparecer como NEGADO no passe anon E no passe autenticado.
