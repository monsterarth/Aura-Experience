-- rls_close_public_policies.sql — 26/08/2026
--
-- FECHA UM VAZAMENTO VIVO. A chave pública (`anon`) — que viaja no JavaScript de
-- qualquer página do site — lia e ESCREVIA em três tabelas de produção:
--
--   messages            36 246 linhas · to (telefone do hóspede), body, stayId
--   communications         409 linhas
--   breakfast_visitors       4 linhas
--
-- Verificado com a própria chave contra produção: HTTP 206 e a contagem exata.
-- Não era só leitura — o `anon` tinha SELECT, INSERT, UPDATE, DELETE e TRUNCATE.
-- Em `messages` isso significa poder ENFILEIRAR mensagens que o cron
-- `process-messages` mandaria pelo WhatsApp da pousada, e poder apagar o
-- histórico inteiro.
--
-- A causa são três policies `FOR ALL TO PUBLIC USING (true)` que sobreviveram à
-- remediação da chave pública (aquela rodada revogou o GRANT de 19 tabelas; nestas
-- o grant ficou, e a policy PUBLIC o encontrou). `guests`, `events` e `stays`
-- respondem 401 — nessas o REVOKE pegou.
--
-- REVERSÃO (as definições exatas que existiam):
--   CREATE POLICY "Public Messages" ON messages FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "Public Communications" ON communications FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "allow_all_breakfast_visitors" ON breakfast_visitors FOR ALL USING (true) WITH CHECK (true);
--   GRANT ALL ON <tabela> TO anon;

-- 1) `communications` é a única das três SEM escopo por propriedade — dropar a
--    policy pública sem isto tiraria o acesso do staff (contact-service.ts e
--    GuestContactModal.tsx escrevem pelo navegador, autenticados). As 409 linhas
--    têm propertyId preenchido, então ninguém some da tela.
DROP POLICY IF EXISTS "property_scoped_all" ON public.communications;
CREATE POLICY "property_scoped_all" ON public.communications
  FOR ALL TO authenticated
  USING (is_super_admin() OR "propertyId" = auth_property_id())
  WITH CHECK (is_super_admin() OR "propertyId" = auth_property_id());

-- 2) As três policies públicas saem. `messages` e `breakfast_visitors` já têm
--    `property_scoped_all` com a expressão correta e WITH CHECK — o staff
--    continua lendo e escrevendo, e o realtime segue funcionando.
DROP POLICY IF EXISTS "Public Messages" ON public.messages;
DROP POLICY IF EXISTS "Public Communications" ON public.communications;
DROP POLICY IF EXISTS "allow_all_breakfast_visitors" ON public.breakfast_visitors;

-- 3) Cinto e suspensório: sem GRANT, nem uma policy nova mal escrita reabre.
--    Nenhum caminho do app usa a chave pública nestas tabelas — o portal do
--    hóspede passa por /api/guest/* (service-role) e o whatsapp-service não fala
--    com o Supabase.
REVOKE ALL ON public.messages FROM anon;
REVOKE ALL ON public.communications FROM anon;
REVOKE ALL ON public.breakfast_visitors FROM anon;

-- Conferência: as três não podem sobrar com policy alcançável pelo anon.
SELECT c.relname AS tabela, p.polname,
       coalesce((SELECT string_agg(rolname,',') FROM pg_roles WHERE oid = ANY(p.polroles)),'PUBLIC') AS papeis
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname IN ('messages','communications','breakfast_visitors')
ORDER BY 1, 2;
