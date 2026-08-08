-- =============================================================================
-- SEGURANÇA — FASE 0E: revogar a chave ANON nas tabelas do portal do hóspede
-- =============================================================================
-- Fecha o buraco que abriu esta frente: a chave `anon` viaja no bundle JS de toda
-- página do portal. Qualquer pessoa abria o DevTools, copiava e lia a base inteira.
-- A sondagem de 2026-08-06 mostrava, sem nenhum login:
--
--     stays 386 · guests 340 · structure_bookings 510 · folio_items 177
--     housekeeping_tasks 1437 · breakfast_sessions 435 · properties 3 · cabins 50
--
-- Só é seguro aplicar porque a fase 0D já está EM PRODUÇÃO: o portal não lê nem
-- escreve mais direto no banco — tudo passa por /api/guest/* com service-role e
-- posse validada pelo código de acesso (ou pelo UUID da estadia, no formulário).
--
-- AUDITORIA feita antes de escrever isto (o que sustenta cada linha):
--   • src/app/check-in/**  → só GuestApi + FnrhService (mock estático, sem banco).
--   • src/app/p/[code]     → asset-public-service, que é supabaseAdmin.
--   • feedback, equipe, termos → nenhum acesso direto.
--   • supabase-middleware  → lê `properties` com supabaseAdmin (roteia domínio
--                            customizado); revogar anon NÃO o afeta.
--   • triggerAutomation (client) só roda dentro de performCheckIn, na tela admin
--     autenticada; a variante de servidor é triggerAutomationAdmin (supabaseAdmin).
--   • folio_items e housekeeping_tasks: nenhum caminho anônimo.
--   • O Realtime anon da tela de estruturas foi REMOVIDO na 0D-4 (virou polling) —
--     era o que morreria calado exatamente aqui.
--
-- ROLLBACK: troque REVOKE por GRANT ALL nas mesmas linhas. É por isso que a
-- estratégia é REVOKE e não RLS: um comando fecha, um comando abre.
--
-- DEPOIS DE APLICAR, rodar a sonda: as 14 devem virar NEGADO [42501], e o portal
-- precisa ser percorrido com um código real (início, café, concierge, estruturas,
-- mapa, eventos e o formulário de pré-check-in).
-- =============================================================================

-- Núcleo da hospedagem (o dado de hóspede de verdade)
REVOKE ALL PRIVILEGES ON TABLE public.properties          FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.stays               FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.guests              FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.cabins              FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.folio_items         FROM anon;

-- Áreas, agenda e conteúdo
REVOKE ALL PRIVILEGES ON TABLE public.structures          FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.structure_bookings  FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.events              FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.map_pois            FROM anon;

-- Café da manhã
REVOKE ALL PRIVILEGES ON TABLE public.breakfast_sessions   FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.breakfast_tables     FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.breakfast_attendance FROM anon;

-- Operação interna que nunca teve caminho anônimo
REVOKE ALL PRIVILEGES ON TABLE public.housekeeping_tasks  FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.automation_rules    FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.message_templates   FROM anon;

-- ── PROVA, no mesmo apertar de botão ─────────────────────────────────────────
-- Este SELECT fecha o arquivo de propósito: o painel de resultado passa a ser a
-- verificação. Na primeira tentativa o script não chegou a valer (os 15 grants
-- continuaram intactos) e só descobrimos isso numa consulta separada — com o
-- SELECT aqui, "rodou" e "funcionou" deixam de ser coisas diferentes.
--
-- ESPERADO: nenhuma linha ("no rows returned" / resultado vazio).
-- Qualquer linha que aparecer é uma tabela que continua aberta para a chave anon.
SELECT table_name,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS ainda_aberto_para_anon
  FROM information_schema.role_table_grants
 WHERE grantee = 'anon' AND table_schema = 'public'
   AND table_name IN ('properties','stays','guests','cabins','folio_items',
       'structures','structure_bookings','events','map_pois',
       'breakfast_sessions','breakfast_tables','breakfast_attendance',
       'housekeeping_tasks','automation_rules','message_templates')
 GROUP BY table_name
 ORDER BY table_name;
