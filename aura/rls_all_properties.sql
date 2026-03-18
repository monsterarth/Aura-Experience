-- ============================================================
-- RLS: Isolamento Total por Propriedade
-- Rodar no Supabase Dashboard > SQL Editor
-- ============================================================
-- staff.id é TEXT; auth.uid() é UUID → cast necessário: auth.uid()::text
-- ============================================================

-- ============================================================
-- FUNÇÕES AUXILIARES (SECURITY DEFINER para performance)
-- ============================================================

CREATE OR REPLACE FUNCTION auth_property_id()
RETURNS text AS $$
  SELECT "propertyId" FROM staff WHERE id = auth.uid()::text
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff WHERE id = auth.uid()::text AND role = 'super_admin'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ============================================================
-- HELPER interno: aplica política em uma tabela se ela existir
-- p_col: nome da coluna de propriedade (default: "propertyId" camelCase)
-- ============================================================
CREATE OR REPLACE FUNCTION _apply_property_rls(p_table text, p_col text DEFAULT 'propertyId')
RETURNS void AS $$
DECLARE
  col_ref text;
BEGIN
  -- Gera referência à coluna: snake_case sem aspas, camelCase com aspas
  IF p_col = lower(p_col) THEN
    col_ref := p_col;  -- snake_case: property_id
  ELSE
    col_ref := '"' || p_col || '"';  -- camelCase: "propertyId"
  END IF;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "Allow all to authenticated users" ON public.%I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "Allow ALL on %s" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "property_scoped_all" ON public.%I', p_table);
  EXECUTE format(
    'CREATE POLICY "property_scoped_all" ON public.%I
     FOR ALL TO authenticated
     USING (is_super_admin() OR %s = auth_property_id())
     WITH CHECK (is_super_admin() OR %s = auth_property_id())',
    p_table, col_ref, col_ref
  );
  RAISE NOTICE 'RLS aplicado: % (col: %)', p_table, col_ref;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'Tabela não existe, pulando: %', p_table;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- TABELAS COM "propertyId" (camelCase)
-- ============================================================
DO $$ BEGIN
  PERFORM _apply_property_rls('cabins');
  PERFORM _apply_property_rls('stays');
  PERFORM _apply_property_rls('guests');
  PERFORM _apply_property_rls('structures');
  PERFORM _apply_property_rls('structure_bookings');
  PERFORM _apply_property_rls('housekeeping_tasks');
  PERFORM _apply_property_rls('maintenance_tasks');
  PERFORM _apply_property_rls('concierge_items');
  PERFORM _apply_property_rls('concierge_requests');
  PERFORM _apply_property_rls('events');
  PERFORM _apply_property_rls('messages');
  PERFORM _apply_property_rls('message_templates');
  PERFORM _apply_property_rls('automation_rules');
  PERFORM _apply_property_rls('survey_categories');
  PERFORM _apply_property_rls('survey_templates');
  PERFORM _apply_property_rls('survey_responses');
  PERFORM _apply_property_rls('survey_insights');
  PERFORM _apply_property_rls('contacts');
  PERFORM _apply_property_rls('checklists');
  PERFORM _apply_property_rls('audit_logs');
  PERFORM _apply_property_rls('folio_items');
  PERFORM _apply_property_rls('breakfast_sessions');
  PERFORM _apply_property_rls('breakfast_tables');
  PERFORM _apply_property_rls('breakfast_attendance');
  PERFORM _apply_property_rls('breakfast_visitors');
  PERFORM _apply_property_rls('system_bugs');
END $$;

-- ============================================================
-- TABELAS COM property_id (snake_case) — tabelas F&B
-- ============================================================
DO $$ BEGIN
  PERFORM _apply_property_rls('fb_categories',  'property_id');
  PERFORM _apply_property_rls('fb_menu_items',  'property_id');
  PERFORM _apply_property_rls('fb_orders',      'property_id');
END $$;


-- ============================================================
-- STAFF (tratamento especial)
-- SELECT: super_admin vê todos; outros veem sua propriedade + si mesmo
-- WRITE: super_admin faz tudo; staff edita apenas o próprio registro
-- ============================================================
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all to authenticated users" ON public.staff;
DROP POLICY IF EXISTS "Allow ALL on staff" ON public.staff;
DROP POLICY IF EXISTS "staff_select" ON public.staff;
DROP POLICY IF EXISTS "staff_write" ON public.staff;

CREATE POLICY "staff_select" ON public.staff
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR id = auth.uid()::text
    OR "propertyId" = auth_property_id()
  );

CREATE POLICY "staff_write" ON public.staff
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR id = auth.uid()::text
  )
  WITH CHECK (
    is_super_admin()
    OR id = auth.uid()::text
  );


-- ============================================================
-- PROPERTIES (tratamento especial)
-- SELECT: qualquer autenticado pode ler (seletor do sidebar)
-- WRITE: apenas super_admin
-- ============================================================
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all to authenticated users" ON public.properties;
DROP POLICY IF EXISTS "Allow ALL on properties" ON public.properties;
DROP POLICY IF EXISTS "properties_select" ON public.properties;
DROP POLICY IF EXISTS "properties_write" ON public.properties;

CREATE POLICY "properties_select" ON public.properties
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "properties_write" ON public.properties
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ============================================================
-- LIMPEZA da função helper temporária
-- ============================================================
DROP FUNCTION IF EXISTS _apply_property_rls(text);
