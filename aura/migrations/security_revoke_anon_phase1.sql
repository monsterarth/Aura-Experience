-- =============================================================================
-- SEGURANÇA — FASE 0C: revogar a chave ANON nas tabelas sem caminho anônimo
-- =============================================================================
-- A `anon` é a chave PÚBLICA: ela viaja no bundle JS de toda página do portal do
-- hóspede. Qualquer pessoa abre o DevTools, copia e consulta o PostgREST.
--
-- Sondagem em produção (2026-08-06) mostrou 19 tabelas legíveis pela anon. Estas
-- cinco não têm NENHUM caminho anônimo — auditadas uma a uma:
--
--   contacts (968)          → só contact-service (UI autenticada), /api/admin/contacts
--                             e o webhook da Evolution (service-role).
--   audit_logs (12.092)     → AuditService escreve pelo browser como AUTHENTICATED;
--                             revogar só a anon não afeta. Leitura é /admin/logs.
--   staff (35)              → admin/login/page.tsx:41 consulta DEPOIS do
--                             signInWithPassword (:33), ou seja, já com sessão.
--                             /api/admin/auth/me usa service-role.
--   maintenance_tasks (22)  → a superfície pública (/p/[code] e "relatar problema"
--                             na cabana) passa por asset-public-service.ts e pelas
--                             server actions issue-actions/dnd-actions, todas
--                             supabaseAdmin. Apps de campo são autenticados.
--   checklists (7)          → housekeeping-service, consumido por admin e app da
--                             camareira — ambos autenticados.
--
-- FORA desta fase de propósito: properties, stays, guests, cabins, structures,
-- structure_bookings, events, breakfast_sessions, breakfast_tables, map_pois,
-- folio_items, automation_rules, message_templates, housekeeping_tasks — o portal
-- do hóspede lê essas pelo navegador hoje. Elas só caem depois da fase 0D
-- (migrar o portal para rotas /api/guest/* com service-role).
--
-- REVERSÃO: trocar REVOKE por GRANT nas mesmas linhas. É por isso que a fase 0
-- começa por REVOKE e não por RLS — um comando fecha, um comando abre.
--
-- Aplicar no SQL Editor. Idempotente.
-- =============================================================================

REVOKE ALL PRIVILEGES ON TABLE public.contacts           FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.audit_logs         FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.staff              FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.maintenance_tasks  FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.checklists         FROM anon;

-- Verificação (esperado: nenhuma linha para anon nestas cinco):
-- SELECT table_name, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE grantee = 'anon'
--    AND table_name IN ('contacts','audit_logs','staff','maintenance_tasks','checklists');
--
-- A prova de verdade é a sonda: as cinco devem virar NEGADO [42501].
