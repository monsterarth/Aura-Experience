-- =============================================================================
-- LIMPEZA — apagar a cópia em texto puro dos segredos de integração
-- =============================================================================
-- A migration property_secrets.sql COPIOU (não moveu) a apiKey da Evolution e o
-- token do Chatwoot para o cofre, de propósito: enquanto o código novo não tinha
-- rodado um ciclo em produção, o rollback precisava ser só reverter o deploy.
--
-- Rodou. O portal e o admin usam o cofre há vários deploys, e nenhum leitor do
-- texto puro sobrou no código (só o fallback, removido junto com esta migration).
-- Agora a cópia sai de `properties.settings.whatsappConfig`.
--
-- Conferido antes de escrever (service-role, 2026-08-08):
--   fazenda-do-rosa      apiKey ...C393  → cofre idêntico
--   fazenda-modelo-aura  apiKey ...324A  + chatwootApiToken ...WRLJ → cofre idêntico
--   estanciadovale       sem whatsappConfig
--   `token`              vazio nas três (chave legada, sai junto)
--
-- A GUARDA do WHERE é o que torna isto seguro: a linha só é limpa se o valor já
-- estiver no cofre, byte a byte. Propriedade com segredo fora do cofre é PULADA
-- em vez de perder a credencial — este é o tipo de UPDATE que não tem desfazer.
--
-- Aplicar DEPOIS do deploy que remove o fallback (ou junto; a ordem não quebra,
-- porque o cofre já tem tudo).
-- =============================================================================

UPDATE public.properties p
   SET settings = jsonb_set(
         p.settings,
         '{whatsappConfig}',
         (p.settings -> 'whatsappConfig') - 'apiKey' - 'chatwootApiToken' - 'token'
       )
 WHERE p.settings ? 'whatsappConfig'
   -- apiKey: ausente/vazia, ou idêntica à do cofre
   AND (
     COALESCE(p.settings -> 'whatsappConfig' ->> 'apiKey', '') = ''
     OR EXISTS (
       SELECT 1 FROM public.property_secrets s
        WHERE s."propertyId" = p.id
          AND s.secrets ->> 'evolutionApiKey' = p.settings -> 'whatsappConfig' ->> 'apiKey'
     )
   )
   -- chatwootApiToken: mesma regra
   AND (
     COALESCE(p.settings -> 'whatsappConfig' ->> 'chatwootApiToken', '') = ''
     OR EXISTS (
       SELECT 1 FROM public.property_secrets s
        WHERE s."propertyId" = p.id
          AND s.secrets ->> 'chatwootApiToken' = p.settings -> 'whatsappConfig' ->> 'chatwootApiToken'
     )
   );

-- ── PROVA, no mesmo apertar de botão ─────────────────────────────────────────
-- ESPERADO: nenhuma linha. Qualquer linha é uma propriedade que ainda carrega
-- segredo em texto puro — provavelmente porque o cofre não batia e a guarda a
-- pulou, que é o comportamento desejado.
SELECT p.id AS propriedade,
       CASE WHEN COALESCE(p.settings->'whatsappConfig'->>'apiKey','') <> ''           THEN 'apiKey ' END ||
       CASE WHEN COALESCE(p.settings->'whatsappConfig'->>'chatwootApiToken','') <> '' THEN 'chatwootApiToken ' END ||
       CASE WHEN COALESCE(p.settings->'whatsappConfig'->>'token','') <> ''            THEN 'token' END
         AS ainda_em_texto_puro
  FROM public.properties p
 WHERE COALESCE(p.settings->'whatsappConfig'->>'apiKey','') <> ''
    OR COALESCE(p.settings->'whatsappConfig'->>'chatwootApiToken','') <> ''
    OR COALESCE(p.settings->'whatsappConfig'->>'token','') <> '';
