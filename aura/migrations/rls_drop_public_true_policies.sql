-- rls_drop_public_true_policies.sql — 26/08/2026
--
-- Fatia 3 do docs/EVENTS-V2.md + as 15 tabelas que podiam vir junto.
--
-- O `USING(true)` era o padrão da casa: 63 policies em 58 tabelas. Este arquivo
-- fecha só o subconjunto SEGURO — aquele em que uma `property_scoped_all`
-- correta já existe atrás do `true` e assume no mesmo instante. As ~40 tabelas
-- sem rede (estoque, tarifário, compras, CRM) ficam para uma rodada própria,
-- porque nelas dropar o `true` CORTA o acesso.
--
-- POR QUE ISTO NÃO É TEÓRICO. Produção tem 3 propriedades com staff ativo
-- (fazenda-do-rosa 24, fazenda-modelo-aura 4, estanciadovale 2, mais o
-- super_admin). Simulando a sessão do admin de `estanciadovale` (papel
-- `authenticated` + claim `sub`), ele enxergava HOJE: 394 hóspedes, 448
-- estadias, 192 lançamentos de fólio, 1 807 tarefas de governança e 38 staff —
-- tudo da Fazenda do Rosa. Não é vazamento para fora; é vazamento entre
-- propriedades de dentro.
--
-- POR QUE É SEGURO DROPAR:
--   · quem não é super_admin fica preso ao próprio propertyId — o seletor de
--     propriedade só aparece para super_admin (PropertyContext.tsx:211-234), e
--     `is_super_admin()` está em todas as policies escopadas;
--   · zero staff ativo sem `propertyId` e zero staff sem usuário no Auth
--     (verificado) — ninguém cai no NULL de `auth_property_id()`;
--   · `staff`: a escrita já vai por `/api/admin/staff` com service-role, que não
--     passa por RLS; o navegador só LÊ, e `staff_select` cobre (próprio id OU
--     mesma propriedade OU super_admin).
--
-- REVERSÃO: cada policy abaixo era `FOR ALL TO PUBLIC USING (true) WITH CHECK
-- (true)`, exceto `Enable global read for cabins` (FOR SELECT, sem check) e
-- `Staff can manage events` (TO authenticated).

-- ============================================================
-- A · events — a fatia 3
-- ============================================================
-- A `property_scoped_all` que existia aqui comparava com
-- `auth.jwt() ->> 'propertyId'` — claim que o JWT NÃO tem (conferido em
-- auth.users: nem app_metadata nem user_metadata). Nunca casava, não tinha
-- WITH CHECK e não estava restrita a `authenticated`. Ou seja: o `USING(true)`
-- era a única coisa que dava acesso à tabela pelo navegador, e dropar sozinho
-- derrubaria o realtime da página de Eventos sem erro visível.
DROP POLICY IF EXISTS "property_scoped_all" ON public.events;
CREATE POLICY "property_scoped_all" ON public.events
  FOR ALL TO authenticated
  USING (is_super_admin() OR "propertyId" = auth_property_id())
  WITH CHECK (is_super_admin() OR "propertyId" = auth_property_id());

DROP POLICY IF EXISTS "Staff can manage events" ON public.events;

-- Letra morta: o `anon` não tem GRANT nenhum em `events` desde a remediação da
-- chave pública, e GRANT é avaliado antes da policy. Sai para não enganar quem
-- ler o schema depois.
DROP POLICY IF EXISTS "Guests can read published events" ON public.events;

-- ============================================================
-- B · as 15 tabelas que já tinham rede
-- ============================================================
DROP POLICY IF EXISTS "Public Audit" ON public.audit_logs;
DROP POLICY IF EXISTS "Public AutoRules" ON public.automation_rules;
DROP POLICY IF EXISTS "allow_all_breakfast_attendance" ON public.breakfast_attendance;
DROP POLICY IF EXISTS "allow_all_breakfast_sessions" ON public.breakfast_sessions;
DROP POLICY IF EXISTS "allow_all_breakfast_tables" ON public.breakfast_tables;
DROP POLICY IF EXISTS "Enable global insert/update for cabins" ON public.cabins;
DROP POLICY IF EXISTS "Enable global read for cabins" ON public.cabins;
DROP POLICY IF EXISTS "Public Checklists" ON public.checklists;
DROP POLICY IF EXISTS "Public Folio" ON public.folio_items;
DROP POLICY IF EXISTS "Public Guests" ON public.guests;
DROP POLICY IF EXISTS "Public Housekeeping" ON public.housekeeping_tasks;
DROP POLICY IF EXISTS "Public MsgTemplates" ON public.message_templates;
DROP POLICY IF EXISTS "Public Staff" ON public.staff;
DROP POLICY IF EXISTS "Public Stays" ON public.stays;
DROP POLICY IF EXISTS "Public Structure Bookings" ON public.structure_bookings;
DROP POLICY IF EXISTS "Public Structures" ON public.structures;

-- Conferência: nenhuma das tocadas pode ter sobrado com USING(true).
SELECT c.relname AS tabela, p.polname, p.polcmd::text AS cmd,
       coalesce((SELECT string_agg(rolname,',') FROM pg_roles WHERE oid=ANY(p.polroles)),'PUBLIC') AS papeis
FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
WHERE c.relname IN ('events','audit_logs','automation_rules','breakfast_attendance',
  'breakfast_sessions','breakfast_tables','cabins','checklists','folio_items','guests',
  'housekeeping_tasks','message_templates','staff','stays','structure_bookings','structures')
  AND pg_get_expr(p.polqual,p.polrelid) = 'true';
