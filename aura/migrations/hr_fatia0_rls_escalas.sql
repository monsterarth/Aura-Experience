-- migrations/hr_fatia0_rls_escalas.sql
--
-- RH v2 — fatia 0. Fecha o vazamento medido em 03/09/2026 (docs/HR-V2.md §1.7).
--
-- `staff_schedules` e `staff_schedule_overrides` tinham cada uma uma política de
-- SELECT com `auth.role() = 'authenticated'` — sem filtro de propriedade e sem
-- filtro de pessoa. Na prática: QUALQUER usuário logado lia a folga e o horário
-- de QUALQUER funcionário de QUALQUER propriedade.
--
-- Por que apagar em vez de escopar por "propertyId": ninguém lê essas tabelas
-- pelo client do browser. Os dois leitores são rotas de API que usam
-- `supabaseAdmin` (service role, que ignora RLS) e já filtram por propriedade à
-- mão — `api/admin/staff/schedule-overrides/route.ts:36` e
-- `api/admin/staff/schedules/route.ts`. Uma política escopada seria código morto
-- com aparência de proteção.
--
-- O alvo é o mesmo estado que `time_clock_events` e `staff_schedule_checkpoints`
-- já têm hoje e que está CORRETO: RLS ligada, zero política — nega tudo fora do
-- service role. Não "consertar" essas duas depois achando que falta política.
--
-- Reversível: para voltar, recrie a política com o mesmo nome. Mas não recrie a
-- versão `authenticated`.
--
-- Estas tabelas morrem na fatia 1 (decisão 10 — zerar). Este arquivo existe
-- porque a fatia 1 não é hoje, e o vazamento é hoje.
--
-- Aplicar:  pnpm db:sql migrations/hr_fatia0_rls_escalas.sql               (DEV)
--           pnpm db:sql migrations/hr_fatia0_rls_escalas.sql --target prod

DROP POLICY IF EXISTS staff_schedules_select          ON staff_schedules;
DROP POLICY IF EXISTS staff_schedule_overrides_select ON staff_schedule_overrides;

-- A política de service_role fica. Confere: ambas as tabelas devem terminar com
-- RLS ligada e apenas a política `*_all` de service_role.
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('staff_schedules', 'staff_schedule_overrides')
    AND qual LIKE '%authenticated%';

  IF n > 0 THEN
    RAISE EXCEPTION 'Ainda existem % política(s) com authenticated nessas tabelas', n;
  END IF;
END $$;
